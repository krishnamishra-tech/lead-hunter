// POST /api/audit-website  { url: string }  →  { score, grade, gradeNote, checks: [...], summary }
//
// Runs REAL checks against the given URL — no third-party paid APIs (no
// Lighthouse/PageSpeed key needed), just a server-side fetch + basic HTML
// parsing. This is deliberately lighter than a full Lighthouse audit, but
// everything it reports is actually true of the site, not simulated.
//
// 8-point checklist (weights match the LocalScout tool spec):
//  1. Real website exists / reachable ................. 20
//  2. HTTPS / SSL ....................................... 15
//  3. Mobile-friendly (viewport tag) .................... 15
//  4. Page load speed (rough proxy, not full Lighthouse) 15
//  5. Contact info visible .............................. 10
//  6. Meta description present .......................... 10
//  7. LocalBusiness / Google Business schema present .... 10
//  8. Booking/enquiry form present ....................... 5
//                                                  Total: 100
//
// Opportunity Score = 100 − Website Health Score (i.e. this score,
// inverted) — a business that fails everything is the *highest* priority
// pitch, not the lowest. The UI computes that inversion; this endpoint
// reports the straightforward health score plus a pass/fail per check.

const CHECKS = {
  reachable: { weight: 20, label: 'Real website exists' },
  https: { weight: 15, label: 'HTTPS / SSL' },
  mobileViewport: { weight: 15, label: 'Mobile-friendly (viewport tag)' },
  responseSpeed: { weight: 15, label: 'Page load speed' },
  contactFindable: { weight: 10, label: 'Contact info visible' },
  metaDescription: { weight: 10, label: 'Meta description present' },
  businessSchema: { weight: 10, label: 'Google Business / LocalBusiness schema' },
  bookingForm: { weight: 5, label: 'Booking or enquiry form present' },
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

  // 1. Real website exists / reachable
  possible += CHECKS.reachable.weight;
  const reachable = !!(response && response.ok);
  if (reachable) earned += CHECKS.reachable.weight;
  results.reachable = { pass: reachable, note: reachable ? 'Site responded successfully.' : 'No working website found at this address.' };

  if (reachable) {
    try {
      html = (await response.text()).slice(0, 300000); // cap to avoid huge pages
    } catch (e) { html = ''; }
    const textOnly = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

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

    // 4. Page load speed (rough proxy via response time — not full Lighthouse,
    // but real and free; a paid PageSpeed Insights key can replace this later)
    possible += CHECKS.responseSpeed.weight;
    const fastEnough = elapsedMs < 3000;
    if (fastEnough) earned += CHECKS.responseSpeed.weight;
    results.responseSpeed = { pass: fastEnough, note: `Page responded in ${elapsedMs}ms${fastEnough ? '' : ' — slower than the 3s benchmark visitors tend to tolerate.'}` };

    // 5. Contact info findable
    possible += CHECKS.contactFindable.weight;
    const phonePattern = /(\+?\d[\d\s\-().]{7,}\d)/;
    const hasPhone = phonePattern.test(textOnly);
    const hasEmailLink = /mailto:/i.test(html);
    const hasWaLink = /wa\.me|api\.whatsapp\.com/i.test(html);
    const hasContactWord = /contact us|get in touch|book now|call us/i.test(html);
    const contactOk = hasPhone || hasEmailLink || hasWaLink || hasContactWord;
    if (contactOk) earned += CHECKS.contactFindable.weight;
    results.contactFindable = { pass: contactOk, note: contactOk ? 'Contact info or a contact path is visible.' : 'No clear phone, email, or contact link found on the page.' };

    // 6. Meta description
    possible += CHECKS.metaDescription.weight;
    const hasMetaDesc = /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html);
    if (hasMetaDesc) earned += CHECKS.metaDescription.weight;
    results.metaDescription = { pass: hasMetaDesc, note: hasMetaDesc ? 'Has a meta description.' : 'No meta description — hurts how it looks in Google search results.' };

    // 7. Google Business / LocalBusiness structured data (JSON-LD)
    possible += CHECKS.businessSchema.weight;
    const hasBusinessSchema = /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?(LocalBusiness|Restaurant|Store|ProfessionalService|HomeAndConstructionBusiness|MedicalBusiness)[\s\S]*?<\/script>/i.test(html);
    if (hasBusinessSchema) earned += CHECKS.businessSchema.weight;
    results.businessSchema = { pass: hasBusinessSchema, note: hasBusinessSchema ? 'Has LocalBusiness structured data.' : 'No LocalBusiness schema found — a missed opportunity for richer Google search results.' };

    // 8. Booking / enquiry form
    possible += CHECKS.bookingForm.weight;
    const hasForm = /<form[\s>]/i.test(html);
    if (hasForm) earned += CHECKS.bookingForm.weight;
    results.bookingForm = { pass: hasForm, note: hasForm ? 'Has a form on the page.' : 'No booking or enquiry form found — visitors have no easy way to reach out directly.' };
  } else {
    // Site unreachable — every other check is automatically a fail, but we
    // still report them so the UI can show a full, honest breakdown.
    ['https', 'mobileViewport', 'responseSpeed', 'contactFindable', 'metaDescription', 'businessSchema', 'bookingForm'].forEach(key => {
      possible += CHECKS[key].weight;
      results[key] = { pass: false, note: 'Could not check — no reachable website.' };
    });
  }

  const score = possible > 0 ? Math.round((earned / possible) * 100) : 0;
  // Opportunity Score = 100 − Website Health Score. A business that fails
  // everything scores 100 here — maximum opportunity for a web designer.
  const opportunityScore = 100 - score;
  let grade, gradeNote;
  if (opportunityScore <= 30) { grade = 'Strong site'; gradeNote = 'Few gaps — low pitch priority.'; }
  else if (opportunityScore <= 60) { grade = 'Some gaps'; gradeNote = 'Worth a soft pitch.'; }
  else if (opportunityScore <= 85) { grade = 'Significant gaps'; gradeNote = 'Strong pitch opportunity.'; }
  else { grade = 'Critical gaps'; gradeNote = 'Highest priority lead.'; }

  return res.status(200).json({
    url: finalUrl,
    score,
    opportunityScore,
    grade,
    gradeNote,
    checks: Object.entries(results).map(([key, r]) => ({
      key, label: CHECKS[key].label, pass: r.pass, note: r.note,
    })),
    summary: reachable
      ? `${finalUrl} — Website Health ${score}/100, Opportunity Score ${opportunityScore}/100 (${grade.toLowerCase()}).`
      : `No working website found at "${rawUrl}" — Opportunity Score 100/100 (highest priority lead).`,
  });
}
