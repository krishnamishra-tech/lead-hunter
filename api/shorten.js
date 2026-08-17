// POST /api/shorten  { longUrl: string }  →  { shortUrl: string }
//
// Browsers can't call most public URL-shortener APIs directly (no CORS
// headers on their side), so this proxies the request server-to-server
// where CORS doesn't apply. Tries is.gd then v.gd (same operator, same
// direct-redirect behavior — no ad/interstitial page in between, unlike
// TinyURL's classic API which now shows a "preview" page before
// redirecting). Falls back to the original long URL if both fail.
async function tryIsGd(longUrl) {
  const r = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(longUrl)}`);
  const data = await r.json();
  if (data.shorturl) return data.shorturl;
  throw new Error(data.errormessage || 'is.gd failed');
}
async function tryVGd(longUrl) {
  const r = await fetch(`https://v.gd/create.php?format=json&url=${encodeURIComponent(longUrl)}`);
  const data = await r.json();
  if (data.shorturl) return data.shorturl;
  throw new Error(data.errormessage || 'v.gd failed');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { longUrl } = req.body || {};
  if (!longUrl || typeof longUrl !== 'string') {
    return res.status(400).json({ error: 'longUrl is required' });
  }

  try {
    const shortUrl = await tryIsGd(longUrl);
    return res.status(200).json({ shortUrl });
  } catch (e1) {
    console.error('is.gd error:', e1.message);
    try {
      const shortUrl = await tryVGd(longUrl);
      return res.status(200).json({ shortUrl });
    } catch (e2) {
      console.error('v.gd error:', e2.message);
      // Never hard-fail the demo-link feature just because both shorteners failed.
      return res.status(200).json({ shortUrl: longUrl, fallback: true });
    }
  }
}
