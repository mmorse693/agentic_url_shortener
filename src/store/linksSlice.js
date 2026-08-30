import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

import * as linksApi from '../services/linksApi';

/**
 * Thunks reject with the parsed envelope rather than the Error itself. A raw
 * Error serializes to a bare string, and the specific messages AC-15 depends on
 * would be lost.
 */
const toPayload = (err) => ({
  code: err.code || 'UNEXPECTED_ERROR',
  message: err.message || 'Something went wrong.',
  field: err.field,
});

export const createLink = createAsyncThunk(
  'links/create',
  async ({ url, expiresAt = null }, { rejectWithValue }) => {
    try {
      return await linksApi.createLink({ url, expiresAt });
    } catch (err) {
      return rejectWithValue(toPayload(err));
    }
  }
);

export const fetchLinks = createAsyncThunk('links/fetch', async (_arg, { rejectWithValue }) => {
  try {
    return await linksApi.listLinks();
  } catch (err) {
    return rejectWithValue(toPayload(err));
  }
});

export const deleteLink = createAsyncThunk('links/delete', async (code, { rejectWithValue }) => {
  try {
    await linksApi.deleteLink(code);
    return code;
  } catch (err) {
    return rejectWithValue(toPayload(err));
  }
});

const initialState = {
  items: [],
  listStatus: 'idle',
  createStatus: 'idle',
  lastCreated: null,
  error: null,
};

const linksSlice = createSlice({
  name: 'links',
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
    clearLastCreated(state) {
      state.lastCreated = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(createLink.pending, (state) => {
        state.createStatus = 'loading';
        state.error = null;
      })
      .addCase(createLink.fulfilled, (state, action) => {
        state.createStatus = 'succeeded';
        state.lastCreated = action.payload;
        state.items.unshift(action.payload);
      })
      .addCase(createLink.rejected, (state, action) => {
        state.createStatus = 'failed';
        state.error = action.payload || toPayload(action.error);
      })

      .addCase(fetchLinks.pending, (state) => {
        state.listStatus = 'loading';
      })
      .addCase(fetchLinks.fulfilled, (state, action) => {
        state.listStatus = 'succeeded';
        state.items = action.payload;
      })
      .addCase(fetchLinks.rejected, (state, action) => {
        state.listStatus = 'failed';
        state.error = action.payload || toPayload(action.error);
      })

      .addCase(deleteLink.fulfilled, (state, action) => {
        state.items = state.items.filter((link) => link.code !== action.payload);
        if (state.lastCreated && state.lastCreated.code === action.payload) {
          state.lastCreated = null;
        }
      })
      .addCase(deleteLink.rejected, (state, action) => {
        state.error = action.payload || toPayload(action.error);
      });
  },
});

export const { clearError, clearLastCreated } = linksSlice.actions;

export const selectLinks = (state) => state.links.items;
export const selectLastCreated = (state) => state.links.lastCreated;
export const selectCreateStatus = (state) => state.links.createStatus;
export const selectListStatus = (state) => state.links.listStatus;
export const selectLinksError = (state) => state.links.error;

export default linksSlice.reducer;
