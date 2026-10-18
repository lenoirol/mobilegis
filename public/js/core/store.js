/** Minimal observable store. `set` merges a patch and notifies subscribers with (next, prev). */
export function createStore(initial) {
  let state = {...initial};
  const subscribers = new Set();
  return {
    get: () => state,
    set(patch) {
      const prev = state;
      state = {...state, ...patch};
      for (const fn of [...subscribers]) fn(state, prev);
    },
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
  };
}
