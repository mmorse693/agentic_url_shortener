'use strict';

const request = require('supertest');

const { useTestDb } = require('../test/setupDb');
const { createLink, past, future } = require('../test/factories');
const { createApp } = require('../app');
const Link = require('../models/Link');

useTestDb();

let app;

beforeEach(() => {
  app = createApp({ baseUrl: 'https://short.test' });
});

const countFor = async (code) => (await Link.findOne({ code })).clickCount;

describe('GET /r/:code', () => {
  test('redirects with 302 and the original URL (AC-18)', async () => {
    const link = await createLink({ originalUrl: 'https://example.com/destination?a=1' });

    const res = await request(app).get(`/r/${link.code}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://example.com/destination?a=1');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('counts one click per visit', async () => {
    const link = await createLink();

    await request(app).get(`/r/${link.code}`);
    expect(await countFor(link.code)).toBe(1);

    await request(app).get(`/r/${link.code}`);
    expect(await countFor(link.code)).toBe(2);
  });

  test('ten concurrent visits count exactly ten (AC-19)', async () => {
    // A read-modify-write implementation passes every other test in this file
    // and loses updates here.
    const link = await createLink();

    await Promise.all(
      Array.from({ length: 10 }, () => request(app).get(`/r/${link.code}`))
    );

    expect(await countFor(link.code)).toBe(10);
  });

  test('a link with a future expiry still redirects', async () => {
    const link = await createLink({ expiresAt: future() });

    const res = await request(app).get(`/r/${link.code}`);

    expect(res.status).toBe(302);
    expect(await countFor(link.code)).toBe(1);
  });

  test('an unknown code is 404 (AC-20)', async () => {
    const res = await request(app).get('/r/nosuch1');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toMatch(/Link not found/);
  });

  test('an expired code is 410 and does not count (AC-21)', async () => {
    const link = await createLink({ expiresAt: past() });

    const res = await request(app).get(`/r/${link.code}`);

    expect(res.status).toBe(410);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toMatch(/expired/i);
    expect(await countFor(link.code)).toBe(0);
  });

  test('a deleted code is 404, not 410 (AC-22)', async () => {
    const link = await createLink();
    await Link.deleteOne({ code: link.code });

    const res = await request(app).get(`/r/${link.code}`);

    expect(res.status).toBe(404);
    expect(res.text).toMatch(/Link not found/);
  });

  test('the error pages leak no internals', async () => {
    const res = await request(app).get('/r/nosuch1');

    expect(res.text).not.toMatch(/at .*\.js:\d+/);
    expect(res.text).not.toMatch(/mongo/i);
  });
});
