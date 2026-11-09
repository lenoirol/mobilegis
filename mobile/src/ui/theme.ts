import {INDEX, type IndexKey} from '@/lib/format';
/** Màu giao diện v3 (giống bản web): nền sáng, chữ xanh đen, nhấn xanh ngọc. Tab Thống kê và Dự báo dùng màu theo chỉ số. */
export const C = {
  bg: '#f3f6f8', bg2: '#e9eef2', surface: '#ffffff', surface2: '#f7f9fb',
  ink: '#1d2733', ink2: '#435162', ink3: '#647386', line: '#dce3ea', line2: '#c9d3dd',
  accent: '#23756a', accent2: '#1b5f56', accentSoft: '#e2f1ee',
  warnBg: '#fdf1d6', warnInk: '#7a4a00', err: '#b42318', errBg: '#fde8e6', ok: '#25744a',
};
export const R = 12, R_LG = 16, GAP = 12;
export const ix = (k: IndexKey) => INDEX[k];
export const SHADOW = {shadowColor: '#14202e', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: {width: 0, height: 2}, elevation: 3} as const;
