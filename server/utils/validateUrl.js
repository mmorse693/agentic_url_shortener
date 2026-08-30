'use strict';

const MAX_URL_LENGTH = 2048;

/**
 * Every user-facing validation string, in one place.
 *
 * NOTE: src/utils/validateUrl.js is a deliberate duplicate of this module.
 * CRA's ModuleScopePlugin forbids importing from outside src/, so the two
 * cannot share code. They share a *test fixture* instead —
 * shared/urlValidationCases.json — which is what actually enforces AC-17.
 * Any change here must be mirrored there.
 */
const ERRORS = Object.freeze({
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

/**
 * Trims, then adds a scheme when the input clearly has none.
 *
 * The `.` check is what separates `example.com:8080/path` (a host with a port,
 * which gets https://) from `javascript:alert(1)` (a real scheme, which is
 * left alone so the scheme check below can reject it).
 */
function normalizeInput(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (HAS_AUTHORITY.test(trimmed)) return trimmed;

  const schemeMatch = trimmed.match(HAS_SCHEME_PREFIX);
  if (schemeMatch && !schemeMatch[1].includes('.')) return trimmed;

  return `https://${trimmed}`;
}

function isBlockedHost(hostname) {
  if (!hostname) return true;

  const host = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');

  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;

  // IPv6 loopback, unspecified, unique-local (fc00::/7), link-local (fe80::/10)
  if (host === '::1' || host === '::') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true;

  // IPv4-mapped IPv6 (::ffff:127.0.0.1) collapses to its IPv4 form
  const mapped = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  const candidate = mapped ? mapped[1] : host;

  const octets = candidate.match(IPV4);
  if (!octets) return false;

  const [a, b] = [Number(octets[1]), Number(octets[2])];
  if (octets.slice(1).some((part) => Number(part) > 255)) return true;

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16

  return false;
}

/**
 * A public shortener can only forward to a publicly resolvable host, so a
 * dotless hostname is a typo, not a destination. This is what stops junk like
 * `///nope` (which the URL parser happily reads as the host `nope`) from being
 * accepted. IP literals are exempt — they carry dots, or colons for IPv6.
 */
function isResolvableHost(hostname) {
  return hostname.includes('.') || hostname.includes(':');
}

function isSelfReferential(parsed, baseUrl) {
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

/**
 * Check order is fixed and tested: empty -> parse -> scheme -> self-referential
 * -> blocked host -> resolvable host -> length.
 *
 * Self-referential is checked BEFORE blocked host on purpose. In development
 * BASE_URL is http://localhost:3000, whose host would trip the blocked-host
 * rule first and report the wrong reason for a link to our own service.
 *
 * Length is measured on the normalized URL, so `example.com` is not measured
 * before its scheme has been added.
 */
function validateUrl(raw, { baseUrl } = {}) {
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

  // After the blocked-host rule, not before: `localhost` is dotless too, and
  // BLOCKED_HOST is the more specific, more useful answer for it.
  if (!isResolvableHost(parsed.hostname)) return fail('INVALID_URL');

  if (parsed.href.length > MAX_URL_LENGTH) return fail('URL_TOO_LONG');

  return { ok: true, normalized: parsed.href };
}

module.exports = {
  validateUrl,
  normalizeInput,
  isBlockedHost,
  isResolvableHost,
  isSelfReferential,
  ERRORS,
  MAX_URL_LENGTH,
};
