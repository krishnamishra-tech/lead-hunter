// POST /api/shorten  { longUrl: string }  →  { shortUrl: string }
//
// Browsers can't call most public URL-shortener APIs directly (no CORS
// headers on their side), so this proxies the request server-to-server
// where CORS doesn't apply. Tries two free, no-key shorteners in sequence —
// if both fail, falls back to the original long URL so the "Demo site"
// feature in the app never fully breaks because of this.
async function tryIsGd(longUrl) {
  const r = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(longUrl)}`);
  const data = await r.json();
  if (data.shorturl) return data.shorturl;
  throw new Error(data.errormessage || 'is.gd failed');
}
async function tryTinyUrl(longUrl) {
  const r = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`);
  const text = await r.text();
  if (text && text.startsWith('http')) return text.trim();
  throw new Error('TinyURL failed');
}

export default async function handler(req, res) {
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
      const shortUrl = await tryTinyUrl(longUrl);
      return res.status(200).json({ shortUrl });
    } catch (e2) {
      console.error('TinyURL error:', e2.message);
      // Never hard-fail the demo-link feature just because both shorteners failed.
      return res.status(200).json({ shortUrl: longUrl, fallback: true });
    }
  }
}
