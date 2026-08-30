import { render } from '@testing-library/react';
import { Provider } from 'react-redux';

import { createStore } from '../store';

export function makeLink(overrides = {}) {
  return {
    id: 'id-abc1234',
    code: 'abc1234',
    shortUrl: 'http://localhost/r/abc1234',
    originalUrl: 'https://example.com/destination',
    clickCount: 0,
    expiresAt: null,
    createdAt: '2026-08-30T12:00:00.000Z',
    ...overrides,
  };
}

export function linksState(overrides = {}) {
  return {
    links: {
      items: [],
      listStatus: 'idle',
      createStatus: 'idle',
      lastCreated: null,
      error: null,
      ...overrides,
    },
  };
}

export function renderWithStore(ui, { preloadedState, store, ...options } = {}) {
  const testStore = store || createStore(preloadedState);

  function Wrapper({ children }) {
    return <Provider store={testStore}>{children}</Provider>;
  }

  return { store: testStore, ...render(ui, { wrapper: Wrapper, ...options }) };
}
