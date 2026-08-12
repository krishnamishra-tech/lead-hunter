// POST /api/audit-website  { url: string }  →  { score, grade, checks: [...], summary }
//
// Runs REAL checks against the given URL — no third-party paid APIs (no
// Lighthouse/PageSpeed key needed), just a server-side fetch + basic HTML
// parsing. This is deliberately lighter than a full Lighthouse audit, but
// everything it reports is actually true of the site, not simulated.
//
// Checks performed:
//  1. Reachable at all (biggest single factor — "no real website" cases)
//  2. HTTPS (secure connection)
//  3. Mobile viewport meta tag present
//  4. Page <title> and meta description present (basic SEO hygiene)
//  5. Contact info findable (phone/email pattern, or a contact/WhatsApp link)
//  6. Response time (rough speed proxy — not as precise as Lighthouse, but real)
//  7. Page isn't a "coming soon" / near-empty placeholder
//
// Scoring weights are intentionally front-loaded on "no website" and
// "no HTTPS", since those are the two gaps that make the strongest,
// least-arguable pitch — everything else is a smaller nudge.

const CHECKS = {
  reachable: { weight: 40, label: 'Website is reachable' },
  https: { weight: 15, label: 'Uses HTTPS (secure connection)' },
  mobileViewport: { weight: 15, label: 'Mobile-friendly viewport tag' },
  seoBasics: { weight: 10, label: 'Has a page title & meta description' },
  contactFindable: { weight: 10, label: 'Contact info is easy to find' },
  responseSpeed: { weight: 5, label: 'Loads reasonably fast' },
  notPlaceholder: { weight: 5, label: "Isn't a near-empty placeholder page" },
};

function normalizeUrl(input) {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url;
}

// SSRF guard — this endpoint fetches whatever URL a visitor types in, so
// without this check it could be used to probe internal services, localhost,
// or cloud metadata endpoints (e.g. 169.254.169.254) via our server. Block
// anything that isn't a public http(s) host before ever calling fetch().
function isBlockedHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '0.0.0.0' || h === '::1' || h === '[::1]') return true;
  // IPv4 private/reserved ranges + link-local (covers 169.254.169.254 cloud metadata)
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [parseInt(ipv4[1]), parseInt(ipv4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
  }
  return false;
}
function isSafeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (isBlockedHost(parsed.hostname)) return false;
    return true;
  } catch (e) {
    return false;
  }
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    let currentUrl = url;
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual', // validate each redirect target ourselves before following it
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LocalScoutAudit/1.0; +https://localscout.online)' },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        const nextUrl = new URL(res.headers.get('location'), currentUrl).toString();
        if (!isSafeUrl(nextUrl)) throw new Error('Redirect target not allowed');
        currentUrl = nextUrl;
        continue;
      }
      // Attach the final resolved URL so the caller can report it accurately.
      Object.defineProperty(res, 'url', { value: currentUrl, configurable: true });
      return res;
    }
    throw new Error('Too many redirects');
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { url: rawUrl } = req.body || {};
  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  const url = normalizeUrl(rawUrl);
  if (!isSafeUrl(url)) {
    return res.status(400).json({ error: 'That URL cannot be checked.' });
  }
  const results = {};
  let html = '';
  let finalUrl = url;
  let earned = 0;
  let possible = 0;

  const start = Date.now();
  let response = null;
  try {
    response = await fetchWithTimeout(url, 8000);
    finalUrl = response.url || url;
  } catch (e) {
    response = null;
  }
  const elapsedMs = Date.now() - start;

  // 1. Reachable
  possible += CHECKS.reachable.weight;
  const reachable = !!(response && response.ok);
  if (reachable) earned += CHECKS.reachable.weight;
  results.reachable = { pass: reachable, note: reachable ? 'Site responded successfully.' : 'No working website found at this address.' };

  if (reachable) {
    try {
      html = (await response.text()).slice(0, 300000); // cap to avoid huge pages
    } catch (e) { html = ''; }

    // 2. HTTPS
    possible += CHECKS.https.weight;
    const isHttps = finalUrl.toLowerCase().startsWith('https://');
    if (isHttps) earned += CHECKS.https.weight;
    results.https = { pass: isHttps, note: isHttps ? 'Connection is encrypted.' : 'Site is not using HTTPS — browsers flag this as "Not Secure".' };

    // 3. Mobile viewport
    possible += CHECKS.mobileViewport.weight;
    const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
    if (hasViewport) earned += CHECKS.mobileViewport.weight;
    results.mobileViewport = { pass: hasViewport, note: hasViewport ? 'Has a mobile viewport tag.' : 'No mobile viewport tag — likely renders poorly on phones.' };

    // 4. SEO basics
    possible += CHECKS.seoBasics.weight;
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const hasTitle = !!(titleMatch && titleMatch[1] && titleMatch[1].trim().length > 3);
    const hasMetaDesc = /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html);
    const seoOk = hasTitle && hasMetaDesc;
    if (seoOk) earned += CHECKS.seoBasics.weight;
    else if (hasTitle || hasMetaDesc) earned += Math.round(CHECKS.seoBasics.weight / 2);
    results.seoBasics = { pass: seoOk, note: seoOk ? 'Title and meta description both present.' : 'Missing a proper title and/or meta description — hurts how it looks in Google search results.' };

    // 5. Contact info findable
    possible += CHECKS.contactFindable.weight;
    const phonePattern = /(\+?\d[\d\s\-().]{7,}\d)/;
    const hasPhone = phonePattern.test(html.replace(/<[^>]+>/g, ' '));
    const hasEmailLink = /mailto:/i.test(html);
    const hasWaLink = /wa\.me|api\.whatsapp\.com/i.test(html);
    const hasContactWord = /contact us|get in touch|book now|call us/i.test(html);
    const contactOk = hasPhone || hasEmailLink || hasWaLink || hasContactWord;
    if (contactOk) earned += CHECKS.contactFindable.weight;
    results.contactFindable = { pass: contactOk, note: contactOk ? 'Contact info or a contact path is visible.' : 'No clear phone, email, or contact link found on the page.' };

    // 6. Response speed
    possible += CHECKS.responseSpeed.weight;
    const fastEnough = elapsedMs < 3000;
    if (fastEnough) earned += CHECKS.responseSpeed.weight;
    results.responseSpeed = { pass: fastEnough, note: `Page responded in ${elapsedMs}ms${fastEnough ? '' : ' — slower than the 3s benchmark visitors tend to tolerate.'}` };

    // 7. Not a placeholder
    possible += CHECKS.notPlaceholder.weight;
    const textOnly = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const looksPlaceholder = textOnly.length < 200 || /coming soon|under construction|default web page|this domain is for sale/i.test(textOnly);
    if (!looksPlaceholder) earned += CHECKS.notPlaceholder.weight;
    results.notPlaceholder = { pass: !looksPlaceholder, note: looksPlaceholder ? 'Page looks like a placeholder or near-empty stub, not a real business site.' : 'Page has real content.' };
  } else {
    // Site unreachable — every other check is automatically a fail, but we
    // still report them so the UI can show a full, honest breakdown.
    ['https', 'mobileViewport', 'seoBasics', 'contactFindable', 'responseSpeed', 'notPlaceholder'].forEach(key => {
      possible += CHECKS[key].weight;
      results[key] = { pass: false, note: 'Could not check — no reachable website.' };
    });
  }

  const score = possible > 0 ? Math.round((earned / possible) * 100) : 0;
  const grade = score >= 80 ? 'Strong' : score >= 50 ? 'Needs work' : 'Critical gaps';

  return res.status(200).json({
    url: finalUrl,
    score,
    grade,
    checks: Object.entries(results).map(([key, r]) => ({
      key, label: CHECKS[key].label, pass: r.pass, note: r.note,
    })),
    summary: reachable
      ? `${finalUrl} scores ${score}/100 — ${grade.toLowerCase()}.`
      : `No working website found at "${rawUrl}".`,
  });
}
