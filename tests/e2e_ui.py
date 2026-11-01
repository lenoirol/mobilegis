"""Browser end-to-end test for the v3 interface "Bản đồ Nhiệt - Xanh - Khô TP.HCM" (real Chrome via Playwright).

Needs a running server and the project virtual environment (it creates and deletes its own throw-away accounts).
    MOBILEGIS_URL=http://127.0.0.1:5379 .venv/bin/python tests/e2e_ui.py [screenshot_dir]
Not collected by `unittest discover` (the name does not start with test_).
WebGL runs on SwiftShader in headless Chrome, so the 2D/3D map renders without a GPU.
"""
import os, sys, json, uuid, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / 'tests'))
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit('Cần cài Playwright: .venv/bin/pip install playwright')
import auth_support

U = os.environ.get('MOBILEGIS_URL', 'http://127.0.0.1:5379').rstrip('/') + '/'
SHOTS = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix='mobilegis_e2e_')
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
results, errors = [], []


def ok(name, cond, detail=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else ' · ' + str(detail)[:200]))


def page(browser, mobile=False, block_api=False, tour=False):
    ctx = browser.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': 1440, 'height': 860},
                              device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile, accept_downloads=True)
    pg = ctx.new_page()
    if not tour:
        ctx.add_init_script("try { localStorage.setItem('mg-tour', '1'); } catch (e) {}")
    if block_api:
        pg.route('**/api/**', lambda r: r.fulfill(status=404, body='Not found', content_type='text/html'))
    pg.on('console', lambda m: errors.append(m.text[:200]) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    pg.on('pageerror', lambda e: errors.append('pageerror ' + str(e)[:300]))
    pg.goto(U)
    pg.wait_for_selector('#splash', state='detached', timeout=30000)
    pg.wait_for_timeout(1200)
    return ctx, pg


try:
    admin_email, admin_id = auth_support.create_user('admin')
except Exception as error:   # database not reachable from this process: the admin part is skipped, not faked
    admin_email = admin_id = None
    print('SKIP admin checks · cannot reach the database directly:', str(error)[:80])
try:
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True, args=ARGS)

        # ---------------- desktop guest: map-first screen ----------------
        ctx, pg = page(b)
        ok('title is the new product name', pg.title() == 'Bản đồ Nhiệt - Xanh - Khô TP.HCM', pg.title())
        ok('map fills the window', pg.evaluate("(() => { const r = document.querySelector('#map').getBoundingClientRect(); return r.width === innerWidth && r.height === innerHeight; })()"))
        ok('ranking lists all 167 areas', pg.locator('.rank-item').count() == 167, pg.locator('.rank-item').count())
        ok('LST ranking starts with the hottest ward', 'An Phú' in pg.locator('.rank-item').first.inner_text())
        low = pg.locator('.rank-item.low').count()
        rows25 = pg.request.get(U + 'data/gee_recovery/observations.json').json()
        expected = sum(1 for r in rows25 if r['year'] == 2025 and not (r.get('lst_coverage') or 0) >= 0.5)
        ok('areas below 50% coverage are listed but not ranked', low == expected and pg.locator('.rank-group').count() == 1, (low, expected))
        ok('selected area card shows three values without scrolling', pg.locator('#info .val').count() == 3 and pg.evaluate("document.querySelector('#info').getBoundingClientRect().bottom < innerHeight"))
        pg.click('#indexSwitch button:has-text("Độ xanh")'); pg.wait_for_timeout(700)
        vals = [float(t.replace(',', '.')) for t in pg.locator('.rank-item:not(.low) .v').all_inner_texts()]
        ok('NDVI ranked low → high', vals == sorted(vals), vals[:3])
        pg.click('#indexSwitch button:has-text("Độ khô")'); pg.wait_for_timeout(700)
        vals = [float(t.replace(',', '.')) for t in pg.locator('.rank-item:not(.low) .v').all_inner_texts()]
        ok('TVDI ranked high → low', vals == sorted(vals, reverse=True), vals[:3])
        ok('TVDI marked experimental in legend', 'thử nghiệm' in pg.inner_text('#legend'))
        pg.click('#indexSwitch button:has-text("Nhiệt độ")'); pg.wait_for_timeout(500)

        # threshold
        pg.check('.f-row[data-index=lst] input[type=checkbox]'); pg.wait_for_timeout(900)
        ok('LST > 40 in 2025 matches 63 areas', '63/167' in pg.inner_text('.filter-box summary'), pg.inner_text('.filter-box summary'))
        pg.check('.f-actions input[type=checkbox]'); pg.wait_for_timeout(500)
        ok('"only matching" shows 63 rows', pg.locator('.rank-item').count() == 63, pg.locator('.rank-item').count())
        pg.click('.f-actions button:has-text("Bỏ lọc")'); pg.wait_for_timeout(500)
        ok('reset filter restores 167 rows', pg.locator('.rank-item').count() == 167)

        # 3D + timeline
        pg.click('#mapTools button[data-value="3d"]'); pg.wait_for_timeout(1500)
        ok('3D tilts the map', pg.evaluate("document.querySelector('#map') && true") and 'Chiều cao khối' in pg.inner_text('#legend'))
        pg.screenshot(path=os.path.join(SHOTS, 'desktop_3d.png'))
        pg.select_option('.tl-opts select >> nth=0', '2021'); pg.select_option('.tl-opts select >> nth=1', '2023'); pg.select_option('.tl-opts select >> nth=2', '1000')
        pg.click('.tl-play'); pg.wait_for_timeout(3400); year = pg.inner_text('.tl-year b'); pg.click('.tl-play')
        ok('playback stays inside the chosen range', year in ('2021', '2022', '2023'), year)
        pg.click('#mapTools button[data-value="2d"]'); pg.click('.tl-tick[data-year="2025"]'); pg.wait_for_timeout(800)
        pg.click('#mapTools button[data-value=pixel]'); pg.wait_for_timeout(1500)
        ok('120 m pixel mode disables 3D', pg.is_disabled('#mapTools button[data-value="3d"]'))
        pg.click('#mapTools button[data-value=zones]')
        name = pg.locator('.rank-item').nth(2).locator('.n b').inner_text(); pg.locator('.rank-item').nth(2).click(); pg.wait_for_timeout(1200)
        ok('ranking row selects the area', pg.inner_text('#info h2') == name, name)
        with pg.expect_download(timeout=30000) as dl:
            pg.click('#mapTools button:has-text("Lưu ảnh")')
        ok('map image export (PNG)', dl.value.suggested_filename.endswith('.png'), dl.value.suggested_filename)
        with pg.expect_download() as dl:
            pg.click('.panel-head button:has-text("CSV")')
        ok('ranking CSV export', dl.value.suggested_filename.startswith('xep_hang_'), dl.value.suggested_filename)

        # new in v3.1: search, share link, colour-blind palette, compare years, first-visit guide
        pg.goto(U + '#/'); pg.wait_for_timeout(600)
        pg.fill('.search input', 'ben thanh'); pg.wait_for_timeout(300)
        ok('search finds a ward without accents', 'Bến Thành' in pg.inner_text('.search-list'), pg.inner_text('.search-list'))
        pg.press('.search input', 'Enter'); pg.wait_for_timeout(1500)
        ok('search Enter selects the area', pg.inner_text('#info h2') == 'Phường Bến Thành')
        pg.click('.tl-tick[data-year="2023"]'); pg.click('#mapTools button[data-value="3d"]'); pg.wait_for_timeout(900)
        ok('address keeps the view (year, 3D, area)', all(k in pg.evaluate('location.hash') for k in ('nam=2023', 'kieu=3d', 'khu-vuc=26743')), pg.evaluate('location.hash'))
        link = pg.evaluate('location.href')
        c2, p2 = page(b); p2.goto(link); p2.wait_for_timeout(2500)
        ok('opening a shared link restores the view', p2.inner_text('.tl-year b') == '2023' and p2.get_attribute('#mapTools button[data-key=dims][data-value="3d"]', 'aria-pressed') == 'true', p2.evaluate('location.hash'))
        c2.close()
        pg.click('#mapTools button[data-value="2d"]')
        pg.click('#mapTools [data-act=palette]'); pg.wait_for_timeout(600)
        ok('colour-blind palette recolours the legend', '252, 255, 164' in pg.get_attribute('#legend .ramp', 'style') or '#fcffa4' in pg.get_attribute('#legend .ramp', 'style').lower(), pg.get_attribute('#legend .ramp', 'style'))
        pg.click('#mapTools [data-act=palette]'); pg.wait_for_timeout(300)
        pg.click('#mapTools [data-act=compare]'); pg.wait_for_timeout(2500)
        ok('compare shows the second map and two year labels', pg.is_visible('#map2') and pg.locator('.cmp-chip').count() == 2 and pg.evaluate("document.body.classList.contains('comparing')"))
        before = pg.evaluate("document.querySelector('.cmp-line').style.left")
        box = pg.locator('.cmp-knob').bounding_box(); pg.mouse.move(box['x'] + 20, box['y'] + 20); pg.mouse.down(); pg.mouse.move(box['x'] - 250, box['y'] + 20, steps=5); pg.mouse.up(); pg.wait_for_timeout(300)
        ok('compare divider can be dragged', pg.evaluate("document.querySelector('.cmp-line').style.left") != before)
        pg.click('#mapTools [data-act=compare]'); pg.wait_for_timeout(500)
        ok('compare turns off', pg.is_hidden('#map2'))
        c3, p3 = page(b, tour=True); p3.wait_for_timeout(1500)
        ok('first visit shows the guide, "Đã hiểu" closes it', p3.is_visible('dialog.tour'))
        p3.click('dialog.tour button:has-text("Đã hiểu")'); p3.wait_for_timeout(400)
        ok('guide closed', p3.locator('dialog.tour').count() == 0)
        c3.close()
        ok('legend explains limits (one capture per season)', 'xu thế khí hậu' in pg.text_content('#legend'))

        # pages
        for route, sel in [('thong-ke', '.chart-card'), ('bang-so-lieu', '.tbl tbody tr'), ('gioi-thieu', '.about-grid'), ('thu-nghiem', '.ft-task'), ('tai-khoan', '.acct-form')]:
            pg.goto(U + '#/' + route)
            try: pg.wait_for_selector(sel, timeout=15000); ok('page opens: ' + route, True)
            except Exception as e: ok('page opens: ' + route, False, e)
        ok('guest sees no admin link', 'Quản trị' not in pg.inner_text('#menu'))
        pg.goto(U + '#/gia-lap'); pg.wait_for_timeout(800)
        ok('old simulation route falls back to the map', pg.is_hidden('#pages'))

        # account: register → wrong password refused → delete own account
        email = f'test-{uuid.uuid4().hex[:10]}@example.test'
        pg.goto(U + '#/tai-khoan'); pg.wait_for_selector('.acct-form')
        pg.click('.acct-page .seg button:has-text("Đăng ký")')
        pg.fill('input[name=display_name]', 'Thử xóa'); pg.fill('input[name=email]', email)
        pg.fill('input[name=password]', auth_support.PASSWORD); pg.fill('input[name=confirm]', auth_support.PASSWORD)
        pg.click('.acct-form button[type=submit]'); pg.wait_for_timeout(1500)
        ok('register signs the user in', pg.locator('#menu .acct-btn').count() == 1)
        pg.goto(U + '#/tai-khoan'); pg.wait_for_selector('.danger-zone')
        pg.fill('.danger-zone input[name=password]', 'wrong-pass-0000'); pg.check('.danger-zone input[name=sure]'); pg.click('.danger-zone button[type=submit]'); pg.wait_for_timeout(900)
        ok('delete with a wrong password is refused', 'không đúng' in pg.inner_text('.danger-zone').lower())
        pg.fill('.danger-zone input[name=password]', auth_support.PASSWORD); pg.click('.danger-zone button[type=submit]'); pg.wait_for_timeout(1500)
        ok('user deletes own account and is signed out', pg.locator('#menu .acct-btn').count() == 0)
        ok('deleted account cannot sign in', pg.request.post(U + 'api/auth/login', data={'email': email, 'password': auth_support.PASSWORD}).status == 401)
        ctx.close()

        # ---------------- admin ----------------
        if admin_email:
            ctx, pg = page(b)
            pg.request.post(U + 'api/auth/login', data={'email': admin_email, 'password': auth_support.PASSWORD}); pg.reload()
            pg.wait_for_selector('#splash', state='detached', timeout=30000); pg.wait_for_timeout(800)
            ok('admin sees the admin link', 'Quản trị' in pg.inner_text('#menu'))
            pg.goto(U + 'admin.html'); pg.wait_for_timeout(1500)
            ok('admin page opens', pg.is_visible('#app') and 'Trang quản trị' in pg.inner_text('#app'))
            ctx.close()

        # ---------------- phone ----------------
        ctx, pg = page(b, mobile=True)
        ok('phone: no horizontal page scroll', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        ok('phone: ranking panel closed at start (map visible)', pg.evaluate("document.body.classList.contains('panel-closed')"))
        ok('phone: area card and timeline fit on screen', pg.evaluate("document.querySelector('#info').getBoundingClientRect().top > innerHeight * 0.55 && document.querySelector('#timeline').getBoundingClientRect().bottom <= innerHeight"))
        pg.screenshot(path=os.path.join(SHOTS, 'phone_map.png'))
        pg.click('#menu button.nav'); pg.wait_for_timeout(700)
        ok('phone: ranking sheet leaves the top of the map visible', pg.evaluate("document.querySelector('#panel').getBoundingClientRect().top > innerHeight * 0.4"))
        ctx.close()

        # ---------------- static demo (no server API) ----------------
        ctx, pg = page(b, block_api=True)
        ok('static demo: map, ranking and no account menu', pg.evaluate("document.body.classList.contains('is-static')") and pg.locator('.rank-item').count() == 167 and 'Đăng nhập' not in pg.inner_text('#menu'))
        ctx.close()
        b.close()
finally:
    if admin_id: auth_support.delete_user(admin_id)

print('Ảnh chụp:', SHOTS)
if errors: print('Lỗi trình duyệt:', json.dumps(errors[:10], ensure_ascii=False, indent=1))
passed = sum(1 for _, x in results if x)
print(f'{passed}/{len(results)} kiểm tra đạt')
sys.exit(0 if passed == len(results) and not errors else 1)
