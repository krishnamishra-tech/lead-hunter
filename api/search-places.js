// POST /api/search-places
// Pulls REAL business data from Google Places API (New) — Text Search.
// No AI generation involved, so no hallucination risk: every result is an
// actual listed business with (where available) a real phone number.
//
// Supports pulling more than one page of results (Google gives up to ~60
// results / 3 pages per query) via the `maxResults` param from the client.
//
// SECURITY: requires a valid Supabase login (Authorization: Bearer <token>).
// Without this check, anyone who discovers this URL could call it directly —
// with no LocalScout account at all — and burn through the Google API quota
// on your bill. Also enforces a daily per-user cap so one compromised
// account (or a bug in the frontend) can't run away with costs either.
const { verifyUser, supabaseAdmin } = require('./_lib/verifyUser');

const DAILY_SEARCH_LIMIT = 200; // counts actual Google API calls, not "searches"
const PAGE_SIZE = 20;
const MAX_PAGES = 3; // Google caps Text Search at ~60 results / 3 pages regardless
const PAGE_TOKEN_DELAY_MS = 1500; // brief wait — a fresh nextPageToken needs a moment before it's valid

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

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
    const { query, maxResults } = req.body || {};
    if (!query || typeof query !== 'string' || !query.trim()) {
      res.status(400).json({ error: 'Missing search query' });
      return;
    }
    if (query.length > 300) {
      res.status(400).json({ error: 'Search query too long' });
      return;
    }
    const wantedCount = Math.min(Math.max(parseInt(maxResults, 10) || PAGE_SIZE, PAGE_SIZE), PAGE_SIZE * MAX_PAGES);
    const wantedPages = Math.ceil(wantedCount / PAGE_SIZE);

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Search is not configured yet — missing API key' });
      return;
    }

    const fieldMask = [
      'places.displayName',
      'places.formattedAddress',
      'places.internationalPhoneNumber',
      'places.nationalPhoneNumber',
      'places.websiteUri',
      'places.rating',
      'places.userRatingCount',
      'places.id',
      'nextPageToken',
    ].join(',');

    const today = new Date().toISOString().slice(0, 10);
    const { data: usageRow } = await supabaseAdmin
      .from('api_usage')
      .select('places_searches')
      .eq('user_id', user.id)
      .eq('usage_date', today)
      .maybeSingle();
    let currentCount = (usageRow && usageRow.places_searches) || 0;
    if (currentCount >= DAILY_SEARCH_LIMIT) {
      res.status(429).json({ error: 'Daily search limit reached — please try again tomorrow' });
      return;
    }

    const allPlaces = [];
    let pageToken = null;
    let pagesFetched = 0;

    for (let page = 0; page < wantedPages; page++) {
      if (currentCount >= DAILY_SEARCH_LIMIT) break; // stop early if quota runs out mid-pagination

      const body = pageToken
        ? { textQuery: query.trim(), pageSize: PAGE_SIZE, pageToken }
        : { textQuery: query.trim(), pageSize: PAGE_SIZE };

      const placesRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': fieldMask,
        },
        body: JSON.stringify(body),
      });

      const data = await placesRes.json();

      if (!placesRes.ok) {
        console.error('Places API error:', data);
        if (page === 0) {
          res.status(502).json({ error: (data.error && data.error.message) || 'Google Places request failed' });
          return;
        }
        break; // later pages failing shouldn't lose the results we already have
      }

      pagesFetched++;
      currentCount++;
      allPlaces.push(...(data.places || []));

      if (!data.nextPageToken || allPlaces.length >= wantedCount) break;
      pageToken = data.nextPageToken;
      await sleep(PAGE_TOKEN_DELAY_MS);
    }

    if (pagesFetched > 0) {
      await supabaseAdmin
        .from('api_usage')
        .upsert(
          { user_id: user.id, usage_date: today, places_searches: currentCount },
          { onConflict: 'user_id,usage_date' }
        );
    }

    const results = allPlaces.slice(0, wantedCount).map((p) => ({
      name: (p.displayName && p.displayName.text) || 'Unknown',
      phone: p.internationalPhoneNumber || p.nationalPhoneNumber || '',
      address: p.formattedAddress || '',
      website: p.websiteUri || '',
      rating: p.rating || null,
      ratingCount: p.userRatingCount || null,
      placeId: p.id || '',
    }));

    res.status(200).json({ results });
  } catch (err) {
    console.error('search-places error:', err);
    res.status(500).json({ error: 'Search failed — please try again' });
  }
};
