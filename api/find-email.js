// POST /api/find-email
// Fetches a lead's own website (homepage, and /contact or /about if the
// homepage doesn't have one) and scans the public HTML for an email address.
// This is just reading a public webpage — same as a browser would — not
// scraping a third party or using any paid API, so it's free and legitimate.
//
// SECURITY + COST: login-gated and daily-capped like the other lookup
// endpoints, so this can't be hammered by someone outside the app.
const { verifyUser, supabaseAdmin } = require('./_lib/verifyUser');

const DAILY_LIMIT = 100;
const FETCH_TIMEOUT_MS = 8000;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Common false positives to filter out — image/CSS asset filenames that look
// like emails (e.g. "logo@2x.png"), tracking pixel domains, placeholder text.
const IGNORE_PATTERNS = [
  /\.(png|jpg|jpeg|gif|svg|webp|css|js)(@\dx)?$/i,
  /^(example|test|your|name|email|user)@/i,
  /sentry\.io|wixpress\.com|godaddy\.com|schema\.org/i,
];

function extractEmails(html) {
  const matches = html.match(EMAIL_REGEX) || [];
  const unique = [...new Set(matches.map((m) => m.toLowerCase()))];
  return unique.filter((email) => !IGNORE_PATTERNS.some((re) => re.test(email)));
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LocalScoutBot/1.0)' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await verifyUser(req);
  if (!user) {
    res.status(401).json({ error: 'Please sign in to look up an email' });
    return;
  }

  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string' || !url.trim()) {
      res.status(400).json({ error: 'Missing website URL' });
      return;
    }
    let baseUrl = url.trim();
    if (!/^https?:\/\//i.test(baseUrl)) baseUrl = 'https://' + baseUrl;
    let origin;
    try {
      origin = new URL(baseUrl).origin;
    } catch (e) {
      res.status(400).json({ error: "That doesn't look like a valid URL" });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data: usageRow } = await supabaseAdmin
      .from('api_usage').select('email_lookups').eq('user_id', user.id).eq('usage_date', today).maybeSingle();
    const currentCount = (usageRow && usageRow.email_lookups) || 0;
    if (currentCount >= DAILY_LIMIT) {
      res.status(429).json({ error: 'Daily email-lookup limit reached — please try again tomorrow' });
      return;
    }

    // Try homepage first, then a couple of common contact page paths.
    const candidatePages = [baseUrl, `${origin}/contact`, `${origin}/contact-us`, `${origin}/about`];
    let foundEmails = [];
    for (const pageUrl of candidatePages) {
      const html = await fetchWithTimeout(pageUrl);
      if (!html) continue;
      foundEmails = extractEmails(html);
      if (foundEmails.length) break;
    }

    await supabaseAdmin
      .from('api_usage')
      .upsert({ user_id: user.id, usage_date: today, email_lookups: currentCount + 1 }, { onConflict: 'user_id,usage_date' });

    if (!foundEmails.length) {
      res.status(200).json({ email: null, message: 'No email found on the homepage, contact, or about pages' });
      return;
    }

    res.status(200).json({ email: foundEmails[0], allFound: foundEmails.slice(0, 5) });
  } catch (err) {
    console.error('find-email error:', err);
    res.status(500).json({ error: 'Email lookup failed — please try again' });
  }
};
