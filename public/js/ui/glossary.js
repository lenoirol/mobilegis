/* "Chỉ số là gì?": LST, NDVI, TVDI written out in full with meaning, how to read, unit and limits. */
import {h, icon} from '../core/dom.js';
import {INDEX, INDICES, rampCss, TVDI_CLASSES} from '../core/format.js';

export function showGlossary(focus) {
  const dialog = h('dialog', {class: 'tour gloss', 'aria-label': 'Ý nghĩa các chỉ số'},
    h('h2', null, 'Các chỉ số trên bản đồ'),
    h('p', {class: 'muted small', style: {margin: '4px 0 12px'}}, 'Mỗi chỉ số được tính cho từng xã/phường từ ảnh vệ tinh Landsat 8/9 trong mùa khô.'),
    h('div', {class: 'gloss-list'}, ...INDICES.map(k => {
      const s = INDEX[k];
      return h('section', {class: 'gloss-item' + (k === focus ? ' focus' : ''), dataset: {ix: k}},
        h('h3', null, h('b', null, s.code), ` – ${s.full.split(' · ')[1]}`, s.experimental ? h('span', {class: 'tag'}, 'thử nghiệm') : null),
        h('div', {class: 'gloss-ramp', style: {background: rampCss(k)}}),
        h('p', {class: 'small muted gloss-en'}, `${s.english} · đơn vị: ${s.unit || 'không đơn vị'} · thang ${s.scaleText}`),
        h('p', null, h('b', null, 'Ý nghĩa: '), s.what), h('p', null, h('b', null, 'Cách đọc: '), s.read), h('p', null, h('b', null, 'Lưu ý: '), s.limit),
        k === 'tvdi' ? h('p', {class: 'small muted'}, 'Các mức: ' + TVDI_CLASSES.map((c, i) => `${i ? String(TVDI_CLASSES[i - 1].max).replace('.', ',') : '0'}–${String(Math.min(c.max, 1)).replace('.', ',')} ${c.name}`).join(' · ')) : null);
    })),
    h('div', {class: 'dlg-actions'}, h('button', {class: 'btn primary', type: 'button', on: {click: () => { dialog.close(); dialog.remove(); }}}, 'Đã hiểu')));
  dialog.addEventListener('cancel', () => dialog.remove());
  document.body.append(dialog); dialog.showModal();
  dialog.querySelector('.focus')?.scrollIntoView({block: 'nearest'});
}
/** Small "ⓘ" button that opens the glossary on a given index. */
export const infoButton = (k, label = 'Ý nghĩa chỉ số') => h('button', {class: 'info-btn', type: 'button', title: label, 'aria-label': label, on: {click: e => { e.stopPropagation(); showGlossary(k); }}}, icon('info', 15));
