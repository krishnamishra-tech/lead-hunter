// POST /api/search-places
// Pulls REAL business data from Google Places API (New) — Text Search.
// No AI generation involved, so no hallucination risk: every result is an
// actual listed business with (where available) a real phone number.
//
// Requires GOOGLE_PLACES_API_KEY env var. Google gives $200/month free
// credit on the Cloud Billing account, which comfortably covers normal
// usage for a tool like this (Text Search is ~$32 per 1000 calls, so the
// free credit covers roughly 6000 searches/month before anything is charged).

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { query } = req.body || {};
    if (!query || typeof query !== 'string' || !query.trim()) {
      res.status(400).json({ error: 'Missing search query' });
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
