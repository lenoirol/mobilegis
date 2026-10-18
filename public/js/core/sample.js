/* Pixel lookup without the server: reads the 120 m grid blocks written by scripts/export_static_query.py.
   Same nearest-cell arithmetic as /api/sample in server.py; values differ only by quantisation (finer than the display). */
import {url} from './api.js';

const indexes = new Map(), blocks = new Map();

async function gridIndex(source) {
  if (!indexes.has(source)) indexes.set(source, fetch(url(`/data/query/${source}/index.json`)).then(r => { if (!r.ok) throw new Error('missing'); return r.json(); }).catch(e => { indexes.delete(source); throw e; }));
  return indexes.get(source);
}

async function inflate(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return buffer;   // the host already decoded it (Content-Encoding: gzip)
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

function block(source, name, bx, by) {
  const key = `${source}/${name}/${bx}_${by}`;
  if (!blocks.has(key)) {
    blocks.set(key, fetch(url(`/data/query/${key}.bin.gz`)).then(async r => {
      if (r.status === 404) return null;                         // block with no valid cell is not written
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return new Int16Array(await inflate(await r.arrayBuffer()));
    }).catch(e => { blocks.delete(key); throw e; }));
    if (blocks.size > 60) blocks.delete(blocks.keys().next().value);   // keep memory small on phones
  }
  return blocks.get(key);
}

/** {value, status}: status 'ok' | 'unavailable' (no grid for this year/source). value null = no valid data at that cell. */
export async function staticSample({lat, lng, index, year, change, source}) {
  let idx;
  try { idx = await gridIndex(source); } catch (_) { return {value: null, status: 'unavailable'}; }
  const name = change ? 'change_' + index : `${index}_${year}`, g = idx.grids[name];
  if (!g) return {value: null, status: 'unavailable'};
  const [w, s, e, n] = g.bounds;
  if (!(w <= lng && lng < e && s < lat && lat <= n)) return {value: null, status: 'ok'};
  const x = Math.floor((lng - w) / (e - w) * g.width), y = Math.floor((n - lat) / (n - s) * g.height);
  const cells = await block(source, name, Math.floor(x / idx.block), Math.floor(y / idx.block));
  const q = cells ? cells[(y % idx.block) * idx.block + (x % idx.block)] : idx.nodata;
  return {value: q === idx.nodata ? null : q / g.scale, status: 'ok'};
}
