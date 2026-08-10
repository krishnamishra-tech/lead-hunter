// POST /api/shorten  { longUrl: string }  →  { shortUrl: string }
//
// Browsers can't call most public URL-shortener APIs directly (no CORS
// headers on their side), so this proxies the request server-to-server
// where CORS doesn't apply. Uses is.gd — free, no API key, no signup.
// Falls back to returning the original long URL if the shortener is down,
// so the "Demo site" feature in the app never fully breaks because of this.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { longUrl } = req.body || {};
  if (!longUrl || typeof longUrl !== 'string') {
    return res.status(400).json({ error: 'longUrl is required' });
  }

  try {
    const apiUrl = `https://is.gd/create.php?format=json&url=${encodeURIComponent(longUrl)}`;
    const r = await fetch(apiUrl);
    const data = await r.json();

    if (data.shorturl) {
      return res.status(200).json({ shortUrl: data.shorturl });
    }
    // is.gd returned an error payload (e.g. rate limited) — fall back gracefully.
    console.error('is.gd error:', data.errormessage || data);
    return res.status(200).json({ shortUrl: longUrl, fallback: true });
  } catch (e) {
    console.error('Shorten error:', e);
    // Never hard-fail the demo-link feature just because shortening failed.
    return res.status(200).json({ shortUrl: longUrl, fallback: true });
  }
}
