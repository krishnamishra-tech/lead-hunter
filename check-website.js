// POST /api/check-website
// Runs a real Google PageSpeed Insights (Lighthouse) check on a lead's website
// and returns a 0-100 mobile performance score.
//
// SECURITY: requires a valid Supabase login, same reasoning as search-places.js —
// this endpoint is free to call on Google's side, but it's still your server
// doing the work, and an unauthenticated flood of requests is still a DoS risk.
const { verifyUser, supabaseAdmin } = require('./_lib/verifyUser');

const DAILY_CHECK_LIMIT = 100;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await verifyUser(req);
  if (!user) {
    res.status(401).json({ error: 'Please sign in to check a website' });
    return;
  }

  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string' || !url.trim()) {
      res.status(400).json({ error: 'Missing website URL' });
      return;
    }

    let targetUrl = url.trim();
    if (targetUrl.length > 500) {
      res.status(400).json({ error: 'URL too long' });
      return;
    }
    if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;
    // Basic sanity check on the URL shape before we hand it to Google.
    try {
      new URL(targetUrl);
    } catch (e) {
      res.status(400).json({ error: 'That doesn\'t look like a valid URL' });
      return;
    }

    // ── Rate limit check ──
    const today = new Date().toISOString().slice(0, 10);
    const { data: usageRow } = await supabaseAdmin
      .from('api_usage')
      .select('website_checks')
      .eq('user_id', user.id)
      .eq('usage_date', today)
      .maybeSingle();
    const currentCount = (usageRow && usageRow.website_checks) || 0;
    if (currentCount >= DAILY_CHECK_LIMIT) {
      res.status(429).json({ error: 'Daily website-check limit reached — please try again tomorrow' });
      return;
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Website check is not configured yet — missing API key' });
      return;
    }

    const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(targetUrl)}&key=${apiKey}&strategy=mobile&category=performance`;

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

    // ── Record usage ──
    await supabaseAdmin
      .from('api_usage')
      .upsert(
        { user_id: user.id, usage_date: today, website_checks: currentCount + 1 },
        { onConflict: 'user_id,usage_date' }
      );

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
