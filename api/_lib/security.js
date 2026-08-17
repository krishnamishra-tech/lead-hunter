// Shared SSRF guard for any endpoint that fetches a user-supplied URL.
// Without this, an endpoint could be used to probe internal services,
// localhost, or cloud metadata endpoints (e.g. 169.254.169.254) via our
// server. Block anything that isn't a public http(s) host before ever
// calling fetch() — and re-check on every redirect hop, since a URL that
// looks safe can still redirect to an internal address.

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

function normalizeUrl(input) {
  let url = String(input || '').trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url;
}

// Fetches with a timeout, and validates every redirect hop before following
// it (redirect: 'manual' + manual loop) — closes the "safe URL redirects to
// an internal address" bypass. Use this instead of a raw fetch() anywhere
// the URL comes from user input.
async function safeFetchWithTimeout(url, ms, extraHeaders) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    let currentUrl = url;
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
        headers: Object.assign(
          { 'User-Agent': 'Mozilla/5.0 (compatible; LocalScoutBot/1.0; +https://localscout.online)' },
          extraHeaders || {}
        ),
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        const nextUrl = new URL(res.headers.get('location'), currentUrl).toString();
        if (!isSafeUrl(nextUrl)) throw new Error('Redirect target not allowed');
        currentUrl = nextUrl;
        continue;
      }
      Object.defineProperty(res, 'url', { value: currentUrl, configurable: true });
      return res;
    }
    throw new Error('Too many redirects');
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { isBlockedHost, isSafeUrl, normalizeUrl, safeFetchWithTimeout };
