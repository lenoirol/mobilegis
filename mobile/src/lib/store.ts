import {useSyncExternalStore} from 'react';
/** Tiny shared store (the web app's `store`): pinned areas for comparison, last map selection. */
type State = {pinned: string[]; selected: string; index: 'lst' | 'ndvi' | 'tvdi'; year: number};
let state: State = {pinned: ['26743', '27664', '25747'], selected: '26743', index: 'lst', year: 2025};
const subs = new Set<() => void>();
export const getState = () => state;
export function setState(patch: Partial<State>) { state = {...state, ...patch}; subs.forEach(f => f()); }
export function useStore<T>(pick: (s: State) => T): T { return useSyncExternalStore(cb => { subs.add(cb); return () => { subs.delete(cb); }; }, () => pick(state)); }
