import {INDEX, colorAt, valid, type IndexKey} from '@/lib/format';

const hex = (c: string) => [1, 3, 5].map(p => parseInt(c.slice(p, p + 2), 16));
const lerp = (a: string, b: string, t: number) => '#' + hex(a).map((v, k) => Math.round(v + (hex(b)[k] - v) * t).toString(16).padStart(2, '0')).join('');
export const COVERAGE_RAMP = ['#ecbca3', '#f4d373', '#0d8165'];
export const CHANGE_RAMP = ['#2171b5', '#f7f7f7', '#c53a32'];
export const NODATA = '#c9c4b0';
export const coverageColor = (v: unknown) => !valid(v) ? NODATA : v < .5 ? lerp(COVERAGE_RAMP[0], COVERAGE_RAMP[1], v / .5) : lerp(COVERAGE_RAMP[1], COVERAGE_RAMP[2], (v - .5) / .5);
/** Colour of a value on the fixed scale of an index (linear ramp like Earth Engine). */
export const valueColor = (value: unknown, index: IndexKey) => { if (!valid(value)) return NODATA; const s = INDEX[index]; return colorAt((value - s.min) / (s.max - s.min), index); };
