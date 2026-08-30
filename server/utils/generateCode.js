'use strict';

const crypto = require('node:crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const DEFAULT_LENGTH = 7;

// 256 % 62 === 8, so bytes 248..255 would over-represent the first 8 letters.
// Rejecting them keeps the distribution uniform.
const REJECT_AT = 256 - (256 % ALPHABET.length);

function generateCode(length = DEFAULT_LENGTH) {
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError('generateCode(length) requires a positive integer.');
  }

  let code = '';
  while (code.length < length) {
    const bytes = crypto.randomBytes((length - code.length) * 2);
    for (const byte of bytes) {
      if (byte >= REJECT_AT) continue;
      code += ALPHABET[byte % ALPHABET.length];
      if (code.length === length) break;
    }
  }
  return code;
}

module.exports = { generateCode, ALPHABET, DEFAULT_LENGTH, REJECT_AT };
