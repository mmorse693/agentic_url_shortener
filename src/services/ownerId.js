const STORAGE_KEY = 'url-shortener.ownerId';

// Used when localStorage is unavailable (private mode, blocked site data) so
// the session still works — the list just resets on reload.
let inMemoryId = null;

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older browsers and jsdom builds without randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Scoping only, never authentication: this id is client-generated and sent as a
 * plain header. It exists so a browser can list the links it made.
 */
export function getOwnerId() {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const created = randomId();
    window.localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    if (!inMemoryId) inMemoryId = randomId();
    return inMemoryId;
  }
}

export function resetOwnerIdForTests() {
  inMemoryId = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}

export { STORAGE_KEY };
