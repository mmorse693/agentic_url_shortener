'use strict';

jest.mock('../models/Link', () => ({
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  deleteOne: jest.fn(),
}));

const Link = require('../models/Link');
const linkService = require('./linkService');
const {
  ValidationError,
  NotFoundError,
  ExpiredLinkError,
  CodeGenerationError,
} = require('../utils/errors');

const BASE_URL = 'https://short.test';
const OWNER = '11111111-1111-4111-8111-111111111111';

const duplicateKeyError = () => Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
const chain = (value) => ({ exec: jest.fn().mockResolvedValue(value) });

describe('createLink', () => {
  test('persists the normalized URL and lets the schema default clickCount to 0', async () => {
    Link.create.mockResolvedValue({ code: 'aB3dEf9' });

    await linkService.createLink({
      url: '  HTTP://Example.COM/Path  ',
      ownerId: OWNER,
      baseUrl: BASE_URL,
    });

    expect(Link.create).toHaveBeenCalledTimes(1);
    const doc = Link.create.mock.calls[0][0];
    expect(doc.originalUrl).toBe('http://example.com/Path');
    expect(doc.ownerId).toBe(OWNER);
    expect(doc.expiresAt).toBeNull();
    expect(doc.code).toMatch(/^[A-Za-z0-9]{7}$/);
    expect(doc).not.toHaveProperty('clickCount');
  });

  test('rejects an invalid URL with the validator’s own code and message', async () => {
    await expect(
      linkService.createLink({ url: 'javascript:alert(1)', ownerId: OWNER, baseUrl: BASE_URL })
    ).rejects.toMatchObject({
      constructor: ValidationError,
      code: 'UNSUPPORTED_SCHEME',
      status: 400,
      field: 'url',
    });

    expect(Link.create).not.toHaveBeenCalled();
  });

  test.each([
    ['a past date', new Date(Date.now() - 1000).toISOString()],
    ['a malformed date', 'not-a-date'],
  ])('rejects %s as INVALID_EXPIRY', async (_label, expiresAt) => {
    await expect(
      linkService.createLink({
        url: 'https://example.com',
        expiresAt,
        ownerId: OWNER,
        baseUrl: BASE_URL,
      })
    ).rejects.toMatchObject({ code: 'INVALID_EXPIRY', status: 400, field: 'expiresAt' });

    expect(Link.create).not.toHaveBeenCalled();
  });

  test('accepts a future expiry', async () => {
    const expiresAt = new Date(Date.now() + 60000).toISOString();
    Link.create.mockResolvedValue({});

    await linkService.createLink({
      url: 'https://example.com',
      expiresAt,
      ownerId: OWNER,
      baseUrl: BASE_URL,
    });

    expect(Link.create.mock.calls[0][0].expiresAt).toEqual(new Date(expiresAt));
  });

  test('retries on a code collision and succeeds', async () => {
    Link.create
      .mockRejectedValueOnce(duplicateKeyError())
      .mockRejectedValueOnce(duplicateKeyError())
      .mockResolvedValueOnce({ code: 'survivor' });

    await expect(
      linkService.createLink({ url: 'https://example.com', ownerId: OWNER, baseUrl: BASE_URL })
    ).resolves.toEqual({ code: 'survivor' });

    expect(Link.create).toHaveBeenCalledTimes(3);
    const codes = Link.create.mock.calls.map((call) => call[0].code);
    expect(new Set(codes).size).toBe(3);
  });

  test('gives up after five collisions', async () => {
    Link.create.mockRejectedValue(duplicateKeyError());

    await expect(
      linkService.createLink({ url: 'https://example.com', ownerId: OWNER, baseUrl: BASE_URL })
    ).rejects.toBeInstanceOf(CodeGenerationError);

    expect(Link.create).toHaveBeenCalledTimes(linkService.MAX_CODE_ATTEMPTS);
  });

  test('does not retry a non-collision failure', async () => {
    Link.create.mockRejectedValue(new Error('disk on fire'));

    await expect(
      linkService.createLink({ url: 'https://example.com', ownerId: OWNER, baseUrl: BASE_URL })
    ).rejects.toThrow('disk on fire');

    expect(Link.create).toHaveBeenCalledTimes(1);
  });
});

describe('listForOwner', () => {
  test('scopes to the owner and sorts newest first', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    const sort = jest.fn().mockReturnValue({ exec });
    Link.find.mockReturnValue({ sort });

    await linkService.listForOwner(OWNER);

    expect(Link.find).toHaveBeenCalledWith({ ownerId: OWNER });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
  });
});

describe('resolveAndCount', () => {
  test('throws NotFoundError for an unknown code', async () => {
    Link.findOne.mockReturnValue(chain(null));

    await expect(linkService.resolveAndCount('nope123')).rejects.toBeInstanceOf(NotFoundError);
    expect(Link.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('throws ExpiredLinkError WITHOUT counting the click (AC-21)', async () => {
    Link.findOne.mockReturnValue(chain({ isExpired: () => true }));

    await expect(linkService.resolveAndCount('old1234')).rejects.toBeInstanceOf(ExpiredLinkError);
    expect(Link.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('increments atomically with $inc rather than read-modify-write (AC-19)', async () => {
    Link.findOne.mockReturnValue(chain({ isExpired: () => false }));
    Link.findOneAndUpdate.mockReturnValue(chain({ clickCount: 4 }));

    const result = await linkService.resolveAndCount('live123');

    expect(Link.findOneAndUpdate).toHaveBeenCalledWith(
      { code: 'live123' },
      { $inc: { clickCount: 1 } },
      { new: true }
    );
    expect(result.clickCount).toBe(4);
  });

  test('treats a delete racing the increment as not found', async () => {
    Link.findOne.mockReturnValue(chain({ isExpired: () => false }));
    Link.findOneAndUpdate.mockReturnValue(chain(null));

    await expect(linkService.resolveAndCount('gone123')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('deleteForOwner', () => {
  test('scopes the delete query by ownerId, so a stranger gets 404 not 403 (AC-29)', async () => {
    Link.deleteOne.mockReturnValue(chain({ deletedCount: 1 }));

    await linkService.deleteForOwner('abc1234', OWNER);

    expect(Link.deleteOne).toHaveBeenCalledWith({ code: 'abc1234', ownerId: OWNER });
  });

  test('throws NotFoundError when nothing was deleted', async () => {
    Link.deleteOne.mockReturnValue(chain({ deletedCount: 0 }));

    await expect(linkService.deleteForOwner('abc1234', OWNER)).rejects.toBeInstanceOf(NotFoundError);
  });
});
