'use strict';

const Link = require('../models/Link');

const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';

let counter = 0;

function nextCode() {
  counter += 1;
  return `test${String(counter).padStart(3, '0')}`;
}

function makeLink(overrides = {}) {
  return {
    code: nextCode(),
    originalUrl: 'https://example.com/destination',
    ownerId: OWNER_A,
    clickCount: 0,
    expiresAt: null,
    ...overrides,
  };
}

function createLink(overrides = {}) {
  return Link.create(makeLink(overrides));
}

const HOUR = 60 * 60 * 1000;
const past = (ms = HOUR) => new Date(Date.now() - ms);
const future = (ms = HOUR) => new Date(Date.now() + ms);

module.exports = { OWNER_A, OWNER_B, makeLink, createLink, past, future };
