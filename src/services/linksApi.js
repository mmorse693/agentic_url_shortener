import { getOwnerId } from './ownerId';

const BASE_URL = process.env.REACT_APP_API_URL || '/api';

export class ApiError extends Error {
  constructor({ code, message, field, status }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.field = field;
    this.status = status;
  }
}

const NETWORK_MESSAGE = 'Could not reach the server. Check your connection and try again.';

async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'X-Owner-Id': getOwnerId() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError({ code: 'NETWORK_ERROR', message: NETWORK_MESSAGE, status: 0 });
  }

  if (response.status === 204) return null;

  // A proxy can answer with an HTML error page. Parsing defensively keeps a
  // SyntaxError from replacing the useful message.
  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = payload && payload.error;
    throw new ApiError({
      code: (error && error.code) || 'UNEXPECTED_ERROR',
      message:
        (error && error.message) ||
        `The server returned an unexpected ${response.status} response.`,
      field: error && error.field,
      status: response.status,
    });
  }

  return payload;
}

export function createLink({ url, expiresAt = null }) {
  return request('/links', { method: 'POST', body: { url, expiresAt } });
}

export async function listLinks() {
  const payload = await request('/links');
  return (payload && payload.links) || [];
}

export function deleteLink(code) {
  return request(`/links/${encodeURIComponent(code)}`, { method: 'DELETE' });
}

export { BASE_URL };
