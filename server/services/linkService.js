'use strict';

const Link = require('../models/Link');
const { generateCode } = require('../utils/generateCode');
const { validateUrl } = require('../utils/validateUrl');
const {
  ValidationError,
  NotFoundError,
  ExpiredLinkError,
  CodeGenerationError,
} = require('../utils/errors');

const MAX_CODE_ATTEMPTS = 5;
const DUPLICATE_KEY = 11000;

const EXPIRY_MESSAGE = 'Expiry must be a valid date in the future.';

function parseExpiry(raw) {
  if (raw === undefined || raw === null || raw === '') return null;

  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError('INVALID_EXPIRY', EXPIRY_MESSAGE, 'expiresAt');
  }
  if (date.getTime() <= Date.now()) {
    throw new ValidationError('INVALID_EXPIRY', EXPIRY_MESSAGE, 'expiresAt');
  }
  return date;
}

async function createLink({ url, expiresAt, ownerId, baseUrl }) {
  const result = validateUrl(url, { baseUrl });
  if (!result.ok) throw new ValidationError(result.code, result.message, result.field);

  const expiry = parseExpiry(expiresAt);

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    try {
      return await Link.create({
        code: generateCode(),
        originalUrl: result.normalized,
        ownerId,
        expiresAt: expiry,
      });
    } catch (err) {
      // Only a code collision is retryable; anything else is a real failure.
      if (err && err.code === DUPLICATE_KEY) continue;
      throw err;
    }
  }

  throw new CodeGenerationError();
}

function listForOwner(ownerId) {
  return Link.find({ ownerId }).sort({ createdAt: -1 }).exec();
}

/**
 * The redirect path, in two deliberate steps.
 *
 * The expiry decision has to happen BEFORE the increment, or an expired link
 * still counts a click and AC-21 breaks. The increment itself is a single
 * atomic $inc rather than read-modify-write, so N concurrent visitors produce
 * exactly N clicks (AC-19).
 */
async function resolveAndCount(code) {
  const link = await Link.findOne({ code }).exec();
  if (!link) throw new NotFoundError();
  if (link.isExpired()) throw new ExpiredLinkError();

  const updated = await Link.findOneAndUpdate(
    { code },
    { $inc: { clickCount: 1 } },
    { new: true }
  ).exec();

  // Deleted between the read and the update: treat as never found.
  if (!updated) throw new NotFoundError();
  return updated;
}

/**
 * Scoping the delete *query* by ownerId — rather than fetching then comparing —
 * is what makes AC-29 return 404 instead of 403 for someone else's code,
 * without the endpoint ever confirming that the code exists.
 */
async function deleteForOwner(code, ownerId) {
  const result = await Link.deleteOne({ code, ownerId }).exec();
  if (result.deletedCount === 0) throw new NotFoundError();
}

module.exports = {
  createLink,
  listForOwner,
  resolveAndCount,
  deleteForOwner,
  parseExpiry,
  MAX_CODE_ATTEMPTS,
};
