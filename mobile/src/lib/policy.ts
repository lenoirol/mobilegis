/** Presentation rules only (same as viewer-policy.js): never fill, rewrite or interpolate research observations. */
import {valid, type IndexKey} from './format';
import type {Row} from './data';

export const THRESHOLD = 0.5;
export type Quality = 'missing' | 'unknown' | 'limited' | 'adequate';
export function quality(row: Row | undefined, index: IndexKey): Quality {
  if (!row || !valid(row[index])) return 'missing';
  const coverage = row[`${index}_coverage` as const];
  if (!valid(coverage) || coverage < 0 || coverage > 1) return 'unknown';
  return coverage < THRESHOLD ? 'limited' : 'adequate';
}
export const eligible = (row: Row | undefined, index: IndexKey) => quality(row, index) === 'adequate';
