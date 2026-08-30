import '@testing-library/jest-dom';

/**
 * jsdom (jest 27, via react-scripts 5) ships no `fetch`, so tests install their
 * own — see src/test/mockApi.js.
 *
 * msw was the plan's first choice but needs TextEncoder / BroadcastChannel /
 * fetch polyfills to run under this Jest version; the fallback documented in
 * the plan is used instead. The assertions are unchanged either way.
 */
afterEach(() => {
  delete global.fetch;
});
