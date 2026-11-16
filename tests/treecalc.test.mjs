// node --test tests/treecalc.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {compute, defaults, sanitize, resultRows, shareOfArea, SCENARIOS, PARAMS} from '../public/js/core/treecalc.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≠ ${b}`);

test('tái lập đúng ví dụ của đề bài', () => {
  const r = compute(defaults());
  close(r.co2, 200); close(r.o2, 145.4545454545); close(r.biomass, 120000); close(r.shade, 15000); close(r.water, 3000);
  close(r.G1, 60_000_000); close(r.G2, 120_000_000); close(r.G3, 30_000_000); close(r.net, 210_000_000);
  assert.equal(r.problems.length, 0);
  assert.equal(r.breakEven, null);       // không có chi phí → không có năm hoàn vốn
});

test('kịch bản không tính trùng bỏ G₂', () => {
  const r = compute(defaults(), SCENARIOS.find(s => s.key === 'nodup').use);
  close(r.net, 90_000_000);
  assert.match(resultRows(r).at(-1).formula, /^G₁ \+ G₃ − /);
});

test('chi phí và năm hoàn vốn', () => {
  const r = compute({...defaults(), cdt: 150000, cbd: 5000});      // 150 triệu trồng + 5 triệu/năm chăm sóc; lợi ích 21 triệu/năm
  close(r.invest, 150_000_000); close(r.care, 50_000_000); close(r.net, 10_000_000);
  assert.equal(r.byYear.length, 10);
  close(r.byYear[0].net, 21e6 - 150e6 - 5e6);
  assert.equal(r.breakEven, 10);
  close(r.byYear.at(-1).net, r.net);
});

test('đầu vào lỗi không làm hỏng phép tính', () => {
  const {values, problems} = sanitize({N: 'abc', T: -3, f: 2, C: '12,5'});
  assert.equal(values.N, 1000); assert.equal(values.T, 1); assert.equal(values.f, 1); assert.equal(values.C, 12.5);
  assert.equal(problems.length, 3);
  for (const p of PARAMS) assert.ok(p.def >= p.min && p.def <= p.max, p.key);
});

test('tỉ lệ bóng mát so với diện tích khu vực', () => {
  close(shareOfArea(15000, 1.5), 0.01);
  assert.equal(shareOfArea(15000, 0), null);
});

test('bản trong app Android giống hệt bản web', { skip: !existsSync(new URL('../mobile/src/lib/treecalc.js', import.meta.url)) }, () => {
  assert.equal(readFileSync(new URL('../mobile/src/lib/treecalc.js', import.meta.url), 'utf8'), readFileSync(new URL('../public/js/core/treecalc.js', import.meta.url), 'utf8'));
});
