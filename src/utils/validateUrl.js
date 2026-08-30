const MAX_URL_LENGTH = 2048;

/**
 * DELIBERATE DUPLICATE of server/utils/validateUrl.js.
 *
 * CRA's ModuleScopePlugin forbids importing from outside src/, so these two
 * modules cannot share code — a relative import of the server copy will not
 * compile. They share a *test fixture* instead (shared/urlValidationCases.json,
 * required by both test suites), which is what actually enforces AC-17.
 *
 * Any change here must be mirrored in the server copy, and vice versa.
 */
export const ERRORS = Object.freeze({
  EMPTY_URL: 'Enter a URL to shorten.',
  INVALID_URL: "That doesn't look like a valid URL. Try something like https://example.com/page",
  UNSUPPORTED_SCHEME: 'Only http and https links can be shortened.',
  BLOCKED_HOST: "Links to local or private network addresses can't be shortened.",
  URL_TOO_LONG: `URLs must be ${MAX_URL_LENGTH} characters or fewer.`,
  SELF_REFERENTIAL: "That's already a short link from this service.",
});

const HAS_AUTHORITY = /^[a-z][a-z0-9+.-]*:\/\//i;
const HAS_SCHEME_PREFIX = /^([a-z][a-z0-9+.-]*):/i;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function normalizeInput(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (HAS_AUTHORITY.test(trimmed)) return trimmed;

  const schemeMatch = trimmed.match(HAS_SCHEME_PREFIX);
  if (schemeMatch && !schemeMatch[1].includes('.')) return trimmed;

  return `https://${trimmed}`;
}

export function isBlockedHost(hostname) {
  if (!hostname) return true;

  const host = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');

  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;

  if (host === '::1' || host === '::') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true;

  const mapped = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  const candidate = mapped ? mapped[1] : host;

  const octets = candidate.match(IPV4);
  if (!octets) return false;

  const [a, b] = [Number(octets[1]), Number(octets[2])];
  if (octets.slice(1).some((part) => Number(part) > 255)) return true;

  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;

  return false;
}

export function isResolvableHost(hostname) {
  return hostname.includes('.') || hostname.includes(':');
}

export function isSelfReferential(parsed, baseUrl) {
  if (!baseUrl) return false;
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return false;
  }
  return parsed.host.toLowerCase() === base.host.toLowerCase();
}

function fail(code) {
  return { ok: false, code, message: ERRORS[code], field: 'url' };
}

function defaultBaseUrl() {
  return typeof window !== 'undefined' && window.location ? window.location.origin : undefined;
}

/**
 * Check order is fixed and tested: empty -> parse -> scheme -> self-referential
 * -> blocked host -> resolvable host -> length.
 */
export function validateUrl(raw, { baseUrl = defaultBaseUrl() } = {}) {
  const normalized = normalizeInput(raw);
  if (!normalized) return fail('EMPTY_URL');

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return fail('INVALID_URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fail('UNSUPPORTED_SCHEME');
  if (!parsed.hostname) return fail('INVALID_URL');
  if (isSelfReferential(parsed, baseUrl)) return fail('SELF_REFERENTIAL');
  if (isBlockedHost(parsed.hostname)) return fail('BLOCKED_HOST');
  if (!isResolvableHost(parsed.hostname)) return fail('INVALID_URL');
  if (parsed.href.length > MAX_URL_LENGTH) return fail('URL_TOO_LONG');

  return { ok: true, normalized: parsed.href };
}

/**
 * AC-34: a stored originalUrl must never reach an href without its scheme being
 * re-checked. Validation on the way in is not a reason to trust data on the way
 * out — a `javascript:` value that ever slipped into the database would
 * otherwise become a click-to-run XSS.
 */
export function isSafeHttpUrl(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export { MAX_URL_LENGTH };
