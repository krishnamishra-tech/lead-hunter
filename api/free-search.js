// POST /api/free-search
// Server-side proxy for OpenStreetMap's Nominatim (geocoding) and Overpass
// (place data) — both free, no API key, no billing. This MUST run server-side
// rather than being called directly from the browser:
//
// 1. Nominatim's usage policy requires a real identifying User-Agent/Referer
//    header on every request. Browsers refuse to let JavaScript set a custom
//    User-Agent (it's a "forbidden header"), so direct browser calls get
//    rejected or silently fail — that's the "Failed to fetch" bug this fixes.
// 2. Some Overpass mirrors don't send CORS headers for arbitrary origins,
//    which browsers block outright regardless of the request succeeding.
// 3. Running this server-side also lets us rate-limit politely (Nominatim
//    asks for max ~1 request/second) so LocalScout's server IP doesn't get
//    blocked from these shared free services.
//
// SECURITY: same login-gating + daily cap pattern as the other search
// endpoints, so this can't be hammered by someone outside the app either.
const { verifyUser, supabaseAdmin } = require('./_lib/verifyUser');

const DAILY_LIMIT = 200;
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];
// Identifies this app to OpenStreetMap's services, as their usage policy requires.
const OSM_USER_AGENT = 'LocalScout/1.0 (+https://github.com/krishnamishra-tech/lead-hunter)';

const OSM_NICHE_TAGS = {
  real_estate: ['office=estate_agent'],
  cafes: ['amenity=cafe'],
  salons: ['shop=hairdresser', 'shop=beauty'],
  dentists: ['amenity=dentist'],
  gyms: ['leisure=fitness_centre'],
  restaurants: ['amenity=restaurant'],
  interior_designers: ['shop=interior_decoration'],
  architects: ['office=architect'],
  boutiques: ['shop=boutique'],
  yoga_studios: ['sport=yoga', 'leisure=fitness_centre'],
  photographers: ['shop=photo'],
  clinics: ['amenity=clinic', 'amenity=doctors'],
  pet_services: ['shop=pet', 'shop=pet_grooming'],
  spas: ['leisure=spa', 'shop=beauty'],
  clothing_boutiques: ['shop=clothes'],
  bakeries: ['shop=bakery'],
  tuition_centers: ['amenity=language_school'],
  travel_agents: ['shop=travel_agency'],
  jewellers: ['shop=jewelry'],
  furniture_stores: ['shop=furniture'],
  car_dealers: ['shop=car', 'shop=car_repair'],
  law_firms: ['office=lawyer'],
  ca_firms: ['office=accountant'],
  daycare: ['amenity=childcare', 'amenity=kindergarten'],
  hotels: ['tourism=hotel', 'tourism=guest_house'],
  wedding: ['shop=photo'],
};

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function geocodeLocation(query) {
  const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': OSM_USER_AGENT },
  });
  if (!res.ok) throw new Error('Geocoding failed');
  const data = await res.json();
  if (!data.length) throw new Error(`Could not locate "${query}"`);
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

function buildOverpassQuery(tagFilters, lat, lon, radiusMeters) {
  const clauses = tagFilters.map((t) => {
    const [k, v] = t.split('=');
    return `  node(around:${radiusMeters},${lat},${lon})["${k}"="${v}"];\n  way(around:${radiusMeters},${lat},${lon})["${k}"="${v}"];`;
  }).join('\n');
  return `[out:json][timeout:25];\n(\n${clauses}\n);\nout center tags;`;
}

async function runOverpassQuery(query) {
  let lastErr;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'User-Agent': OSM_USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`Overpass responded ${res.status}`);
      const data = await res.json();
      return data.elements || [];
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('All Overpass endpoints failed');
}

function osmAddress(tags) {
  const parts = [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'] || tags['addr:neighbourhood'], tags['addr:city']].filter(Boolean);
  return parts.join(', ');
}

// OSM contributors tag phone/website under several different keys depending
// on the editor they used — check every variant actually seen in the wild,
// not just the "canonical" one, or usable leads get missed for no reason.
function osmPhone(tags) {
  return tags.phone || tags['contact:phone'] || tags['phone:mobile'] || tags['contact:mobile'] || tags.mobile || tags['contact:mobile_phone'] || '';
}
function osmWebsite(tags) {
  return tags.website || tags['contact:website'] || tags.url || tags['contact:url'] || tags['website:2'] || '';
}

function overpassElementToResult(el) {
  const tags = el.tags || {};
  // Some listings are only tagged with a brand/operator name (chain outlets,
  // franchise stores) rather than their own `name` — fall back rather than
  // dropping a perfectly usable lead just because of which tag holds the name.
  const name = tags.name || tags.brand || tags.operator;
  if (!name) return null;
  return {
    placeId: `osm:${el.type}/${el.id}`,
    name,
    phone: osmPhone(tags),
    website: osmWebsite(tags),
    email: tags.email || tags['contact:email'] || '',
    address: osmAddress(tags),
    rating: null,
    ratingCount: null,
    hasHours: !!tags.opening_hours,
    photoCount: null,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await verifyUser(req);
  if (!user) {
    res.status(401).json({ error: 'Please sign in to search' });
    return;
  }

  try {
    const { nicheKey, location, lat: bodyLat, lng: bodyLng, radiusKm, maxResults } = req.body || {};
    const tagFilters = OSM_NICHE_TAGS[nicheKey];
    if (!tagFilters) {
      res.status(400).json({ error: 'OpenStreetMap does not reliably map this business type' });
      return;
    }
    if (typeof bodyLat !== 'number' && (!location || typeof location !== 'string' || !location.trim())) {
      res.status(400).json({ error: 'Missing location' });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data: usageRow } = await supabaseAdmin
      .from('api_usage').select('osm_searches').eq('user_id', user.id).eq('usage_date', today).maybeSingle();
    const currentCount = (usageRow && usageRow.osm_searches) || 0;
    if (currentCount >= DAILY_LIMIT) {
      res.status(429).json({ error: 'Daily search limit reached — please try again tomorrow' });
      return;
    }

    let lat, lon;
    if (typeof bodyLat === 'number' && typeof bodyLng === 'number') {
      lat = bodyLat;
      lon = bodyLng;
    } else {
      const geo = await geocodeLocation(location.trim());
      lat = geo.lat;
      lon = geo.lon;
      await sleep(1100); // stay polite to Nominatim's ~1 req/sec policy before the follow-up Overpass call
    }

    const radiusMeters = Math.min(Math.max(parseFloat(radiusKm) || 5, 1), 50) * 1000;
    const query = buildOverpassQuery(tagFilters, lat, lon, radiusMeters);
    const elements = await runOverpassQuery(query);
    const wantedCount = Math.min(Math.max(parseInt(maxResults, 10) || 20, 1), 100);
    const named = elements.map(overpassElementToResult).filter(Boolean);
    // Drop "dead" listings — no phone AND no website means there's no way to
    // actually contact the business, so it's not a usable lead regardless of
    // how the name/rating/address look. Count them so the UI can be honest
    // about why the result count is lower than what OSM actually returned.
    const usable = named.filter((r) => r.phone || r.website);
    const droppedCount = named.length - usable.length;
    const results = usable.slice(0, wantedCount);

    await supabaseAdmin
      .from('api_usage')
      .upsert({ user_id: user.id, usage_date: today, osm_searches: currentCount + 1 }, { onConflict: 'user_id,usage_date' });

    res.status(200).json({ results, droppedCount, center: { lat, lon } });
  } catch (err) {
    console.error('free-search error:', err);
    res.status(502).json({ error: err.message || 'Free search failed — please try again' });
  }
};
