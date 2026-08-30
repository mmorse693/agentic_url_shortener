import { configureStore } from '@reduxjs/toolkit';

import linksReducer from './linksSlice';

export function createStore(preloadedState) {
  return configureStore({
    reducer: { links: linksReducer },
    preloadedState,
  });
}

const store = createStore();

export default store;
