'use strict';

const rateLimit = require('express-rate-limit');

const HOUR = 60 * 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;

const MESSAGE = 'Too many requests. Please wait a moment and try again.';

function handler(req, res) {
  // express-rate-limit only sets Retry-After when legacy headers are on, so it
  // is set explicitly here — AC-31 requires it.
  const resetTime = req.rateLimit && req.rateLimit.resetTime;
  const seconds = resetTime
    ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
    : 60;

  res.set('Retry-After', String(seconds));
  res.status(429).json({ error: { code: 'RATE_LIMITED', message: MESSAGE } });
}

/**
 * Built per-app rather than at module scope, so each app instance gets its own
 * in-memory counters. Tests can then create a fresh app and start from zero.
 */
function createRateLimiters({ createMax = 20, readMax = 100 } = {}) {
  const shared = {
    standardHeaders: true,
    legacyHeaders: false,
    handler,
  };

  return {
    createLimiter: rateLimit({ ...shared, windowMs: HOUR, limit: createMax }),
    readLimiter: rateLimit({ ...shared, windowMs: FIFTEEN_MINUTES, limit: readMax }),
  };
}

module.exports = { createRateLimiters };
