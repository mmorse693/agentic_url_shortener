'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { loadConfig } = require('./config/env');
const { createRateLimiters } = require('./middleware/rateLimit');
const errorHandler = require('./middleware/errorHandler');
const createLinksRouter = require('./routes/links');
const createRedirectRouter = require('./routes/redirect');
const createHealthRouter = require('./routes/health');
const { NotFoundError } = require('./utils/errors');
const { renderLinkError } = require('./controllers/redirectController');

/**
 * Returns a configured app WITHOUT listening, which is what lets supertest
 * mount it in the integration suites with no port bound and no real Mongo
 * connection.
 *
 * `overrides` shallow-merges over the loaded config (with rateLimit merged one
 * level deeper), so tests can dial limits down without touching process.env.
 */
function createApp(overrides = {}) {
  const base = loadConfig();
  const config = {
    ...base,
    ...overrides,
    rateLimit: { ...base.rateLimit, ...(overrides.rateLimit || {}) },
  };

  const app = express();
  app.set('config', config);
  app.disable('x-powered-by');

  // Only trust proxy hops when explicitly configured. Leaving this permissive
  // would let a client spoof X-Forwarded-For and walk around the rate limiter.
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '10kb' }));

  const { createLimiter, readLimiter } = createRateLimiters(config.rateLimit);

  app.use('/api/health', createHealthRouter());
  app.use('/api/links', createLinksRouter({ createLimiter, readLimiter }));
  app.use('/r', createRedirectRouter());

  // Deployment is out of scope, so no static build is served. If it is added
  // later, `/r` must stay mounted ABOVE express.static and the SPA catch-all,
  // or the static handler answers short links first.

  app.use('/api', (req, res, next) => next(new NotFoundError('No such endpoint.')));
  app.use((req, res) => {
    renderLinkError(res, 404, 'Not found', 'There is nothing at this address.');
  });

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
