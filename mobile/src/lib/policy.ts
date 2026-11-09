/** Quy tắc hiển thị (giống viewer-policy.js của bản web): không lấp, không nội suy số liệu. Khu vực dưới 50% ô ảnh hợp lệ để xám. */
import {valid, type IndexKey} from './format';
import type {Row} from './data';
export const THRESHOLD = 0.5;
export const eligible = (row: Row | undefined, k: IndexKey, min = THRESHOLD) => {
  if (!row || !valid(row[k])) return false;
  const c = row[`${k}_coverage` as const];
  return valid(c) && c >= min && c <= 1;
};
