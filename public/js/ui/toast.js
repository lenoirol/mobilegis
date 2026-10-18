import {h, $} from '../core/dom.js';
/** Brief, non-blocking message. `error: true` uses the warning shadow. */
export function toast(text, {error = false, ms = 4800} = {}) {
  const host = $('#toasts');
  const node = h('div', {class: 'toast' + (error ? ' err' : ''), role: error ? 'alert' : 'status'}, text);
  host.append(node);
  const close = () => { node.classList.add('out'); setTimeout(() => node.remove(), 260); };
  node.addEventListener('click', close);
  setTimeout(close, ms);
  while (host.children.length > 3) host.firstChild.remove();
}
