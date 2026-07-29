// POST /api/search-places
// Pulls REAL business data from Google Places API (New) — Text Search.
// No AI generation involved, so no hallucination risk: every result is an
// actual listed business with (where available) a real phone number.
const { verifyUser, supabaseAdmin } = require('./_lib/verifyUser');

const DAILY_SEARCH_LIMIT = 200;

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
    const { query } = req.body || {};
    if (!query || typeof query !== 'string' || !query.trim()) {
      res.status(400).json({ error: 'Missing search query' });
      return;
    }
    if (query.length > 300) {
      res.status(400).json({ error: 'Search query too long' });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data: usageRow } = await supabaseAdmin
      .from('api_usage')
      .select('places_searches')
      .eq('user_id', user.id)
      .eq('usage_date', today)
      .maybeSingle();
    const currentCount = (usageRow && usageRow.places_searches) || 0;
    if (currentCount >= DAILY_SEARCH_LIMIT) {
      res.status(429).json({ error: 'Daily search limit reached — please try again tomorrow' });
      return;
    }

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
    ].join(',');

    const placesRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify({ textQuery: query.trim(), pageSize: 20 }),
    });

    const data = await placesRes.json();

    if (!placesRes.ok) {
      console.error('Places API error:', data);
      res.status(502).json({ error: (data.error && data.error.message) || 'Google Places request failed' });
      return;
    }

    await supabaseAdmin
      .from('api_usage')
      .upsert(
        { user_id: user.id, usage_date: today, places_searches: currentCount + 1 },
        { onConflict: 'user_id,usage_date' }
      );

    const results = (data.places || []).map((p) => ({
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
