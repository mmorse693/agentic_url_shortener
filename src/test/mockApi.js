/**
 * Minimal fetch double, shaped to exactly what src/services/linksApi.js uses:
 * `response.ok`, `response.status`, and `response.text()`.
 *
 * The handler receives `{ url, method, body, headers }` and returns
 * `{ status, json }`, `{ status, text }`, or an Error to simulate a network
 * failure.
 */
export function mockFetch(handler) {
  const fetchMock = jest.fn(async (url, options = {}) => {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;

    const result = await handler({ url, method, body, headers: options.headers || {} });

    if (result instanceof Error) throw result;

    const { status = 200, json, text } = result || {};
    let payload = '';
    if (text !== undefined) payload = text;
    else if (json !== undefined) payload = JSON.stringify(json);

    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => payload,
    };
  });

  global.fetch = fetchMock;
  return fetchMock;
}

/** A handler that answers the five real endpoints from an in-memory list. */
export function mockApi({ links = [], onCreate } = {}) {
  const state = { links: [...links] };

  return mockFetch(({ url, method, body }) => {
    if (url.endsWith('/links') && method === 'GET') {
      return { status: 200, json: { links: state.links } };
    }

    if (url.endsWith('/links') && method === 'POST') {
      if (onCreate) return onCreate(body);
      const code = `cd${state.links.length + 1}abc`;
      const link = {
        id: code,
        code,
        shortUrl: `http://localhost/r/${code}`,
        originalUrl: body.url,
        clickCount: 0,
        expiresAt: null,
        createdAt: new Date().toISOString(),
      };
      state.links.unshift(link);
      return { status: 201, json: link };
    }

    if (method === 'DELETE') {
      const code = url.split('/').pop();
      state.links = state.links.filter((l) => l.code !== code);
      return { status: 204 };
    }

    return { status: 404, json: { error: { code: 'NOT_FOUND', message: 'No such endpoint.' } } };
  });
}

export const apiError = (status, code, message, field) => ({
  status,
  json: { error: { code, message, ...(field ? { field } : {}) } },
});
