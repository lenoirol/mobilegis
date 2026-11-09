import {useSyncExternalStore} from 'react';
import type {IndexKey} from './format';
/** Trạng thái dùng chung cho mọi tab (một lựa chọn chỉ số, năm, khu vực đang chọn, thứ tự xếp hạng, chế độ nhẹ). */
export type Dir = 'auto' | 'asc' | 'desc';
export interface State {index: IndexKey; year: number; selected: string | null; dir: Dir; lite: boolean; dims: '2d' | '3d'; basemap: 'osm' | 'sat' | 'plain'; pixel: boolean}
let state: State = {index: 'lst', year: 2025, selected: null, dir: 'auto', lite: false, dims: '2d', basemap: 'osm', pixel: false};
const subs = new Set<() => void>();
export const getState = () => state;
export function setState(patch: Partial<State>) { state = {...state, ...patch}; subs.forEach(f => f()); }
const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
/** Chọn một phần nhỏ của trạng thái; thành phần chỉ vẽ lại khi phần đó đổi. Trả về giá trị nguyên thủy để tránh vẽ lại thừa. */
export function useStore<T>(pick: (s: State) => T): T { return useSyncExternalStore(subscribe, () => pick(state)); }
