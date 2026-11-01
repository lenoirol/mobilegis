/* Search box: type part of a commune name (accents optional) and jump to it. */
import {h, mount, icon} from '../core/dom.js';
import {normalize} from '../core/format.js';

export function createSearch(host, {geo, onPick}) {
  const items = geo.features.map(f => ({code: f.properties.code, name: f.properties.full_name || f.properties.name, key: normalize(f.properties.full_name || f.properties.name)}));
  const input = h('input', {class: 'input', type: 'search', placeholder: 'Tìm xã/phường…', 'aria-label': 'Tìm xã/phường theo tên', autocomplete: 'off', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'searchList'});
  const list = h('ul', {id: 'searchList', class: 'search-list', role: 'listbox', hidden: true});
  mount(host, h('span', {class: 'search-ic'}, icon('search', 16)), input, list);
  let shown = [], active = 0;
  const pick = item => { if (!item) return; input.value = ''; close(); onPick(item.code); input.blur(); };
  function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); }
  function render() {
    const q = normalize(input.value.trim());
    if (!q) { close(); return; }
    shown = items.filter(i => i.key.includes(q)).sort((a, b) => a.key.indexOf(q) - b.key.indexOf(q) || a.name.localeCompare(b.name, 'vi')).slice(0, 8);
    active = 0;
    mount(list, ...(shown.length ? shown.map((i, n) => h('li', {role: 'option', 'aria-selected': String(n === active), on: {mousedown: e => { e.preventDefault(); pick(i); }}}, i.name))
      : [h('li', {class: 'none'}, 'Không thấy khu vực nào')]));
    list.hidden = false; input.setAttribute('aria-expanded', 'true');
  }
  const paint = () => [...list.children].forEach((li, n) => li.setAttribute('aria-selected', String(n === active)));
  input.addEventListener('input', render);
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('focus', render);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { active = Math.min(shown.length - 1, active + 1); paint(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); paint(); e.preventDefault(); }
    else if (e.key === 'Enter') { pick(shown[active]); }
    else if (e.key === 'Escape') { input.value = ''; close(); }
  });
}
