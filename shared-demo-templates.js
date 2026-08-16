// Shared demo/comparison template engine for LocalScout.
// Used by both demo.html (no-website leads) and comparison.html
// (has-website leads) so the premium template families stay
// identical in both places instead of drifting out of sync.

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function starRow(rating) {
  const full = Math.round(rating || 0);
  return '★'.repeat(Math.max(0, full)) + '☆'.repeat(Math.max(0, 5 - full));
}

// ── Category → template family ──────────────────────────────────────
// Every niche LocalScout supports maps to one of three families. New
// niches added later just need one line here — everything else (the
// actual template rendering) is shared.
const FAMILY_MAP = {
  real_estate: 'trust', dentists: 'trust', clinics: 'trust', law_firms: 'trust',
  ca_firms: 'trust', coaching_centers: 'trust', tuition_centers: 'trust',
  daycare: 'trust', travel_agents: 'trust',

  restaurants: 'transactional', cafes: 'transactional', bakeries: 'transactional',
  pet_services: 'transactional', car_dealers: 'transactional',

  salons: 'visual', gyms: 'visual', interior_designers: 'visual', architects: 'visual',
  boutiques: 'visual', yoga_studios: 'visual', photographers: 'visual',
  event_planners: 'visual', wedding: 'visual', spas: 'visual',
  clothing_boutiques: 'visual', jewellers: 'visual', furniture_stores: 'visual',
  hotels: 'visual', graphic_designers: 'visual', digital_marketers: 'visual',
  video_editors: 'visual',
};
function getFamily(categoryKey) { return FAMILY_MAP[categoryKey] || 'visual'; }

// Short, generic, category-flavored phrases — never fabricates specific
// facts (no invented prices, listings, or menu items), just tone.
const FAMILY_COPY = {
  trust: {
    kicker: (cl, area) => `${cl || 'Local business'}${area ? ' · ' + area : ''}`,
    headline: (n, ci) => `${ci ? 'Serving ' + ci + ' with' : 'Built on'} experience clients actually trust.`,
    body: (n, ci, cl) => `${n} brings real experience and a straightforward approach to every client — no pressure, just honest guidance from someone who knows ${(cl || 'this work').toLowerCase()} in ${ci || 'the local area'}.`,
    sectionTitle: 'What we offer',
    ctaLabel: 'Schedule a call',
    ctaTitle: 'Ready to get started?',
  },
  transactional: {
    kicker: (cl, area) => `${cl || 'Local business'}${area ? ' · ' + area : ''}`,
    headline: (n, ci) => `Quality ${ci ? 'in ' + ci + ', ' : ''}worth coming back for.`,
    body: (n, ci, cl) => `${n} keeps it simple: good ${(cl || 'service').toLowerCase()}, straightforward pricing, and a team that treats every visit like it matters.`,
    sectionTitle: 'Popular right now',
    ctaLabel: 'Order on WhatsApp',
    ctaTitle: 'Ready to order?',
  },
  visual: {
    kicker: (cl, area) => `${cl || 'Local business'}${area ? ' · ' + area : ''}`,
    headline: (n, ci) => `Work that speaks for itself${ci ? ', right here in ' + ci : ''}.`,
    body: (n, ci, cl) => `${n} focuses on craft and detail in every ${(cl || 'project').toLowerCase()} — based in ${ci || 'the local area'}, built around what actually fits the client.`,
    sectionTitle: 'Recent work',
    ctaLabel: 'Get in touch',
    ctaTitle: 'Like what you see?',
  },
};

// ── Family: Trust & Credibility ─────────────────────────────────────
// Real estate, clinics, law/CA firms, tuition — sells on experience and
// proof. Stone paper + bottle green + copper, Fraunces headlines, an
// asymmetric editorial hero, and pen-circle annotations around the
// credibility stats (the signature move of this family).
function renderTrust(d) {
  const copy = FAMILY_COPY.trust;
  const waLink = d.phone ? `https://wa.me/${d.phone}` : null;
  const telLink = d.phone ? `tel:${d.phone}` : null;
  const initials = (d.name || 'B').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  document.title = d.name;
  return `
  <style>
    body{ background:#0D110E; }
    .t-wrap{ max-width:1080px; margin:0 auto; }
    .t-page{ background:#EAE4D6; border-radius:0; }
    .t-nav{ display:flex; justify-content:space-between; align-items:center; padding:22px 5vw; background:#22392F; position:sticky; top:0; z-index:5; }
    .t-brand{ color:#EAE4D6; font-family:'Fraunces',Georgia,serif; font-weight:500; font-size:18px; }
    .t-brand em{ color:#C79A6C; font-style:normal; }
    .t-cta{ border:1px solid rgba(234,228,214,0.3); color:#EAE4D6; font-size:12px; font-weight:600; padding:10px 18px; border-radius:2px; letter-spacing:0.03em; text-transform:uppercase; }
    .t-hero{ display:grid; grid-template-columns:1.1fr 0.9fr; min-height:340px; }
    .t-copy{ padding:56px 5vw 30px; display:flex; flex-direction:column; justify-content:center; }
    .t-kicker{ font-family:ui-monospace,monospace; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:#9C6B45; margin-bottom:14px; display:flex; align-items:center; gap:9px; }
    .t-kicker::before{ content:""; width:22px; height:1px; background:#9C6B45; }
    .t-copy h1{ font-family:'Fraunces',Georgia,serif; font-weight:500; font-size:clamp(28px,4vw,44px); line-height:1.08; letter-spacing:-0.015em; color:#1B1912; margin-bottom:18px; }
    .t-copy p{ font-size:14.5px; color:#5B5648; line-height:1.65; max-width:400px; margin-bottom:26px; }
    .t-stats{ display:flex; gap:30px; flex-wrap:wrap; }
    .t-stat{ position:relative; }
    .t-stat b{ display:block; font-family:'Fraunces',Georgia,serif; font-weight:500; font-size:22px; color:#1B1912; }
    .t-stat span{ font-size:10.5px; color:#7A7563; letter-spacing:0.04em; text-transform:uppercase; }
    .t-stat.circled::before{
      content:""; position:absolute; top:-8px; left:-14px; right:-14px; bottom:-6px;
      border:1.5px solid #9C6B45; border-radius:50%; opacity:0.55; pointer-events:none;
      transform:rotate(-3deg);
    }
    .t-photo{ position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center;
      background:radial-gradient(120% 100% at 80% 0%, #3E5A4A 0%, transparent 55%), radial-gradient(100% 90% at 10% 100%, #C79A6C 0%, transparent 45%), linear-gradient(160deg, #22392F 0%, #17251E 100%); }
    .t-avatar{ width:96px; height:96px; border-radius:50%; background:rgba(234,228,214,0.1); border:1px solid rgba(234,228,214,0.25); display:flex; align-items:center; justify-content:center; color:#EAE4D6; font-family:'Fraunces',Georgia,serif; font-size:30px; font-weight:500; }
    .t-services{ padding:10px 5vw 40px; }
    .t-services .head{ display:flex; justify-content:space-between; align-items:baseline; margin-bottom:22px; }
    .t-services .head h2{ font-family:'Fraunces',Georgia,serif; font-weight:500; font-size:19px; color:#1B1912; }
    .t-grid{ display:grid; grid-template-columns:1.4fr 1fr; grid-template-rows:auto auto; gap:14px; }
    .t-card{ background:#fff; border-radius:6px; border:1px solid rgba(27,25,18,0.07); overflow:hidden; }
    .t-card.big{ grid-row:span 2; min-height:230px; display:flex; flex-direction:column; }
    .t-card .img{ height:100px; background:linear-gradient(135deg,#3C4C5A,#28333E); }
    .t-card.big .img{ flex:1; }
    .t-card .info{ padding:14px 16px; }
    .t-card .tag{ display:inline-block; font-size:9.5px; letter-spacing:0.08em; text-transform:uppercase; color:#9C6B45; font-family:ui-monospace,monospace; margin-bottom:6px; }
    .t-card .name{ font-weight:600; font-size:13.5px; color:#1B1912; }
    .t-card .sub{ font-size:11.5px; color:#8A8570; margin-top:2px; }
    .t-quote{ margin:0 5vw 40px; padding:30px 32px; background:#DFD8C6; border-radius:6px; position:relative; }
    .t-quote .mark{ font-family:'Fraunces',Georgia,serif; font-size:56px; color:#9C6B45; opacity:0.35; line-height:0.6; display:block; margin-bottom:8px; }
    .t-quote p{ font-size:15px; color:#3A382F; line-height:1.65; font-style:italic; max-width:540px; }
    .t-quote .who{ margin-top:14px; font-style:normal; font-size:11px; color:#8A8570; font-family:ui-monospace,monospace; letter-spacing:0.03em; }
    .t-map{ padding:10px 5vw 44px; }
    .t-map h2{ font-family:'Fraunces',Georgia,serif; font-weight:500; font-size:19px; color:#1B1912; margin-bottom:16px; }
    .t-map-box{ height:180px; border-radius:6px; position:relative; overflow:hidden; background:#DFD8C6;
      background-image: linear-gradient(rgba(27,25,18,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(27,25,18,0.06) 1px, transparent 1px);
      background-size:28px 28px; }
    .t-pin{ position:absolute; top:50%; left:50%; transform:translate(-50%,-100%); }
    .t-pin .dot{ width:16px; height:16px; border-radius:50% 50% 50% 0; background:#9C6B45; transform:rotate(-45deg); margin:0 auto; box-shadow:0 4px 10px rgba(0,0,0,0.25); }
    .t-pin .ring{ position:absolute; top:8px; left:50%; transform:translateX(-50%); width:36px; height:36px; border-radius:50%; border:1.5px solid #9C6B45; opacity:0.5; animation:tping 2s ease-out infinite; }
    @keyframes tping{ 0%{ transform:translateX(-50%) scale(0.6); opacity:0.6; } 100%{ transform:translateX(-50%) scale(1.6); opacity:0; } }
    .t-foot{ background:#22392F; padding:26px 5vw; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
    .t-foot .addr{ font-size:12.5px; color:rgba(234,228,214,0.6); }
    .t-foot .stars{ font-size:12px; color:#C79A6C; font-family:ui-monospace,monospace; }
    .t-foot .btn{ background:#C79A6C; color:#17251E; font-size:12.5px; font-weight:700; padding:11px 20px; border-radius:3px; }
    @media (max-width:760px){ .t-hero{ grid-template-columns:1fr; } .t-grid{ grid-template-columns:1fr; } .t-card.big{ grid-row:span 1; min-height:auto; } .t-nav, .t-copy, .t-services, .t-map{ padding-left:6vw; padding-right:6vw; } .t-quote{ margin-left:6vw; margin-right:6vw; } }
  </style>
  <div class="t-wrap">
    <div class="t-page">
      <nav class="t-nav rise r1">
        <div class="t-brand">${esc(d.name)}</div>
        ${telLink ? `<a href="${telLink}" class="t-cta">${esc(copy.ctaLabel)}</a>` : `<span class="t-cta">${esc(copy.ctaLabel)}</span>`}
      </nav>
      <div class="t-hero">
        <div class="t-copy rise r2">
          <span class="t-kicker">${esc(copy.kicker(d.categoryLabel, [d.area, d.city].filter(Boolean).join(' · ')))}</span>
          <h1>${esc(copy.headline(d.name, d.city))}</h1>
          <p>${esc(copy.body(d.name, d.city, d.categoryLabel))}</p>
          <div class="t-stats">
            ${d.rating ? `<div class="t-stat circled"><b>${esc(d.rating)}★</b><span>${d.ratingCount ? esc(d.ratingCount) + ' reviews' : 'Rated locally'}</span></div>` : ''}
            <div class="t-stat"><b>Local</b><span>${esc(d.city || 'Trusted nearby')}</span></div>
          </div>
        </div>
        <div class="t-photo rise r2"><div class="t-avatar">${esc(initials)}</div></div>
      </div>
      <div class="t-services rise r3">
        <div class="head"><h2>${esc(copy.sectionTitle)}</h2></div>
        <div class="t-grid">
          <div class="t-card big"><div class="img"></div><div class="info"><span class="tag">Featured</span><div class="name">${esc(d.categoryLabel || 'Service')}</div><div class="sub">Ask about current availability</div></div></div>
          <div class="t-card"><div class="img" style="background:linear-gradient(135deg,#9C6B45,#6E4A2E);"></div><div class="info"><div class="name">${esc(d.categoryLabel || 'Service')}</div><div class="sub">Get in touch to learn more</div></div></div>
          <div class="t-card"><div class="img" style="background:linear-gradient(135deg,#5C6E54,#3E4A38);"></div><div class="info"><div class="name">Consultation</div><div class="sub">A no-pressure first conversation</div></div></div>
        </div>
      </div>
      ${d.rating ? `
      <div class="t-quote rise r3">
        <span class="mark">"</span>
        <p>Real, verified reviews from ${esc(d.ratingCount || 'satisfied')} customers back this business on Google.</p>
        <div class="who">— ${esc(d.rating)}★ average on Google</div>
      </div>` : ''}
      <div class="t-map rise r4">
        <h2>Find us</h2>
        <div class="t-map-box">
          <div class="t-pin"><div class="ring"></div><div class="dot"></div></div>
        </div>
      </div>
      <div class="t-foot">
        <div class="addr">${esc([d.area, d.city].filter(Boolean).join(', ') || 'Get in touch for directions')}</div>
        ${d.rating ? `<div class="stars">${starRow(d.rating)} ${esc(d.rating)} · ${esc(d.ratingCount || 0)} reviews</div>` : '<div></div>'}
        ${waLink ? `<a href="${waLink}" target="_blank" rel="noopener" class="btn">${esc(copy.ctaTitle)}</a>` : ''}
      </div>
    </div>
  </div>`;
}

// ── Family: Local & Transactional ───────────────────────────────────
// Restaurants, cafes, bakeries, pet services, auto — sells on
// immediacy. Dark charcoal + saffron/maroon, Fraunces headlines, an
// "open now" pulse strip and a ticket-stub badge (signature move).
function renderTransactional(d) {
  const copy = FAMILY_COPY.transactional;
  const waLink = d.phone ? `https://wa.me/${d.phone}` : null;

  document.title = d.name;
  return `
  <style>
    body{ background:#0A0807; }
    .x-wrap{ max-width:1100px; margin:0 auto; }
    .x-page{ background:#1A1512; }
    .x-nav{ display:flex; justify-content:space-between; align-items:center; padding:22px 5vw; background:#241D18; border-bottom:1px solid rgba(242,234,217,0.06); position:sticky; top:0; z-index:5; }
    .x-brand .name{ color:#F2EAD9; font-family:'Fraunces',Georgia,serif; font-weight:700; font-size:18px; }
    .x-brand .tag{ font-size:10px; color:#E0A73E; letter-spacing:0.08em; text-transform:uppercase; font-family:ui-monospace,monospace; }
    .x-cta{ background:#E0A73E; color:#1A1512; font-size:12px; font-weight:800; padding:11px 18px; border-radius:3px; letter-spacing:0.02em; text-transform:uppercase; }
    .x-open{ display:flex; align-items:center; gap:8px; padding:11px 5vw; background:rgba(224,167,62,0.08); border-bottom:1px solid rgba(224,167,62,0.15); font-size:11.5px; color:#F0C876; font-family:ui-monospace,monospace; letter-spacing:0.03em; }
    .x-dot{ width:7px; height:7px; border-radius:50%; background:#6FBF73; position:relative; }
    .x-dot::after{ content:""; position:absolute; inset:-4px; border-radius:50%; border:1px solid #6FBF73; animation:xping 1.8s ease-out infinite; }
    @keyframes xping{ 0%{ transform:scale(0.7); opacity:1; } 100%{ transform:scale(2); opacity:0; } }
    .x-hero{ display:grid; grid-template-columns:1fr 1fr; min-height:320px; }
    .x-copy{ padding:44px 5vw 30px; display:flex; flex-direction:column; justify-content:center; }
    .x-kicker{ font-family:ui-monospace,monospace; font-size:10.5px; letter-spacing:0.14em; text-transform:uppercase; color:#E0A73E; margin-bottom:14px; }
    .x-copy h1{ font-family:'Fraunces',Georgia,serif; font-weight:700; font-size:clamp(28px,4vw,42px); line-height:1.06; color:#F2EAD9; margin-bottom:16px; letter-spacing:-0.01em; }
    .x-copy p{ font-size:13.5px; color:rgba(242,234,217,0.55); line-height:1.6; max-width:360px; margin-bottom:26px; }
    .x-ctas{ display:flex; gap:12px; flex-wrap:wrap; }
    .x-btn-p{ background:#E0A73E; color:#1A1512; font-size:12.5px; font-weight:800; padding:13px 22px; border-radius:3px; letter-spacing:0.02em; text-transform:uppercase; }
    .x-btn-g{ border:1px solid rgba(242,234,217,0.25); color:#F2EAD9; font-size:12.5px; font-weight:600; padding:13px 22px; border-radius:3px; letter-spacing:0.02em; text-transform:uppercase; }
    .x-photo{ position:relative; overflow:hidden; background:radial-gradient(110% 90% at 85% 15%, #9C3D4B 0%, transparent 55%), radial-gradient(90% 80% at 15% 100%, #E0A73E 0%, transparent 45%), linear-gradient(160deg, #241D18 0%, #14100D 100%); }
    .x-ticket{ position:absolute; top:22px; left:22px; background:#6E2430; color:#F2EAD9; padding:11px 18px 11px 15px; border-radius:2px; transform:rotate(-4deg); box-shadow:0 12px 26px -10px rgba(0,0,0,0.5); }
    .x-ticket::before, .x-ticket::after{ content:""; position:absolute; width:12px; height:12px; background:#1A1512; border-radius:50%; top:50%; transform:translateY(-50%); }
    .x-ticket::before{ left:-6px; } .x-ticket::after{ right:-6px; }
    .x-ticket .t1{ font-family:ui-monospace,monospace; font-size:9px; letter-spacing:0.1em; text-transform:uppercase; opacity:0.75; }
    .x-ticket .t2{ font-family:'Fraunces',Georgia,serif; font-weight:700; font-size:14px; margin-top:2px; }
    .x-menu{ padding:10px 5vw 34px; }
    .x-menu .head{ display:flex; justify-content:space-between; align-items:baseline; margin-bottom:18px; }
    .x-menu .head h2{ font-family:'Fraunces',Georgia,serif; font-weight:700; font-size:18px; color:#F2EAD9; }
    .x-dishes{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
    .x-dish{ background:#241D18; border-radius:8px; overflow:hidden; border:1px solid rgba(242,234,217,0.06); }
    .x-dimg{ height:88px; }
    .x-dinfo{ padding:13px 15px; }
    .x-dname{ font-size:13px; font-weight:600; color:#F2EAD9; }
    .x-dsub{ font-size:11px; color:rgba(242,234,217,0.4); margin-top:5px; }
    .x-strip{ display:flex; justify-content:space-between; align-items:center; padding:20px 5vw; background:#241D18; border-top:1px solid rgba(242,234,217,0.06); flex-wrap:wrap; gap:12px; }
    .x-strip .hours{ font-size:12.5px; color:rgba(242,234,217,0.55); }
    .x-strip .stars{ font-size:12px; color:#F0C876; font-family:ui-monospace,monospace; }
    @media (max-width:760px){ .x-hero{ grid-template-columns:1fr; } .x-photo{ min-height:170px; } .x-dishes{ grid-template-columns:1fr 1fr; } .x-nav, .x-copy, .x-menu, .x-strip, .x-open{ padding-left:6vw; padding-right:6vw; } }
  </style>
  <div class="x-wrap">
    <div class="x-page">
      <nav class="x-nav rise r1">
        <div class="x-brand"><div class="name">${esc(d.name)}</div><div class="tag">${esc(d.categoryLabel || 'Local business')}</div></div>
        ${d.phone ? `<a href="${waLink}" target="_blank" rel="noopener" class="x-cta">💬 ${esc(copy.ctaLabel)}</a>` : `<span class="x-cta">${esc(copy.ctaLabel)}</span>`}
      </nav>
      <div class="x-open rise r1"><span class="x-dot"></span> Open now</div>
      <div class="x-hero">
        <div class="x-copy rise r2">
          <span class="x-kicker">${esc(copy.kicker(d.categoryLabel, d.city))}</span>
          <h1>${esc(copy.headline(d.name, d.city))}</h1>
          <p>${esc(copy.body(d.name, d.city, d.categoryLabel))}</p>
          <div class="x-ctas">
            ${waLink ? `<a href="${waLink}" target="_blank" rel="noopener" class="x-btn-p">${esc(copy.ctaLabel)}</a>` : `<span class="x-btn-p">${esc(copy.ctaLabel)}</span>`}
            <a href="#menu" class="x-btn-g">View more</a>
          </div>
        </div>
        <div class="x-photo rise r2">
          <div class="x-ticket"><div class="t1">Ask about</div><div class="t2">Today's special</div></div>
        </div>
      </div>
      <div class="x-menu rise r3" id="menu">
        <div class="head"><h2>${esc(copy.sectionTitle)}</h2></div>
        <div class="x-dishes">
          <div class="x-dish"><div class="x-dimg" style="background:linear-gradient(150deg,#9C3D4B,#6E2430);"></div><div class="x-dinfo"><div class="x-dname">Ask for today's picks</div><div class="x-dsub">Message to check availability</div></div></div>
          <div class="x-dish"><div class="x-dimg" style="background:linear-gradient(150deg,#E0A73E,#B5822B);"></div><div class="x-dinfo"><div class="x-dname">${esc(d.categoryLabel || 'Popular choice')}</div><div class="x-dsub">Customer favorite</div></div></div>
          <div class="x-dish"><div class="x-dimg" style="background:linear-gradient(150deg,#7A6A4E,#4E4432);"></div><div class="x-dinfo"><div class="x-dname">Full menu on request</div><div class="x-dsub">Send a message anytime</div></div></div>
        </div>
      </div>
      <div class="x-strip rise r4">
        <div class="hours">${esc([d.area, d.city].filter(Boolean).join(', ') || 'Contact for hours')}</div>
        ${d.rating ? `<div class="stars">${starRow(d.rating)} ${esc(d.rating)} · ${esc(d.ratingCount || 0)} reviews</div>` : ''}
      </div>
    </div>
  </div>`;
}

// ── Family: Visual & Lifestyle ──────────────────────────────────────
// Salons, gyms, designers, spas, photographers, boutiques — sells on
// look and craft. Warm sage + near-black + gold, Fraunces headlines,
// split hero, icon feature strip, services grid with photo cards, a
// dark "who we are" section, real-rating trust cards (no fabricated
// quotes/names), and a contact strip footer.
function renderVisual(d) {
  const copy = FAMILY_COPY.visual;
  const waLink = d.phone ? `https://wa.me/${d.phone}` : null;
  const telLink = d.phone ? `tel:${d.phone}` : null;
  const initials = (d.name || 'B').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const catLower = (d.categoryLabel || 'this work').toLowerCase();

  const features = [
    { t: 'Skilled team', s: 'Experienced & attentive' },
    { t: 'Quality, always', s: 'Nothing cut short' },
    { t: 'Personal approach', s: 'Tailored to you' },
    { t: 'Local & trusted', s: d.city ? `Based in ${d.city}` : 'Right nearby' },
  ];
  const services = [
    { c1: '#5C6E54', c2: '#3E4A38', t: d.categoryLabel || 'Core service', s: `Our main ${catLower}, done right.` },
    { c1: '#B8923D', c2: '#8C7031', t: 'Consultation', s: 'A relaxed first conversation, no pressure.' },
    { c1: '#3C4C5A', c2: '#28333E', t: 'Personalized plans', s: 'Built around what you actually need.' },
    { c1: '#9C6B45', c2: '#6E4A2E', t: 'Follow-up care', s: "We're here after, not just during." },
  ];

  document.title = d.name;
  return `
  <style>
    body{ background:#12160F; }
    .v-wrap{ max-width:1160px; margin:0 auto; }
    .v-page{ background:#F7F2E7; }
    .v-nav{ display:flex; justify-content:space-between; align-items:center; padding:20px 5vw; position:absolute; top:0; left:0; right:0; z-index:5; }
    .v-brandrow{ display:flex; align-items:center; gap:12px; }
    .v-mark{ width:38px; height:38px; border-radius:50%; border:1px solid rgba(247,242,231,0.4); display:flex; align-items:center; justify-content:center; color:#D9BE7C; font-family:'Fraunces',Georgia,serif; font-size:13px; font-weight:600; flex-shrink:0; }
    .v-brand .name{ color:#F7F2E7; font-family:'Fraunces',Georgia,serif; font-weight:600; font-size:16px; line-height:1.2; }
    .v-brand .tag{ color:rgba(247,242,231,0.55); font-size:9px; letter-spacing:0.1em; text-transform:uppercase; margin-top:2px; }
    .v-navlinks{ display:flex; align-items:center; gap:26px; }
    .v-navlinks a{ color:rgba(247,242,231,0.75); font-size:12.5px; }
    .v-cta{ background:#D9BE7C; color:#1C2214; font-size:12px; font-weight:700; padding:10px 18px; border-radius:30px; letter-spacing:0.02em; }
    @media (max-width:860px){ .v-navlinks{ display:none; } }

    .v-hero{ position:relative; min-height:480px; display:grid; grid-template-columns:1.15fr 0.85fr;
      background:linear-gradient(165deg, #2E3B27 0%, #171E12 100%); }
    .v-hero-copy{ padding:96px 5vw 40px; display:flex; flex-direction:column; justify-content:center; }
    .v-kicker{ font-family:ui-monospace,monospace; font-size:11px; letter-spacing:0.16em; text-transform:uppercase; color:#D9BE7C; margin-bottom:16px; }
    .v-hero h1{ font-family:'Fraunces',Georgia,serif; font-weight:600; font-size:clamp(28px,4.4vw,46px); line-height:1.08; color:#F7F2E7; letter-spacing:-0.015em; margin-bottom:16px; }
    .v-hero p{ font-size:13.5px; color:rgba(247,242,231,0.6); max-width:400px; line-height:1.65; margin-bottom:26px; }
    .v-herobtns{ display:flex; gap:12px; flex-wrap:wrap; }
    .v-btn-p{ background:#D9BE7C; color:#1C2214; font-size:12.5px; font-weight:700; padding:13px 22px; border-radius:30px; display:inline-flex; align-items:center; gap:6px; }
    .v-btn-g{ border:1px solid rgba(247,242,231,0.3); color:#F7F2E7; font-size:12.5px; font-weight:600; padding:13px 22px; border-radius:30px; }
    .v-hero-photo{ position:relative; overflow:hidden;
      background:radial-gradient(120% 100% at 75% 15%, #4E6146 0%, transparent 55%), radial-gradient(90% 80% at 15% 90%, #B8923D 0%, transparent 45%), linear-gradient(160deg, #26311F 0%, #14180F 100%); }
    @media (max-width:820px){ .v-hero{ grid-template-columns:1fr; } .v-hero-photo{ min-height:180px; } .v-hero-copy{ padding-top:110px; } }

    .v-featstrip{ background:#1B2317; display:flex; flex-wrap:wrap; }
    .v-feat{ flex:1 1 220px; display:flex; align-items:center; gap:12px; padding:20px 5vw; border-right:1px solid rgba(247,242,231,0.06); }
    .v-feat:last-child{ border-right:none; }
    .v-feat-ic{ width:34px; height:34px; border-radius:50%; background:rgba(217,190,124,0.12); border:1px solid rgba(217,190,124,0.35); flex-shrink:0; display:flex; align-items:center; justify-content:center; color:#D9BE7C; font-size:14px; }
    .v-feat .t{ font-size:12.5px; font-weight:600; color:#F7F2E7; }
    .v-feat .s{ font-size:10.5px; color:rgba(247,242,231,0.45); margin-top:2px; }

    .v-services{ padding:64px 5vw 20px; }
    .v-services .head{ display:flex; justify-content:space-between; align-items:baseline; margin-bottom:26px; flex-wrap:wrap; gap:10px; }
    .v-services .k{ font-family:ui-monospace,monospace; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:#8C9E6F; margin-bottom:10px; display:block; }
    .v-services h2{ font-family:'Fraunces',Georgia,serif; font-weight:500; font-size:26px; color:#2A2818; }
    .v-sgrid{ display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
    .v-scard{ background:#fff; border-radius:10px; overflow:hidden; border:1px solid rgba(27,25,18,0.06); }
    .v-simg{ height:110px; position:relative; }
    .v-sbadge{ position:absolute; bottom:-16px; left:14px; width:34px; height:34px; border-radius:50%; background:#F7F2E7; border:3px solid #fff; display:flex; align-items:center; justify-content:center; color:#3E4A38; font-size:13px; box-shadow:0 4px 10px rgba(0,0,0,0.12); }
    .v-sinfo{ padding:26px 16px 16px; }
    .v-sinfo .t{ font-weight:600; font-size:13.5px; color:#1B1912; margin-bottom:5px; }
    .v-sinfo .s{ font-size:11.5px; color:#7A7563; line-height:1.5; margin-bottom:10px; }
    .v-sinfo .more{ font-size:11px; font-weight:600; color:#7A8F5E; }
    @media (max-width:820px){ .v-sgrid{ grid-template-columns:1fr 1fr; } }
    @media (max-width:520px){ .v-sgrid{ grid-template-columns:1fr; } }

    .v-about{ background:linear-gradient(165deg, #2E3B27 0%, #171E12 100%); display:grid; grid-template-columns:1fr 1fr; margin-top:56px; }
    .v-about-copy{ padding:60px 5vw; }
    .v-about-copy .k{ font-family:ui-monospace,monospace; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:#D9BE7C; margin-bottom:14px; }
    .v-about-copy h2{ font-family:'Fraunces',Georgia,serif; font-weight:500; font-size:26px; color:#F7F2E7; line-height:1.2; margin-bottom:16px; max-width:320px; position:relative; padding-bottom:14px; }
    .v-about-copy h2::after{ content:""; position:absolute; bottom:0; left:0; width:44px; height:2px; background:#D9BE7C; }
    .v-about-copy p{ font-size:13px; color:rgba(247,242,231,0.6); line-height:1.7; max-width:380px; margin-bottom:24px; }
    .v-checks{ display:flex; gap:20px; flex-wrap:wrap; margin-bottom:26px; }
    .v-check{ display:flex; align-items:center; gap:8px; font-size:12px; color:rgba(247,242,231,0.8); }
    .v-check .ic{ width:24px; height:24px; border-radius:50%; background:rgba(217,190,124,0.14); display:flex; align-items:center; justify-content:center; color:#D9BE7C; font-size:11px; flex-shrink:0; }
    .v-about-photo{ position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center;
      background:radial-gradient(100% 90% at 30% 20%, #4E6146 0%, transparent 55%), radial-gradient(90% 80% at 90% 90%, #B8923D 0%, transparent 45%), linear-gradient(160deg, #202A19 0%, #121710 100%); }
    .v-about-mark{ text-align:center; }
    .v-about-mark .ring{ width:64px; height:64px; border-radius:50%; border:1px solid rgba(217,190,124,0.5); display:flex; align-items:center; justify-content:center; margin:0 auto 12px; color:#D9BE7C; font-family:'Fraunces',Georgia,serif; font-size:22px; }
    .v-about-mark .n{ font-family:'Fraunces',Georgia,serif; color:#F7F2E7; font-size:14px; letter-spacing:0.05em; }
    @media (max-width:820px){ .v-about{ grid-template-columns:1fr; } .v-about-photo{ min-height:200px; } }

    .v-trust{ padding:60px 5vw; }
    .v-trust .k{ font-family:ui-monospace,monospace; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:#8C9E6F; margin-bottom:10px; }
    .v-trust h2{ font-family:'Fraunces',Georgia,serif; font-weight:500; font-size:24px; color:#2A2818; margin-bottom:26px; max-width:360px; }
    .v-tgrid{ display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
    .v-tcard{ background:#fff; border-radius:10px; padding:22px 20px; border:1px solid rgba(27,25,18,0.06); }
    .v-tcard .stars{ color:#D9BE7C; font-size:14px; letter-spacing:2px; margin-bottom:12px; }
    .v-tcard .big{ font-family:'Fraunces',Georgia,serif; font-size:26px; color:#1B1912; font-weight:500; margin-bottom:4px; }
    .v-tcard .lbl{ font-size:11px; color:#8A8570; letter-spacing:0.03em; text-transform:uppercase; }
    @media (max-width:760px){ .v-tgrid{ grid-template-columns:1fr; } }

    .v-footcta{ background:#171E12; padding:34px 5vw; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:24px; }
    .v-footcta-left{ display:flex; align-items:center; gap:16px; max-width:340px; }
    .v-footcta-ic{ width:44px; height:44px; border-radius:50%; background:rgba(217,190,124,0.14); border:1px solid rgba(217,190,124,0.35); display:flex; align-items:center; justify-content:center; color:#D9BE7C; font-size:18px; flex-shrink:0; }
    .v-footcta-left .t{ color:#F7F2E7; font-weight:600; font-size:14px; }
    .v-footcta-left .s{ color:rgba(247,242,231,0.5); font-size:11.5px; margin-top:3px; }
    .v-contacts{ display:flex; gap:34px; flex-wrap:wrap; }
    .v-contact{ display:flex; align-items:center; gap:10px; }
    .v-contact .ic{ font-size:15px; color:#D9BE7C; }
    .v-contact .t{ font-size:9.5px; color:rgba(247,242,231,0.45); text-transform:uppercase; letter-spacing:0.06em; }
    .v-contact .v{ font-size:12.5px; color:#F7F2E7; font-weight:500; }
    .v-bottom{ padding:16px 5vw; background:#12160F; text-align:center; font-size:11px; color:rgba(247,242,231,0.35); }
    @media (max-width:760px){ .v-featstrip{ flex-direction:column; } .v-feat{ border-right:none; border-bottom:1px solid rgba(247,242,231,0.06); } }
  </style>
  <div class="v-wrap">
    <div class="v-page">
      <div class="v-hero">
        <nav class="v-nav rise r1">
          <div class="v-brandrow">
            <div class="v-mark">${esc(initials)}</div>
            <div class="v-brand"><div class="name">${esc(d.name)}</div><div class="tag">${esc(d.categoryLabel || 'Local business')}</div></div>
          </div>
          <div class="v-navlinks"><a href="#services">Services</a><a href="#about">About</a><a href="#contact">Contact</a></div>
          ${telLink ? `<a href="${telLink}" class="v-cta">${esc(copy.ctaLabel)}</a>` : `<span class="v-cta">${esc(copy.ctaLabel)}</span>`}
        </nav>
        <div class="v-hero-copy rise r2">
          <div class="v-kicker">${esc(copy.kicker(d.categoryLabel, d.city))}</div>
          <h1>${esc(copy.headline(d.name, d.city))}</h1>
          <p>${esc(copy.body(d.name, d.city, d.categoryLabel))}</p>
          <div class="v-herobtns">
            ${waLink ? `<a href="${waLink}" target="_blank" rel="noopener" class="v-btn-p">${esc(copy.ctaLabel)} →</a>` : `<span class="v-btn-p">${esc(copy.ctaLabel)} →</span>`}
            <a href="#services" class="v-btn-g">Explore services</a>
          </div>
        </div>
        <div class="v-hero-photo rise r2"></div>
      </div>

      <div class="v-featstrip rise r2">
        ${features.map(f => `<div class="v-feat"><div class="v-feat-ic">✦</div><div><div class="t">${esc(f.t)}</div><div class="s">${esc(f.s)}</div></div></div>`).join('')}
      </div>

      <div class="v-services rise r3" id="services">
        <div class="head">
          <div><span class="k">Our services</span><h2>What we offer</h2></div>
        </div>
        <div class="v-sgrid">
          ${services.map(s => `
            <div class="v-scard">
              <div class="v-simg" style="background:linear-gradient(135deg,${s.c1},${s.c2});"><div class="v-sbadge">✦</div></div>
              <div class="v-sinfo"><div class="t">${esc(s.t)}</div><div class="s">${esc(s.s)}</div><div class="more">Learn more →</div></div>
            </div>`).join('')}
        </div>
      </div>

      <div class="v-about rise r3" id="about">
        <div class="v-about-copy">
          <div class="k">Who we are</div>
          <h2>Crafted with care, focused on you</h2>
          <p>${esc(copy.body(d.name, d.city, d.categoryLabel))}</p>
          <div class="v-checks">
            <div class="v-check"><span class="ic">✓</span>Personalized approach</div>
            <div class="v-check"><span class="ic">✓</span>${d.city ? esc('Based in ' + d.city) : 'Locally based'}</div>
            <div class="v-check"><span class="ic">✓</span>${d.rating ? 'Trusted by clients' : 'Client-first'}</div>
          </div>
          ${telLink ? `<a href="${telLink}" class="v-btn-p">Learn more about us →</a>` : ''}
        </div>
        <div class="v-about-photo">
          <div class="v-about-mark"><div class="ring">${esc(initials)}</div><div class="n">${esc(d.name.toUpperCase())}</div></div>
        </div>
      </div>

      ${d.rating ? `
      <div class="v-trust rise r3">
        <span class="k">Client love</span>
        <h2>Trusted by real customers</h2>
        <div class="v-tgrid">
          <div class="v-tcard"><div class="stars">${starRow(d.rating)}</div><div class="big">${esc(d.rating)} / 5</div><div class="lbl">Overall Google rating</div></div>
          <div class="v-tcard"><div class="stars">${starRow(d.rating)}</div><div class="big">${esc(d.ratingCount || 0)}</div><div class="lbl">Verified Google reviews</div></div>
          <div class="v-tcard"><div class="stars">${starRow(d.rating)}</div><div class="big">${esc(d.city || 'Local')}</div><div class="lbl">Serving the area</div></div>
        </div>
      </div>` : ''}

      <div class="v-footcta rise r4" id="contact">
        <div class="v-footcta-left">
          <div class="v-footcta-ic">✦</div>
          <div><div class="t">${esc(copy.ctaTitle)}</div><div class="s">${esc([d.area, d.city].filter(Boolean).join(', ') || "We'd love to hear from you.")}</div></div>
        </div>
        <div class="v-contacts">
          ${waLink ? `<a href="${waLink}" target="_blank" rel="noopener" class="v-contact"><span class="ic">💬</span><div><div class="t">Message</div><div class="v">WhatsApp</div></div></a>` : ''}
          ${telLink ? `<a href="${telLink}" class="v-contact"><span class="ic">📞</span><div><div class="t">Call</div><div class="v">${esc(d.phone)}</div></div></a>` : ''}
          ${(d.area || d.city) ? `<div class="v-contact"><span class="ic">📍</span><div><div class="t">Visit</div><div class="v">${esc([d.area, d.city].filter(Boolean).join(', '))}</div></div></div>` : ''}
        </div>
      </div>
      <div class="v-bottom">© ${new Date().getFullYear()} ${esc(d.name)}</div>
    </div>
  </div>`;
}

const RENDERERS = { trust: renderTrust, transactional: renderTransactional, visual: renderVisual };
