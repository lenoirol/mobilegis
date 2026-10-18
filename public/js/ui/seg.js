import {h} from '../core/dom.js';
/**
 * Segmented control with a sliding thumb.
 * options: [{value, label, title?}] — returns {el, set(value), setDisabled(values)}.
 */
export function segmented(options, value, onChange, {label = '', layout = 'row'} = {}) {
  const thumb = h('span', {class: 'seg-thumb', 'aria-hidden': 'true'});
  const buttons = options.map(o => h('button', {type: 'button', dataset: {value: o.value}, title: o.title || '', 'aria-pressed': String(o.value === value),
    on: {click: () => api.set(o.value, true)}}, o.label));
  const el = h('div', {class: 'seg ' + layout, role: 'group', 'aria-label': label}, thumb, ...buttons);
  const place = () => {
    const active = buttons.find(b => b.getAttribute('aria-pressed') === 'true');
    if (!active || !active.offsetWidth) return;
    thumb.style.width = active.offsetWidth + 'px'; thumb.style.height = active.offsetHeight + 'px';
    thumb.style.transform = `translate(${active.offsetLeft}px,${active.offsetTop}px)`;
  };
  const api = {
    el, value,
    set(next, emit = false) {
      api.value = next;
      buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === String(next))));
      place();
      if (emit) onChange?.(next);
    },
    setDisabled(disabled = []) { buttons.forEach(b => { b.disabled = disabled.includes(b.dataset.value) || disabled.includes(+b.dataset.value); }); },
    place,
  };
  requestAnimationFrame(place);
  new ResizeObserver(place).observe(el);
  document.fonts?.ready.then(place);
  return api;
}
