import reducer, {
  clearError,
  clearLastCreated,
  createLink,
  deleteLink,
  fetchLinks,
} from './linksSlice';
import { makeLink } from '../test/renderWithStore';

const initial = reducer(undefined, { type: '@@INIT' });

const envelope = { code: 'BLOCKED_HOST', message: "Links to local … can't be shortened.", field: 'url' };

describe('initial state', () => {
  test('starts idle and empty', () => {
    expect(initial).toEqual({
      items: [],
      listStatus: 'idle',
      createStatus: 'idle',
      lastCreated: null,
      error: null,
    });
  });
});

describe('createLink', () => {
  test('pending marks loading and clears any previous error', () => {
    const state = reducer({ ...initial, error: envelope }, { type: createLink.pending.type });

    expect(state.createStatus).toBe('loading');
    expect(state.error).toBeNull();
  });

  test('fulfilled sets lastCreated and prepends to items', () => {
    const existing = makeLink({ code: 'older11' });
    const created = makeLink({ code: 'newer22' });

    const state = reducer(
      { ...initial, items: [existing] },
      { type: createLink.fulfilled.type, payload: created }
    );

    expect(state.createStatus).toBe('succeeded');
    expect(state.lastCreated).toEqual(created);
    expect(state.items.map((l) => l.code)).toEqual(['newer22', 'older11']);
  });

  test('rejected keeps the parsed envelope verbatim, not a stringified Error', () => {
    const state = reducer(initial, { type: createLink.rejected.type, payload: envelope });

    expect(state.createStatus).toBe('failed');
    expect(state.error).toEqual(envelope);
  });

  test('rejected without a payload still produces a usable error', () => {
    const state = reducer(initial, {
      type: createLink.rejected.type,
      error: { message: 'boom' },
    });

    expect(state.error.message).toBe('boom');
    expect(state.error.code).toBe('UNEXPECTED_ERROR');
  });
});

describe('fetchLinks', () => {
  test('pending marks the list loading', () => {
    expect(reducer(initial, { type: fetchLinks.pending.type }).listStatus).toBe('loading');
  });

  test('fulfilled replaces items', () => {
    const links = [makeLink({ code: 'aaa1111' }), makeLink({ code: 'bbb2222' })];
    const state = reducer(initial, { type: fetchLinks.fulfilled.type, payload: links });

    expect(state.listStatus).toBe('succeeded');
    expect(state.items).toEqual(links);
  });

  test('rejected records the error', () => {
    const state = reducer(initial, { type: fetchLinks.rejected.type, payload: envelope });

    expect(state.listStatus).toBe('failed');
    expect(state.error).toEqual(envelope);
  });
});

describe('deleteLink', () => {
  test('fulfilled removes the matching item', () => {
    const state = reducer(
      { ...initial, items: [makeLink({ code: 'keep111' }), makeLink({ code: 'drop222' })] },
      { type: deleteLink.fulfilled.type, payload: 'drop222' }
    );

    expect(state.items.map((l) => l.code)).toEqual(['keep111']);
  });

  test('fulfilled clears lastCreated when it was the deleted link', () => {
    const link = makeLink({ code: 'drop222' });
    const state = reducer(
      { ...initial, items: [link], lastCreated: link },
      { type: deleteLink.fulfilled.type, payload: 'drop222' }
    );

    expect(state.lastCreated).toBeNull();
  });

  test('fulfilled leaves an unrelated lastCreated alone', () => {
    const kept = makeLink({ code: 'keep111' });
    const state = reducer(
      { ...initial, items: [kept], lastCreated: kept },
      { type: deleteLink.fulfilled.type, payload: 'drop222' }
    );

    expect(state.lastCreated).toEqual(kept);
  });
});

describe('plain reducers', () => {
  test('clearError', () => {
    expect(reducer({ ...initial, error: envelope }, clearError()).error).toBeNull();
  });

  test('clearLastCreated', () => {
    const link = makeLink();
    expect(reducer({ ...initial, lastCreated: link }, clearLastCreated()).lastCreated).toBeNull();
  });
});
