import { ApiError, createLink, deleteLink, listLinks } from './linksApi';
import { getOwnerId } from './ownerId';
import { mockFetch } from '../test/mockApi';

describe('linksApi', () => {
  test('attaches the owner header to every request', async () => {
    const fetchMock = mockFetch(() => ({ status: 200, json: { links: [] } }));

    await listLinks();

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['X-Owner-Id']).toBe(getOwnerId());
  });

  test('posts the url and expiresAt to /api/links', async () => {
    const fetchMock = mockFetch(() => ({ status: 201, json: { code: 'abc1234' } }));

    await createLink({ url: 'https://example.com' });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/links');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({ url: 'https://example.com', expiresAt: null });
  });

  test('parses the error envelope into an ApiError', async () => {
    mockFetch(() => ({
      status: 400,
      json: {
        error: { code: 'BLOCKED_HOST', message: 'Nope, private address.', field: 'url' },
      },
    }));

    expect.assertions(5);
    try {
      await createLink({ url: 'http://127.0.0.1' });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.code).toBe('BLOCKED_HOST');
      expect(err.message).toBe('Nope, private address.');
      expect(err.field).toBe('url');
      expect(err.status).toBe(400);
    }
  });

  test('survives a non-JSON error body instead of throwing a SyntaxError', async () => {
    // A proxy answering with an HTML 502 must not replace the useful message
    // with a JSON parse failure.
    mockFetch(() => ({ status: 502, text: '<html><body>Bad gateway</body></html>' }));

    await expect(createLink({ url: 'https://example.com' })).rejects.toMatchObject({
      code: 'UNEXPECTED_ERROR',
      status: 502,
    });
  });

  test('turns a network failure into a typed error', async () => {
    mockFetch(() => new TypeError('Failed to fetch'));

    await expect(listLinks()).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });

  test('treats 204 as an empty success', async () => {
    mockFetch(() => ({ status: 204 }));

    await expect(deleteLink('abc1234')).resolves.toBeNull();
  });

  test('encodes the code into the delete path', async () => {
    const fetchMock = mockFetch(() => ({ status: 204 }));

    await deleteLink('a/b');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/links/a%2Fb');
  });

  test('listLinks returns an array even if the payload is odd', async () => {
    mockFetch(() => ({ status: 200, json: {} }));

    await expect(listLinks()).resolves.toEqual([]);
  });
});
