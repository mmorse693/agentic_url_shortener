'use strict';

const request = require('supertest');

const { useTestDb } = require('../test/setupDb');
const { OWNER_A, OWNER_B, createLink } = require('../test/factories');
const { createApp } = require('../app');
const Link = require('../models/Link');

useTestDb();

const BASE_URL = 'https://short.test';
const LONG_URL = 'https://example.com/a/very/long/path?utm_source=x&utm_medium=y';

let app;

beforeEach(() => {
  // Fresh app per test so each one starts with empty rate-limit counters.
  app = createApp({ baseUrl: BASE_URL });
});

const post = (body, owner = OWNER_A) => {
  const req = request(app).post('/api/links');
  if (owner) req.set('X-Owner-Id', owner);
  return req.send(body);
};

describe('POST /api/links', () => {
  test('creates a link and returns the documented shape (AC-1)', async () => {
    const res = await post({ url: LONG_URL });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      originalUrl: LONG_URL,
      clickCount: 0,
      expiresAt: null,
    });
    expect(res.body.code).toMatch(/^[A-Za-z0-9_-]{7}$/); // AC-2
    expect(res.body.shortUrl).toBe(`${BASE_URL}/r/${res.body.code}`);
    expect(res.body.shortUrl.endsWith(res.body.code)).toBe(true);
    expect(typeof res.body.id).toBe('string');
    expect(Date.parse(res.body.createdAt)).not.toBeNaN();

    const stored = await Link.findOne({ code: res.body.code });
    expect(stored).not.toBeNull();
    expect(stored.originalUrl).toBe(LONG_URL);
    expect(stored.ownerId).toBe(OWNER_A);
    expect(stored.clickCount).toBe(0); // AC-7
  });

  test('stores the normalized URL, not the raw input (AC-4, AC-5, AC-6)', async () => {
    const res = await post({ url: '  example.com/path  ' });

    expect(res.status).toBe(201);
    expect(res.body.originalUrl).toBe('https://example.com/path');
  });

  test('two creates for the same URL get different codes (AC-3)', async () => {
    const [first, second] = await Promise.all([post({ url: LONG_URL }), post({ url: LONG_URL })]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.code).not.toBe(second.body.code);
  });

  test('accepts a future expiry', async () => {
    const expiresAt = new Date(Date.now() + 3600_000).toISOString();
    const res = await post({ url: LONG_URL, expiresAt });

    expect(res.status).toBe(201);
    expect(res.body.expiresAt).toBe(expiresAt);
  });

  test('rejects a request with no X-Owner-Id (AC-8)', async () => {
    const res = await post({ url: LONG_URL }, null);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_OWNER');
  });

  test('rejects a malformed X-Owner-Id', async () => {
    const res = await post({ url: LONG_URL }, 'not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_OWNER');
  });

  describe('validation failures', () => {
    test.each([
      ['empty string', '', 'EMPTY_URL'],
      ['whitespace only', '   ', 'EMPTY_URL'],
      ['missing entirely', undefined, 'EMPTY_URL'],
      ['free text', 'not a url', 'INVALID_URL'],
      ['javascript scheme', 'javascript:alert(1)', 'UNSUPPORTED_SCHEME'],
      ['data scheme', 'data:text/html,<h1>x</h1>', 'UNSUPPORTED_SCHEME'],
      ['file scheme', 'file:///etc/passwd', 'UNSUPPORTED_SCHEME'],
      ['ftp scheme', 'ftp://example.com', 'UNSUPPORTED_SCHEME'],
      ['localhost', 'http://localhost:5000/admin', 'BLOCKED_HOST'],
      ['loopback', 'http://127.0.0.1/', 'BLOCKED_HOST'],
      ['private range', 'http://192.168.1.1/', 'BLOCKED_HOST'],
      ['cloud metadata', 'http://169.254.169.254/', 'BLOCKED_HOST'],
      ['self-referential', `${BASE_URL}/r/aB3dEf9`, 'SELF_REFERENTIAL'],
    ])('%s -> %s', async (_label, url, code) => {
      const res = await post({ url });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(code);
      expect(typeof res.body.error.message).toBe('string');
      expect(res.body.error.field).toBe('url');
      expect(await Link.countDocuments()).toBe(0);
    });

    test('a URL past the length limit is rejected (AC-13)', async () => {
      const url = 'https://example.com/' + 'a'.repeat(2049 - 'https://example.com/'.length);
      const res = await post({ url });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('URL_TOO_LONG');
    });

    test.each([
      ['a past date', new Date(Date.now() - 1000).toISOString()],
      ['a malformed date', 'yesterday'],
    ])('rejects %s as INVALID_EXPIRY (AC-30)', async (_label, expiresAt) => {
      const res = await post({ url: LONG_URL, expiresAt });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_EXPIRY');
      expect(res.body.error.field).toBe('expiresAt');
    });
  });

  test('a body over 10 KB is rejected (AC-33)', async () => {
    const res = await post({ url: `https://example.com/${'a'.repeat(11 * 1024)}` });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  test('the 21st create in the window is rate limited (AC-31)', async () => {
    for (let i = 0; i < 20; i += 1) {
      const ok = await post({ url: `https://example.com/${i}` });
      expect(ok.status).toBe(201);
    }

    const limited = await post({ url: 'https://example.com/21' });

    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('GET /api/links', () => {
  test('returns only the caller’s links, newest first (AC-27)', async () => {
    const mine = await createLink({ ownerId: OWNER_A, originalUrl: 'https://a.example/1' });
    await new Promise((r) => setTimeout(r, 10));
    const alsoMine = await createLink({ ownerId: OWNER_A, originalUrl: 'https://a.example/2' });
    await createLink({ ownerId: OWNER_B, originalUrl: 'https://b.example/1' });

    const res = await request(app).get('/api/links').set('X-Owner-Id', OWNER_A);

    expect(res.status).toBe(200);
    expect(res.body.links).toHaveLength(2);
    expect(res.body.links.map((l) => l.code)).toEqual([alsoMine.code, mine.code]);
    expect(res.body.links[0].shortUrl).toBe(`${BASE_URL}/r/${alsoMine.code}`);
  });

  test('an owner with no links gets an empty array', async () => {
    const res = await request(app).get('/api/links').set('X-Owner-Id', OWNER_A);

    expect(res.status).toBe(200);
    expect(res.body.links).toEqual([]);
  });

  test('requires the owner header', async () => {
    const res = await request(app).get('/api/links');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_OWNER');
  });
});

describe('DELETE /api/links/:code', () => {
  test('the owner can delete, and the short link stops resolving (AC-28)', async () => {
    const link = await createLink({ ownerId: OWNER_A });

    const res = await request(app)
      .delete(`/api/links/${link.code}`)
      .set('X-Owner-Id', OWNER_A);

    expect(res.status).toBe(204);
    expect(await Link.findOne({ code: link.code })).toBeNull();

    const redirect = await request(app).get(`/r/${link.code}`);
    expect(redirect.status).toBe(404);
  });

  test('a stranger gets 404 and the link survives (AC-29)', async () => {
    const link = await createLink({ ownerId: OWNER_A });

    const res = await request(app)
      .delete(`/api/links/${link.code}`)
      .set('X-Owner-Id', OWNER_B);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(await Link.findOne({ code: link.code })).not.toBeNull();
  });

  test('an unknown code gets the same 404', async () => {
    const res = await request(app).delete('/api/links/nosuch1').set('X-Owner-Id', OWNER_A);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('guardrails', () => {
  test('helmet security headers are present (AC-32)', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('health reports the database state', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'connected' });
  });

  test('malformed JSON gets a typed error, not a stack trace', async () => {
    const res = await request(app)
      .post('/api/links')
      .set('X-Owner-Id', OWNER_A)
      .set('Content-Type', 'application/json')
      .send('{"url":');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js:\d+/);
  });

  test('an unknown /api route returns the JSON envelope', async () => {
    const res = await request(app).get('/api/nope');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
