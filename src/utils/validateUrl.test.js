import { validateUrl, normalizeInput, isBlockedHost, isSafeHttpUrl, ERRORS } from './validateUrl';

// Jest resolves outside src/ fine — CRA's ModuleScopePlugin is a webpack plugin
// and does not apply here. Production code must never do this.
import fixture from '../../shared/urlValidationCases.json';

// Mirrored verbatim in server/utils/validateUrl.test.js.
function expand(testCase) {
  if (!testCase.padToLength) return testCase.input;
  return testCase.input + 'a'.repeat(testCase.padToLength - testCase.input.length);
}

describe('validateUrl — shared cases (client side of AC-17)', () => {
  test.each(fixture.cases.map((c) => [c.name, c]))('%s', (_name, testCase) => {
    const input = expand(testCase);
    const result = validateUrl(input, { baseUrl: fixture.baseUrl });

    if (testCase.expect === 'ok') {
      expect(result.ok).toBe(true);
      const expected = testCase.normalized === '@input' ? input : testCase.normalized;
      expect(result.normalized).toBe(expected);
    } else {
      expect(result.ok).toBe(false);
      expect(result.code).toBe(testCase.expect);
      expect(result.message).toBe(ERRORS[testCase.expect]);
      expect(result.field).toBe('url');
    }
  });

  test('every error code the client knows about is exercised', () => {
    const covered = new Set(fixture.cases.map((c) => c.expect));
    Object.keys(ERRORS).forEach((code) => expect(covered).toContain(code));
  });
});

describe('validateUrl — browser defaults', () => {
  test('falls back to window.location.origin as the base URL', () => {
    // jsdom serves tests from http://localhost, so a link to localhost is our
    // own host and must report SELF_REFERENTIAL rather than BLOCKED_HOST.
    expect(validateUrl('http://localhost/r/abc1234').code).toBe('SELF_REFERENTIAL');
  });
});

describe('normalizeInput', () => {
  test('adds https to a scheme-less input', () => {
    expect(normalizeInput('example.com/x')).toBe('https://example.com/x');
  });

  test('leaves a dotless scheme alone so it can be rejected', () => {
    expect(normalizeInput('javascript:alert(1)')).toBe('javascript:alert(1)');
  });
});

describe('isBlockedHost', () => {
  test.each([
    ['127.0.0.1', true],
    ['169.254.169.254', true],
    ['172.16.0.1', true],
    ['172.32.0.1', false],
    ['example.com', false],
  ])('%s -> %s', (host, blocked) => {
    expect(isBlockedHost(host)).toBe(blocked);
  });
});

describe('isSafeHttpUrl (AC-34)', () => {
  test.each([
    ['https://example.com', true],
    ['http://example.com', true],
    ['javascript:alert(1)', false],
    ['data:text/html,<h1>x</h1>', false],
    ['not a url', false],
    ['', false],
    [null, false],
    [undefined, false],
  ])('%p -> %s', (value, safe) => {
    expect(isSafeHttpUrl(value)).toBe(safe);
  });
});
