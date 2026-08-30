'use strict';

const crypto = require('node:crypto');

const { generateCode, ALPHABET, REJECT_AT } = require('./generateCode');

describe('generateCode', () => {
  test('is 7 characters from the base62 alphabet by default (AC-2)', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateCode();
      expect(code).toHaveLength(7);
      expect(code).toMatch(/^[A-Za-z0-9]{7}$/);
    }
  });

  test('honours a custom length', () => {
    expect(generateCode(1)).toHaveLength(1);
    expect(generateCode(32)).toHaveLength(32);
  });

  test('rejects a nonsense length', () => {
    expect(() => generateCode(0)).toThrow(RangeError);
    expect(() => generateCode(-1)).toThrow(RangeError);
    expect(() => generateCode(2.5)).toThrow(RangeError);
  });

  test('collisions are rare across many draws', () => {
    const seen = new Set();
    for (let i = 0; i < 10000; i += 1) seen.add(generateCode());
    expect(seen.size).toBe(10000);
  });

  test('the alphabet is 62 characters with no duplicates', () => {
    expect(ALPHABET).toHaveLength(62);
    expect(new Set(ALPHABET).size).toBe(62);
  });

  test('discards biased bytes instead of folding them in (rejection sampling)', () => {
    // 256 % 62 === 8, so bytes 248..255 would over-represent the first eight
    // letters. They must be thrown away, not reduced with %.
    expect(REJECT_AT).toBe(248);

    const spy = jest
      .spyOn(crypto, 'randomBytes')
      .mockReturnValueOnce(Buffer.from([255, 248]))
      .mockReturnValueOnce(Buffer.from([0, 0]));

    expect(generateCode(1)).toBe(ALPHABET[0]);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
