// POST /api/audit-website  { url: string }  →  { score, opportunityScore, grade, gradeNote, checks: [...], categories: [...], summary }
//
// Runs REAL checks against the given URL — no third-party paid APIs (no
// Lighthouse/PageSpeed key needed), just a server-side fetch + basic HTML
// parsing. This is deliberately lighter than a full Lighthouse audit, but
// everything it reports is actually true of the site, not simulated —
// there is no fabricated "AI score" or invented competitor data anywhere
// in this file.
//
// 14-point checklist, grouped into 5 categories for the UI:
//  Trust & reachability
//   1. Real website exists / reachable ................. 20
//   2. HTTPS / SSL ....................................... 12
//   3. Favicon present .................................... 3
//  Mobile
//   4. Mobile-friendly (viewport tag) .................... 12
//  Speed
//   5. Page load speed (rough proxy, not full Lighthouse) 12
//  SEO
//   6. Meta description present ........................... 8
//   7. Page title present & reasonable length ............. 4
//   8. Canonical tag present ............................... 3
//   9. Open Graph tags present (title/image) ............... 3
//  10. Sitemap.xml reachable ............................... 3
//  11. LocalBusiness / Google Business schema present ..... 8
//  Content & accessibility
//  12. Contact info visible ............................... 8
//  13. Booking/enquiry form present ........................ 3
//  14. Image alt-text coverage ............................. 1
//                                                  Total: 100
//
// Opportunity Score = 100 − Website Health Score (i.e. this score,
// inverted) — a business that fails everything is the *highest* priority
// pitch, not the lowest.
const { isSafeUrl, normalizeUrl, safeFetchWithTimeout } = require('./_lib/security');

const CHECKS = {
  reachable: { weight: 20, label: 'Real website exists', category: 'Trust & reachability' },
  https: { weight: 12, label: 'HTTPS / SSL', category: 'Trust & reachability' },
  favicon: { weight: 3, label: 'Favicon present', category: 'Trust & reachability' },
  mobileViewport: { weight: 12, label: 'Mobile-friendly (viewport tag)', category: 'Mobile' },
  responseSpeed: { weight: 12, label: 'Page load speed', category: 'Speed' },
  metaDescription: { weight: 8, label: 'Meta description present', category: 'SEO' },
  pageTitleOk: { weight: 4, label: 'Page title present & reasonable length', category: 'SEO' },
  canonical: { weight: 3, label: 'Canonical tag present', category: 'SEO' },
  openGraph: { weight: 3, label: 'Open Graph tags present', category: 'SEO' },
  sitemap: { weight: 3, label: 'Sitemap.xml reachable', category: 'SEO' },
  businessSchema: { weight: 8, label: 'Google Business / LocalBusiness schema', category: 'SEO' },
  contactFindable: { weight: 8, label: 'Contact info visible', category: 'Content & accessibility' },
  bookingForm: { weight: 3, label: 'Booking or enquiry form present', category: 'Content & accessibility' },
  imageAlts: { weight: 1, label: 'Image alt-text coverage', category: 'Content & accessibility' },
};
const ALL_KEYS = Object.keys(CHECKS);

async function runAudit(rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (!isSafeUrl(url)) {
    return { error: 'That URL cannot be checked.' };
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

    // 3. Favicon present
    possible += CHECKS.favicon.weight;
    const hasFaviconTag = /<link[^>]+rel=["'](?:shortcut )?icon["']/i.test(html);
    let hasFaviconFallback = false;
    if (!hasFaviconTag) {
      try {
        const favRes = await safeFetchWithTimeout(new URL('/favicon.ico', finalUrl).toString(), 4000);
        hasFaviconFallback = !!(favRes && favRes.ok);
      } catch (e) { hasFaviconFallback = false; }
    }
    const hasFavicon = hasFaviconTag || hasFaviconFallback;
    if (hasFavicon) earned += CHECKS.favicon.weight;
    results.favicon = { pass: hasFavicon, note: hasFavicon ? 'Has a favicon.' : 'No favicon found — looks unfinished in browser tabs and bookmarks.' };

    // 4. Mobile viewport
    possible += CHECKS.mobileViewport.weight;
    const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
    if (hasViewport) earned += CHECKS.mobileViewport.weight;
    results.mobileViewport = { pass: hasViewport, note: hasViewport ? 'Has a mobile viewport tag.' : 'No mobile viewport tag — likely renders poorly on phones.' };

    // 5. Page load speed (rough proxy via response time — not full Lighthouse,
    // but real and free; a paid PageSpeed Insights key can replace this later)
    possible += CHECKS.responseSpeed.weight;
    const fastEnough = elapsedMs < 3000;
    if (fastEnough) earned += CHECKS.responseSpeed.weight;
    results.responseSpeed = { pass: fastEnough, note: `Page responded in ${elapsedMs}ms${fastEnough ? '' : ' — slower than the 3s benchmark visitors tend to tolerate.'}` };

    // 6. Meta description
    possible += CHECKS.metaDescription.weight;
    const hasMetaDesc = /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html);
    if (hasMetaDesc) earned += CHECKS.metaDescription.weight;
    results.metaDescription = { pass: hasMetaDesc, note: hasMetaDesc ? 'Has a meta description.' : 'No meta description — hurts how it looks in Google search results.' };
    const titleMatch = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
    if (titleMatch) pageTitle = titleMatch[1].trim();
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i);
    if (descMatch) metaDescriptionText = descMatch[1].trim();

    // 7. Page title present & reasonable length (10-60 chars is the usual
    // sweet spot before Google truncates it in search results)
    possible += CHECKS.pageTitleOk.weight;
    const titleOk = !!pageTitle && pageTitle.length >= 10 && pageTitle.length <= 60;
    if (titleOk) earned += CHECKS.pageTitleOk.weight;
    results.pageTitleOk = {
      pass: titleOk,
      note: !pageTitle ? 'No page title found.' : titleOk ? `Title is a good length (${pageTitle.length} characters).` : `Title is ${pageTitle.length < 10 ? 'too short' : 'too long — Google will truncate it'} (${pageTitle.length} characters).`,
    };

    // 8. Canonical tag
    possible += CHECKS.canonical.weight;
    const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(html);
    if (hasCanonical) earned += CHECKS.canonical.weight;
    results.canonical = { pass: hasCanonical, note: hasCanonical ? 'Has a canonical tag.' : 'No canonical tag — can cause duplicate-content issues in search.' };

    // 9. Open Graph tags (title + image) — affects how the link looks when
    // shared on WhatsApp, Facebook, etc.
    possible += CHECKS.openGraph.weight;
    const hasOgTitle = /<meta[^>]+property=["']og:title["']/i.test(html);
    const hasOgImage = /<meta[^>]+property=["']og:image["']/i.test(html);
    const hasOg = hasOgTitle && hasOgImage;
    if (hasOg) earned += CHECKS.openGraph.weight;
    results.openGraph = { pass: hasOg, note: hasOg ? 'Has Open Graph tags.' : 'Missing Open Graph tags — links shared on WhatsApp/Facebook show no preview image or title.' };

    // 10. Sitemap.xml reachable
    possible += CHECKS.sitemap.weight;
    let hasSitemap = false;
    try {
      const sitemapRes = await safeFetchWithTimeout(new URL('/sitemap.xml', finalUrl).toString(), 4000);
      hasSitemap = !!(sitemapRes && sitemapRes.ok);
    } catch (e) { hasSitemap = false; }
    if (hasSitemap) earned += CHECKS.sitemap.weight;
    results.sitemap = { pass: hasSitemap, note: hasSitemap ? 'sitemap.xml is reachable.' : 'No sitemap.xml found at the standard location — can slow down Google indexing.' };

    // 11. Google Business / LocalBusiness structured data (JSON-LD)
    possible += CHECKS.businessSchema.weight;
    const hasBusinessSchema = /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?(LocalBusiness|Restaurant|Store|ProfessionalService|HomeAndConstructionBusiness|MedicalBusiness)[\s\S]*?<\/script>/i.test(html);
    if (hasBusinessSchema) earned += CHECKS.businessSchema.weight;
    results.businessSchema = { pass: hasBusinessSchema, note: hasBusinessSchema ? 'Has LocalBusiness structured data.' : 'No LocalBusiness schema found — a missed opportunity for richer Google search results.' };

    // 12. Contact info findable
    possible += CHECKS.contactFindable.weight;
    const phonePattern = /(\+?\d[\d\s\-().]{7,}\d)/;
    const hasPhone = phonePattern.test(textOnly);
    const hasEmailLink = /mailto:/i.test(html);
    const hasWaLink = /wa\.me|api\.whatsapp\.com/i.test(html);
    const hasContactWord = /contact us|get in touch|book now|call us/i.test(html);
    const contactOk = hasPhone || hasEmailLink || hasWaLink || hasContactWord;
    if (contactOk) earned += CHECKS.contactFindable.weight;
    results.contactFindable = { pass: contactOk, note: contactOk ? 'Contact info or a contact path is visible.' : 'No clear phone, email, or contact link found on the page.' };

    // 13. Booking / enquiry form
    possible += CHECKS.bookingForm.weight;
    const hasForm = /<form[\s>]/i.test(html);
    if (hasForm) earned += CHECKS.bookingForm.weight;
    results.bookingForm = { pass: hasForm, note: hasForm ? 'Has a form on the page.' : 'No booking or enquiry form found — visitors have no easy way to reach out directly.' };

    // 14. Image alt-text coverage (accessibility + SEO)
    possible += CHECKS.imageAlts.weight;
    const imgTags = html.match(/<img\b[^>]*>/gi) || [];
    const imgsWithAlt = imgTags.filter(t => /alt=["'][^"']+["']/i.test(t));
    const altRatio = imgTags.length ? imgsWithAlt.length / imgTags.length : 1;
    const altOk = imgTags.length === 0 || altRatio >= 0.7;
    if (altOk) earned += CHECKS.imageAlts.weight;
    results.imageAlts = {
      pass: altOk,
      note: imgTags.length === 0
        ? 'No images found on the page.'
        : `${imgsWithAlt.length} of ${imgTags.length} images have alt text${altOk ? '' : ' — most images are missing it, which hurts accessibility and image SEO'}.`,
    };
  } else {
    // Site unreachable — every other check is automatically a fail, but we
    // still report them so the UI can show a full, honest breakdown.
    ALL_KEYS.filter(k => k !== 'reachable').forEach(key => {
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

  // Category roll-up — real weighted sub-scores from the checks above,
  // grouped for the UI. No numbers here are invented; each is earned/possible
  // within that category only.
  const categoryTotals = {};
  ALL_KEYS.forEach(key => {
    const cat = CHECKS[key].category;
    if (!categoryTotals[cat]) categoryTotals[cat] = { earned: 0, possible: 0 };
    categoryTotals[cat].possible += CHECKS[key].weight;
    if (results[key] && results[key].pass) categoryTotals[cat].earned += CHECKS[key].weight;
  });
  const categories = Object.entries(categoryTotals).map(([name, t]) => ({
    name,
    score: t.possible > 0 ? Math.round((t.earned / t.possible) * 100) : 0,
  }));

  const checks = ALL_KEYS.map(key => ({
    key, label: CHECKS[key].label, category: CHECKS[key].category,
    pass: results[key] ? results[key].pass : false,
    note: results[key] ? results[key].note : 'Not checked.',
    weight: CHECKS[key].weight,
  }));

  return {
    url: finalUrl,
    score,
    opportunityScore,
    grade,
    gradeNote,
    pageTitle,
    metaDescriptionText,
    categories,
    checks,
    summary: reachable
      ? `${finalUrl} — Website Health ${score}/100, Opportunity Score ${opportunityScore}/100 (${grade.toLowerCase()}).`
      : `No working website found at "${rawUrl}" — Opportunity Score 100/100 (highest priority lead).`,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { url: rawUrl, compareUrl } = req.body || {};
  if (!rawUrl || typeof rawUrl !== 'string') {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  const result = await runAudit(rawUrl);
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  // Optional second URL — runs a real audit on a second real site so two
  // genuine results can be shown side by side ("compare another website").
  // Never fabricated competitor data — if compareUrl isn't provided or
  // fails, `compare` is simply omitted.
  if (compareUrl && typeof compareUrl === 'string') {
    const compareResult = await runAudit(compareUrl);
    if (!compareResult.error) result.compare = compareResult;
  }

  res.status(200).json(result);
};
