
// POST /api/check-website
// Runs a real Google PageSpeed Insights (Lighthouse) check on a lead's website
// and returns a 0-100 mobile performance score. This is a genuine audit, not
// AI-generated — same tool Google itself uses, so the number is trustworthy
// enough to put in front of a prospect ("your site scores 34/100 on mobile speed").
//
// Uses the same GOOGLE_PLACES_API_KEY — just make sure "PageSpeed Insights API"
// is also enabled for that key's project in Google Cloud Console → Library.
// PageSpeed Insights API is free with no billing account required.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string' || !url.trim()) {
      res.status(400).json({ error: 'Missing website URL' });
      return;
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Website check is not configured yet — missing API key' });
      return;
    }

    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;

    const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(targetUrl)}&key=${apiKey}&strategy=mobile&category=performance`;

    // Lighthouse audits are slow — give this extra time before giving up.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    let data;
    try {
      const psiRes = await fetch(psiUrl, { signal: controller.signal });
      data = await psiRes.json();
      if (!psiRes.ok) {
        console.error('PageSpeed API error:', data);
        res.status(502).json({ error: (data.error && data.error.message) || 'Could not analyze this website' });
        return;
      }
    } finally {
      clearTimeout(timeout);
    }

    const rawScore = data && data.lighthouseResult && data.lighthouseResult.categories &&
      data.lighthouseResult.categories.performance && data.lighthouseResult.categories.performance.score;

    if (typeof rawScore !== 'number') {
      res.status(502).json({ error: 'Could not get a score for this site — it may be blocking automated checks' });
      return;
    }

    res.status(200).json({ score: Math.round(rawScore * 100) });
  } catch (err) {
    if (err.name === 'AbortError') {
      res.status(504).json({ error: 'Website check timed out — the site may be slow or unreachable' });
      return;
    }
    console.error('check-website error:', err);
    res.status(500).json({ error: 'Website check failed — please try again' });
  }
};
