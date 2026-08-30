'use strict';

const { ValidationError } = require('../utils/errors');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MESSAGE = 'A valid X-Owner-Id header is required.';

/**
 * Scoping only — NOT authentication. This header is client-supplied and
 * trivially spoofable; it exists so a browser can list the links it created.
 * Nothing private may ever be stored against it.
 */
function requireOwner(req, res, next) {
  const raw = req.get('X-Owner-Id');
  if (!raw || !UUID.test(raw.trim())) {
    return next(new ValidationError('MISSING_OWNER', MESSAGE));
  }
  req.ownerId = raw.trim().toLowerCase();
  return next();
}

module.exports = requireOwner;
module.exports.UUID = UUID;
