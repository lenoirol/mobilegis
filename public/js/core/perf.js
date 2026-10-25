/* Field speed measurement. Marks when the first map data appeared and keeps the numbers in this browser until the person sends them.
   Nothing here leaves the device by itself. */
const KEY = 'mg-perf', WAIT = 'mg-perf-wait';
const marks = {load: null, splash: null};
let firstOpen = false, startedOnMap = true, finalized = false, onDone = null;

const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null') || {}; } catch (_) { return {}; } };
const write = value => { try { sessionStorage.setItem(KEY, JSON.stringify(value)); } catch (_) { /* private mode: numbers stay in memory only */ } };
let memory = read();

export const perf = {
  /** Called once at boot: was this the very first open in this tab (the start-up screen is held longer then)? */
  begin(first, onMap) { firstOpen = !!first; startedOnMap = !!onMap; },
  /** kind: 'load' = first map tiles drawn, 'splash' = start-up screen gone. The map counts as visible when both have happened. */
  mark(kind) {
    if (finalized || marks[kind] != null) return;
    if (!startedOnMap) { finalized = true; return; }   // the app was opened on another page: the map load time would include waiting there, so it is not recorded
    marks[kind] = Math.round(performance.now());
    if (marks.load != null && marks.splash != null) {
      finalized = true;
      memory = {...memory, first_map_ms: Math.max(marks.load, marks.splash), first_open: firstOpen};
      write(memory);
      let waiting = false;
      try { waiting = sessionStorage.getItem(WAIT) === '1'; sessionStorage.removeItem(WAIT); } catch (_) { /* ignore */ }
      if (waiting) onDone?.();
    }
  },
  /** Called by the test page: reload the app on the map and come back to the test page when the map has appeared. */
  requestReload(back) {
    memory = {...memory}; delete memory.first_map_ms; delete memory.first_open; write(memory);
    try { sessionStorage.setItem(WAIT, '1'); } catch (_) { /* ignore */ }
    location.hash = '#/ban-do';
    location.reload();
  },
  onReturn(fn) { onDone = fn; },
  get result() { return {...memory}; },
  setLayers(list) { memory = {...memory, layer_ms: list}; write(memory); },
  clear() { memory = {}; write(memory); },
};

export const median = list => { const v = list.filter(Number.isFinite).sort((a, b) => a - b); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2); };

/** Best-effort description of this device and network from what the browser exposes (the person can edit it). */
export function describeDevice() {
  const ua = navigator.userAgent || '';
  let device = '';
  const android = ua.match(/Android ([\d.]+); ([^;)]+?)(?: Build|\)|;)/);
  if (android) device = `Android ${android[1]} · ${android[2].trim()}`;
  else if (/iPhone|iPad/.test(ua)) device = (/iPad/.test(ua) ? 'iPad' : 'iPhone') + ' · iOS ' + ((ua.match(/OS ([\d_]+)/) || [])[1] || '').replace(/_/g, '.');
  else device = navigator.userAgentData?.platform || navigator.platform || '';
  const c = navigator.connection || {};
  const type = c.type === 'wifi' ? 'wifi' : c.type === 'cellular' ? 'mobile' : '';
  const net = [c.effectiveType, Number.isFinite(c.downlink) ? c.downlink + ' Mb/s' : '', Number.isFinite(c.rtt) ? 'rtt ' + c.rtt + ' ms' : ''].filter(Boolean).join(' · ');
  return {device, type, net, screen: `${screen.width}×${screen.height} · cửa sổ ${innerWidth}×${innerHeight} · x${(window.devicePixelRatio || 1).toFixed(1)}`};
}
