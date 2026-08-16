// POST /api/audit-website  { url: string }  →  { score, opportunityScore, grade, gradeNote, checks: [...], summary }
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
// pitch, not the lowest.
const { isSafeUrl, normalizeUrl, safeFetchWithTimeout } = require('./_lib/security');

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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { url: rawUrl } = req.body || {};
  if (!rawUrl || typeof rawUrl !== 'string') {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  const url = normalizeUrl(rawUrl);
  if (!isSafeUrl(url)) {
    res.status(400).json({ error: 'That URL cannot be checked.' });
    return;
  }

  const results = {};
  let html = '';
  let finalUrl = url;
  let earned = 0;
  let possible = 0;
  let pageTitle = '';
  let metaDescriptionText = '';

  const start = Date.now();
  let response = null;
  try {
    response = await safeFetchWithTimeout(url, 8000);
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

    // Meta description (also captured separately as text for fallback display)
    possible += CHECKS.metaDescription.weight;
    const hasMetaDesc = /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html);
    if (hasMetaDesc) earned += CHECKS.metaDescription.weight;
    results.metaDescription = { pass: hasMetaDesc, note: hasMetaDesc ? 'Has a meta description.' : 'No meta description — hurts how it looks in Google search results.' };
    const titleMatch = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
    if (titleMatch) pageTitle = titleMatch[1].trim();
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i);
    if (descMatch) metaDescriptionText = descMatch[1].trim();

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
  const opportunityScore = 100 - score;
  let grade, gradeNote;
  if (opportunityScore <= 30) { grade = 'Strong site'; gradeNote = 'Few gaps — low pitch priority.'; }
  else if (opportunityScore <= 60) { grade = 'Some gaps'; gradeNote = 'Worth a soft pitch.'; }
  else if (opportunityScore <= 85) { grade = 'Significant gaps'; gradeNote = 'Strong pitch opportunity.'; }
  else { grade = 'Critical gaps'; gradeNote = 'Highest priority lead.'; }

  res.status(200).json({
    url: finalUrl,
    score,
    opportunityScore,
    grade,
    gradeNote,
    pageTitle,
    metaDescriptionText,
    checks: Object.entries(results).map(([key, r]) => ({
      key, label: CHECKS[key].label, pass: r.pass, note: r.note,
    })),
    summary: reachable
      ? `${finalUrl} — Website Health ${score}/100, Opportunity Score ${opportunityScore}/100 (${grade.toLowerCase()}).`
      : `No working website found at "${rawUrl}" — Opportunity Score 100/100 (highest priority lead).`,
  });
};
