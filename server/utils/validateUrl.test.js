'use strict';

const path = require('node:path');

const { validateUrl, normalizeInput, isBlockedHost, ERRORS } = require('./validateUrl');

const fixture = require(path.resolve(__dirname, '..', '..', 'shared', 'urlValidationCases.json'));

// Mirrored verbatim in src/utils/validateUrl.test.js.
function expand(testCase) {
  if (!testCase.padToLength) return testCase.input;
  return testCase.input + 'a'.repeat(testCase.padToLength - testCase.input.length);
}

describe('validateUrl — shared cases (server side of AC-17)', () => {
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

  test('the fixture actually covers every error code', () => {
    const covered = new Set(fixture.cases.map((c) => c.expect));
    for (const code of Object.keys(ERRORS)) {
      expect(covered).toContain(code);
    }
  });
});

describe('validateUrl — check order', () => {
  test('a link to our own host reports SELF_REFERENTIAL, not BLOCKED_HOST', () => {
    // In development BASE_URL is http://localhost:3000, whose host would trip
    // the blocked-host rule first and report the wrong reason.
    const result = validateUrl('http://localhost:3000/r/abc1234', {
      baseUrl: 'http://localhost:3000',
    });
    expect(result.code).toBe('SELF_REFERENTIAL');
  });

  test('length is measured after normalization, not before', () => {
    const bare = 'example.com/' + 'a'.repeat(2048 - 'https://example.com/'.length);
    expect(validateUrl(bare, { baseUrl: fixture.baseUrl }).ok).toBe(true);
  });
});

describe('validateUrl — non-string input', () => {
  test.each([[undefined], [null], [42], [{}], [[]]])('%p is EMPTY_URL', (input) => {
    expect(validateUrl(input, { baseUrl: fixture.baseUrl }).code).toBe('EMPTY_URL');
  });
});

describe('normalizeInput', () => {
  test('leaves an explicit scheme alone', () => {
    expect(normalizeInput('https://example.com')).toBe('https://example.com');
  });

  test('treats a dotted prefix as a host, not a scheme', () => {
    expect(normalizeInput('example.com:8080/x')).toBe('https://example.com:8080/x');
  });

  test('treats a dotless prefix as a scheme so it can be rejected', () => {
    expect(normalizeInput('javascript:alert(1)')).toBe('javascript:alert(1)');
  });
});

describe('isBlockedHost', () => {
  test.each([
    ['localhost', true],
    ['app.localhost', true],
    ['printer.local', true],
    ['svc.internal', true],
    ['127.0.0.1', true],
    ['10.255.255.255', true],
    ['172.15.0.1', false],
    ['172.16.0.0', true],
    ['172.31.255.255', true],
    ['172.32.0.0', false],
    ['192.168.0.1', true],
    ['169.254.169.254', true],
    ['::1', true],
    ['::ffff:127.0.0.1', true],
    ['example.com', false],
    ['8.8.8.8', false],
  ])('%s -> %s', (host, blocked) => {
    expect(isBlockedHost(host)).toBe(blocked);
  });
});
