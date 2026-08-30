'use strict';

const mongoose = require('mongoose');
const { stripTrailingSlash } = require('../config/env');

const { Schema } = mongoose;

const linkSchema = new Schema(
  {
    // `unique: true` already builds the index; adding `index: true` as well
    // makes Mongoose 8 warn about a duplicate schema index.
    code: {
      type: String,
      required: true,
      unique: true,
      match: /^[A-Za-z0-9_-]{4,32}$/,
    },
    originalUrl: { type: String, required: true, maxlength: 2048 },
    ownerId: { type: String, required: true, index: true },
    clickCount: { type: Number, default: 0, min: 0 },

    // Plain field, deliberately NOT a TTL index. A TTL index would delete the
    // document, and AC-21 requires an expired code to answer 410 Gone — which
    // is impossible once the row is gone.
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Serves the "my links, newest first" query directly.
linkSchema.index({ ownerId: 1, createdAt: -1 });

linkSchema.methods.isExpired = function isExpired(now = new Date()) {
  return this.expiresAt != null && this.expiresAt.getTime() <= now.getTime();
};

/**
 * The single definition of the API response shape. Controllers never hand-build
 * this, so `shortUrl` can only ever be assembled one way.
 */
linkSchema.methods.toApi = function toApi(baseUrl) {
  return {
    id: this._id.toString(),
    code: this.code,
    shortUrl: `${stripTrailingSlash(baseUrl || '')}/r/${this.code}`,
    originalUrl: this.originalUrl,
    clickCount: this.clickCount,
    expiresAt: this.expiresAt ? this.expiresAt.toISOString() : null,
    createdAt: this.createdAt.toISOString(),
  };
};

module.exports = mongoose.models.Link || mongoose.model('Link', linkSchema);
