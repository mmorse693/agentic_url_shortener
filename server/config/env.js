'use strict';

const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true });

function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.replace(/\/+$/, '') : value;
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

let cached = null;

/**
 * Reads and validates process env once, then hands back the same frozen object.
 *
 * BASE_URL is load-bearing in two places, not cosmetic: it is what Link#toApi
 * builds `shortUrl` from, and what the self-referential check compares against.
 */
function loadConfig({ reload = false } = {}) {
  if (cached && !reload) return cached;

  const nodeEnv = process.env.NODE_ENV || 'development';
  const mongoUri = process.env.MONGODB_URI || '';

  if (!mongoUri && nodeEnv !== 'test') {
    throw new Error('MONGODB_URI is required. Copy .env.example to .env and set it.');
  }

  const baseUrl = stripTrailingSlash(process.env.BASE_URL || 'http://localhost:3000');

  cached = Object.freeze({
    nodeEnv,
    port: toInt(process.env.PORT, 5000),
    mongoUri,
    baseUrl,
    corsOrigin: process.env.CORS_ORIGIN || baseUrl,
    trustProxy: toInt(process.env.TRUST_PROXY, 0),
    rateLimit: Object.freeze({
      createMax: toInt(process.env.RATE_LIMIT_CREATE_MAX, 20),
      readMax: toInt(process.env.RATE_LIMIT_READ_MAX, 100),
    }),
  });

  return cached;
}

module.exports = { loadConfig, stripTrailingSlash };
