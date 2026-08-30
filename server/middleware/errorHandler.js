'use strict';

const { ApiError } = require('../utils/errors');

const GENERIC = {
  error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
};

function isMongoUnavailable(err) {
  return (
    err &&
    (err.name === 'MongooseServerSelectionError' ||
      err.name === 'MongoNetworkError' ||
      err.name === 'MongoNotConnectedError')
  );
}

/**
 * The single exit for every server-side failure.
 *
 * Stack traces and driver messages are logged here and never leave the process:
 * the client only ever sees a typed code and a message written for a person.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof ApiError) {
    return res.status(err.status).json(err.toEnvelope());
  }

  // Raised by express.json()
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' },
    });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' },
    });
  }

  if (isMongoUnavailable(err)) {
    console.error('[api] database unavailable:', err.message);
    return res.status(503).json({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'The service is temporarily unavailable. Please try again.',
      },
    });
  }

  console.error('[api] unhandled error:', err && err.stack ? err.stack : err);
  return res.status(500).json(GENERIC);
}

module.exports = errorHandler;
