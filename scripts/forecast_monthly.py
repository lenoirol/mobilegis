"""Du bao THEO THANG gia tri trung binh LST / NDVI cua 167 xa/phuong (thu nghiem, khong phai canh bao chinh thuc).

Dau vao  : data/forecast_input/modis_monthly.csv (+ modis_sampled_pixels.csv) tu scripts/gee_monthly_modis.js
Dau ra   : public/data/forecast/forecast.json
Mo hinh  : hoi quy theo mua (12 he so thang) + xu huong tuyen tinh nhe, so voi phuong phap co so
           "bang trung binh cung thang cac nam truoc". Mo hinh duoc chon theo sai so kiem chung (12 thang cuoi bi giu lai),
           khoang tin cay 80% duoc hieu chinh bang chinh sai so kiem chung do. Thang thieu du lieu khong duoc noi suy.
"""
import argparse, csv, json, math, sys
from datetime import date
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
INDICES = ('lst', 'ndvi')
RANGE = {'lst': (15.0, 60.0), 'ndvi': (-0.2, 1.0)}
MIN_COVERAGE = 0.5      # khop quy tac 50% cua ban do
MIN_POINTS = 36         # it nhat 3 nam du lieu hop le moi du bao
HORIZON = 6
HOLDOUT = 12


def add_months(ym, k):
    y, m = int(ym[:4]), int(ym[5:])
    t = y * 12 + (m - 1) + k
    return f'{t // 12:04d}-{t % 12 + 1:02d}'


def month_range(a, b):
    out, cur = [], a
    while cur <= b:
        out.append(cur); cur = add_months(cur, 1)
    return out


def load(monthly_csv, sampled_csv=None):
    """series[code][index] = {month: value or None}; None when coverage < 50 % or no data.
    Coverage = pixels / the largest pixel count seen for that area and index (the monthly grid is not the same as the
    fixed sampling grid, so a separate "sampled_pixels" file would not be comparable). sampled_csv is accepted for compatibility but unused."""
    with open(monthly_csv, encoding='utf8') as f:
        rows = list(csv.DictReader(f))
    top = {}
    for r in rows:
        for k in INDICES:
            n = r.get(k + '_pixels')
            if n not in (None, '', 'null'): top[(r['code'].zfill(5), k)] = max(top.get((r['code'].zfill(5), k), 0.0), float(n))
    series, months = {}, set()
    for r in rows:
        code, ym = r['code'].zfill(5), r['month']
        months.add(ym)
        for k in INDICES:
            v, n = r.get(k), r.get(k + '_pixels')
            ok = v not in (None, '', 'null') and n not in (None, '', 'null') and top.get((code, k)) and float(n) / top[(code, k)] >= MIN_COVERAGE
            series.setdefault(code, {}).setdefault(k, {})[ym] = float(v) if ok else None
    return series, sorted(months)


def design(months_idx, months_cal):
    """Hang so + 12 do lech theo thang (one-hot) + xu huong (nam)."""
    X = np.zeros((len(months_idx), 14))
    for i, (t, m) in enumerate(zip(months_idx, months_cal)):
        X[i, 0] = 1.0
        X[i, 1 + m] = 1.0
        X[i, 13] = t / 12.0
    return X


def fit_predict(vals, months, horizon_months, model):
    """vals: list (None = missing) aligned to months. Returns (pred list, sigma) or None if too little data."""
    t_all = np.arange(len(months))
    cal = np.array([int(m[5:]) - 1 for m in months])
    ok = np.array([v is not None for v in vals])
    if ok.sum() < MIN_POINTS: return None
    y = np.array([v for v in vals if v is not None], dtype=float)
    fut_t = np.arange(len(months), len(months) + len(horizon_months))
    fut_cal = np.array([int(m[5:]) - 1 for m in horizon_months])
    if model == 'seasonal':     # co so: trung binh cung thang cac nam truoc
        means = {c: y[cal[ok] == c].mean() if (cal[ok] == c).any() else y.mean() for c in range(12)}
        pred = [means[c] for c in fut_cal]
        resid = y - np.array([means[c] for c in cal[ok]])
        return pred, float(resid.std(ddof=1) if len(resid) > 2 else 0.0)
    X = design(t_all[ok], cal[ok])
    lam = np.zeros(14); lam[1:13] = 0.5; lam[13] = 4.0   # thang vang mat -> ve trung binh; phat nhe xu huong de tranh ngoai suy qua tay
    beta = np.linalg.solve(X.T @ X + np.diag(lam), X.T @ y)
    resid = y - X @ beta
    dof = max(len(y) - 13, 1)
    return list(design(fut_t, fut_cal) @ beta), float(math.sqrt((resid ** 2).sum() / dof))


def clip(k, v):
    lo, hi = RANGE[k]
    return min(hi, max(lo, v))


def backtest(series, months, k, model):
    """Giu lai HOLDOUT thang cuoi: luu sai so tuyet doi va |sai so|/sigma (de hieu chinh khoang tin cay)."""
    train_m, test_m = months[:-HOLDOUT], months[-HOLDOUT:]
    abs_err, z = [], []
    for code, s in series.items():
        vals = s.get(k)
        if not vals: continue
        out = fit_predict([vals.get(m) for m in train_m], train_m, test_m, model)
        if out is None: continue
        pred, sigma = out
        for p, m in zip(pred, test_m):
            actual = vals.get(m)
            if actual is None: continue
            e = abs(clip(k, p) - actual)
            abs_err.append(e)
            if sigma > 0: z.append(e / sigma)
    return abs_err, z


def run(monthly_csv, sampled_csv, out_path, today=None):
    series, months = load(monthly_csv, sampled_csv)
    while months and all(s.get(k, {}).get(months[-1]) is None for s in series.values() for k in INDICES):   # newest months MODIS has not published yet
        months.pop()
    if len(months) < MIN_POINTS + HOLDOUT: sys.exit('Chuoi thang qua ngan de du bao.')
    future = [add_months(months[-1], i + 1) for i in range(HORIZON)]
    summary, chosen, scale = {}, {}, {}
    for k in INDICES:
        res = {}
        for model in ('seasonal', 'ols'):
            e, z = backtest(series, months, k, model)
            res[model] = {'mae': float(np.mean(e)) if e else None, 'n': len(e), 'z80': float(np.quantile(z, .8)) if z else 1.2816}
        usable = {m: r for m, r in res.items() if r['mae'] is not None}
        if not usable: sys.exit(f'Khong du du lieu kiem chung cho {k}.')
        best = min(usable, key=lambda m: usable[m]['mae'])
        chosen[k], scale[k] = best, usable[best]['z80']
        summary[k] = {'model': best, 'mae_model': round(usable[best]['mae'], 3), 'mae_baseline': round(res['seasonal']['mae'], 3) if res['seasonal']['mae'] is not None else None,
                      'n_backtest': usable[best]['n'], 'beats_baseline': best != 'seasonal', 'interval_scale': round(scale[k], 3)}
    units = {}
    for code, s in sorted(series.items()):
        entry = {}
        for k in INDICES:
            vals = [s.get(k, {}).get(m) for m in months]
            entry[k] = [None if v is None else round(v, 3) for v in vals]
            out = fit_predict(vals, months, future, chosen[k])
            if out is None: entry['f_' + k] = None; continue
            pred, sigma = out
            half = scale[k] * sigma
            entry['f_' + k] = [[round(clip(k, p), 3), round(clip(k, p - half), 3), round(clip(k, p + half), 3)] for p in pred]
        units[code] = entry
    doc = {
        'generated': (today or date.today()).isoformat(), 'status': 'experimental_forecast_not_official_warning',
        'source': 'MODIS Terra MOD11A2 (LST ngay, 1 km) va MOD13A1 (NDVI, 500 m), ban 061, trung binh thang theo xa/phuong; thang co do phu < 50% de trong',
        'months': months, 'future': future, 'interval': 0.8, 'backtest_months': HOLDOUT, 'indices': summary, 'units': units,
        'notes': ['Du bao thu nghiem tu chuoi ngan (khoang 7 nam), khong phai canh bao chinh thuc.',
                  'Khoang tin cay 80% duoc hieu chinh bang sai so kiem chung tren 12 thang cuoi.',
                  'Chuoi MODIS tho hon Landsat cua ban do (1 km / 500 m) va khong tron voi so lieu Landsat.',
                  'TVDI chua duoc du bao.']}
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    return doc


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--monthly', default=str(ROOT / 'data/forecast_input/modis_monthly.csv'))
    ap.add_argument('--sampled', default=str(ROOT / 'data/forecast_input/modis_sampled_pixels.csv'))
    ap.add_argument('--out', default=str(ROOT / 'public/data/forecast/forecast.json'))
    a = ap.parse_args()
    d = run(a.monthly, a.sampled, a.out)
    for k, v in d['indices'].items(): print(k, v)
    print('Da ghi', a.out, '·', len(d['units']), 'xa/phuong · du bao', d['future'][0], '→', d['future'][-1])
