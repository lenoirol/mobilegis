"""Kiem tra thuat toan du bao theo thang bang chuoi GIA LAP (chi dung trong kiem thu, khong phai du lieu that)."""
import csv, json, sys, tempfile, unittest
from pathlib import Path
import numpy as np
ROOT = Path(__file__).resolve().parents[1]; sys.path.insert(0, str(ROOT / 'scripts'))
import forecast_monthly as fm

def synth(path_m, path_s, codes=('00001', '00002', '00003'), start='2020-01', n=82, seed=1, gaps=True):
    rng = np.random.default_rng(seed); months = fm.month_range(start, fm.add_months(start, n - 1))
    with open(path_m, 'w', newline='', encoding='utf8') as f, open(path_s, 'w', newline='', encoding='utf8') as g:
        w = csv.writer(f); w.writerow(['code', 'month', 'lst', 'lst_pixels', 'ndvi', 'ndvi_pixels'])
        gw = csv.writer(g); gw.writerow(['code', 'sampled_pixels'])
        for ci, code in enumerate(codes):
            gw.writerow([code, 100])
            for i, ym in enumerate(months):
                m = int(ym[5:]) - 1
                lst = 33 + 4 * np.sin((m - 2) / 12 * 2 * np.pi) + 0.1 * i / 12 + rng.normal(0, .4) + ci % 5
                ndvi = 0.45 - 0.1 * np.sin((m - 2) / 12 * 2 * np.pi) + rng.normal(0, .02)
                miss = gaps and (m in (6, 7) and i % 3 == 0)
                w.writerow([code, ym, '' if miss else f'{lst:.3f}', 0 if miss else 90, f'{ndvi:.4f}', 95 if not miss else 20])
    return months

class ForecastTests(unittest.TestCase):
    def setUp(self): self.tmp = Path(tempfile.mkdtemp())
    def run_fc(self, **kw):
        m, s = self.tmp / 'm.csv', self.tmp / 's.csv'; months = synth(m, s, **kw)
        return months, fm.run(m, s, self.tmp / 'out.json')
    def test_months_arithmetic(self):
        self.assertEqual(fm.add_months('2026-10', 1), '2026-11'); self.assertEqual(fm.add_months('2026-12', 1), '2027-01')
        self.assertEqual(len(fm.month_range('2020-01', '2026-10')), 82)
    def test_forecast_shape_and_seasonality(self):
        months, d = self.run_fc()
        self.assertEqual(d['future'][0], '2026-11'); self.assertEqual(len(d['future']), 6)
        u = d['units']['00001']; self.assertEqual(len(u['lst']), 82); self.assertEqual(len(u['f_lst']), 6)
        # the synthetic season peaks in March-April: forecast Mar 2027 (index 4) must exceed Nov 2026 (index 0)
        self.assertGreater(u['f_lst'][4][0], u['f_lst'][0][0] + 2)
        for v, lo, hi in u['f_lst']: self.assertTrue(lo <= v <= hi)
    def test_gaps_are_not_filled(self):
        months, d = self.run_fc(); u = d['units']['00001']
        missing = [m for m in months if int(m[5:]) in (7, 8) and months.index(m) % 3 == 0]
        self.assertTrue(missing); self.assertTrue(all(u['lst'][months.index(m)] is None for m in missing))
    def test_low_coverage_month_is_missing(self):
        months, d = self.run_fc(); u = d['units']['00001']
        low = [i for i, m in enumerate(months) if int(m[5:]) in (7, 8) and i % 3 == 0]   # ndvi_pixels 20/100 < 50%
        self.assertTrue(all(u['ndvi'][i] is None for i in low))
    def test_backtest_and_calibration_reported(self):
        _, d = self.run_fc()
        for k in ('lst', 'ndvi'):
            info = d['indices'][k]; self.assertLess(info['mae_model'], 1.5 if k == 'lst' else .08); self.assertGreater(info['n_backtest'], 20)
    def test_too_short_series_rejected(self):
        m, s = self.tmp / 'm.csv', self.tmp / 's.csv'; synth(m, s, n=30)
        with self.assertRaises(SystemExit): fm.run(m, s, self.tmp / 'o.json')
    def test_values_clipped_to_plausible_range(self):
        _, d = self.run_fc()
        for u in d['units'].values():
            for v, lo, hi in u['f_ndvi']: self.assertTrue(-.2 <= lo <= hi <= 1.0)

if __name__ == '__main__': unittest.main(verbosity=2)
