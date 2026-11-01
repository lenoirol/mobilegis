"""Browser end-to-end smoke test for the MobileGIS UI (real Chrome via Playwright).

Needs: a running server, `pip install playwright` (uses the installed Google Chrome, no browser download),
and the project virtual environment (creates and deletes its own throw-away admin account in PostgreSQL).
    MOBILEGIS_URL=http://127.0.0.1:5379 .venv/bin/python tests/e2e_ui.py [screenshot_dir]
Not collected by `unittest discover` (the name does not start with test_). Demo-point CRUD adds a few audit_log rows
(that table is append-only by design); nothing else is left behind.
"""
import os, sys, re, json, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / 'tests'))
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit('Cần cài Playwright: .venv/bin/pip install playwright')
import auth_support
S=sys.argv[1] if len(sys.argv)>1 else tempfile.mkdtemp(prefix='mobilegis_e2e_');U=os.environ.get('MOBILEGIS_URL','http://127.0.0.1:5379');errors=[];results=[]
ADMIN_EMAIL,ADMIN_ID=auth_support.create_user('admin')
def ok(name,cond,detail=''):
    results.append((name,bool(cond),detail));print(('PASS ' if cond else 'FAIL ')+name+(' · '+str(detail) if detail and not cond else ''))
def boot(b,mob=False,perm=False):
    c=b.new_context(viewport={'width':390,'height':844} if mob else {'width':1360,'height':820},device_scale_factor=2 if mob else 1,is_mobile=mob,has_touch=mob,permissions=['clipboard-read','clipboard-write'] if perm else [],accept_downloads=True)
    pg=c.new_page()
    pg.on('console',lambda m:errors.append((m.type,m.text[:200])) if m.type=='error' and 'Failed to load resource' not in m.text else None)
    pg.on('pageerror',lambda e:errors.append(('pageerror',str(e)[:300])))
    return c,pg
def wait_app(pg):
    pg.wait_for_selector('#splash',state='detached',timeout=25000);pg.wait_for_selector('#map,.page',timeout=15000);pg.wait_for_timeout(800)
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome',headless=True)
    # ================= desktop guest =================
    c,pg=boot(b,perm=True);pg.goto(U+'/');wait_app(pg)
    ok('landing page is the map',pg.is_visible('#map') and pg.title().startswith('Bản đồ'),pg.title())
    navs=' | '.join(x.strip() for x in pg.locator('#nav a:visible').all_inner_texts());ok('guest nav: Bản đồ, Chuyên gia, Giới thiệu only',all(x in navs for x in ('Bản đồ','Chuyên gia','Giới thiệu')) and 'Giả lập' not in navs and 'Trang chủ' not in navs,navs)
    ok('guest nav hides simulation',not pg.is_visible('#nav a[data-route=gia-lap]'))
    pg.goto(U+'/#/gia-lap');pg.wait_for_timeout(1500);ok('guest cannot open simulation by URL','gia-lap' not in pg.url and pg.is_visible('#map'),pg.url)
    pg.click('#nav a[data-route=chuyen-gia]');pg.wait_for_selector('.expert-card');ok('experts hub: two cards for guests',pg.locator('.expert-card:visible').count()==2)
    pg.click('.expert-card >> nth=0');pg.wait_for_selector('.tbl tbody tr');ok('sub-page has a back button to Chuyên gia',pg.is_visible('#view-bang-so-lieu .back-link'));pg.click('#view-bang-so-lieu .back-link');pg.wait_for_selector('.expert-card:visible');ok('back button returns to the experts hub','chuyen-gia' in pg.url,pg.url);pg.click('.expert-card >> nth=0');pg.wait_for_selector('.tbl tbody tr');ok('experts → table opens, tab stays on Chuyên gia',pg.get_attribute('#nav a[data-route=chuyen-gia]','aria-current')=='page')
    pg.goto(U+'/#/ban-do');pg.wait_for_selector('#map',timeout=10000);pg.wait_for_timeout(1000)
    ok('splash removed, map view visible',pg.is_visible('#map'))
    ok('map: advanced source switch hidden for guests',not pg.is_visible('.dock-adv'))
    ok('title',pg.title().startswith('Bản đồ'),pg.title())
    ok('KPI shows 158/167',re.search(r'158/167',pg.inner_text('.map-kpis')) is not None,pg.inner_text('.map-kpis'))
    ok('default selected area Bến Thành',pg.inner_text('.detail-name')=='Phường Bến Thành')
    pg.click('.idx-card[data-index=ndvi]');pg.wait_for_timeout(600)
    ok('NDVI selected → legend + URL',('độ xanh' in pg.inner_text('.legend').lower()) and 'chi-so=ndvi' in pg.url,pg.url)
    pg.click('.idx-card[data-index=tvdi]');pg.wait_for_timeout(400);ok('TVDI flagged experimental in legend','thử nghiệm' in pg.inner_text('.legend').lower())
    pg.click('.idx-card[data-index=lst]')
    pg.fill('.dock input[type=range]','2022');pg.dispatch_event('.dock input[type=range]','input');pg.wait_for_timeout(500)
    ok('year slider → KPI year 2022',pg.inner_text('.map-kpis .kpi:first-child b')=='2022',pg.inner_text('.map-kpis'))
    pg.fill('.dock input[type=range]','2025');pg.dispatch_event('.dock input[type=range]','input')
    # display modes
    pg.click('.dock .seg button:has-text("Xã/phường")');pg.wait_for_timeout(600);ok('zones mode hint',  'dưới 50%' in pg.inner_text('.dock'))
    pg.click('.dock .seg button:has-text("Thay đổi")');pg.wait_for_timeout(700);ok('change mode: year locked + legend',pg.is_disabled('.dock input[type=range]') and 'Thay đổi' in pg.inner_text('.legend'))
    pg.click('.dock .seg button:has-text("Độ tin cậy")');pg.wait_for_timeout(500);ok('coverage legend','Độ phủ mẫu' in pg.inner_text('.legend'))
    pg.click('.dock .seg button:has-text("Chi tiết")');pg.wait_for_timeout(500)
    # compare swipe + landcover
    pg.locator('.dock label.check:has-text("So sánh")').click();pg.wait_for_timeout(800);ok('compare → swipe visible',pg.is_visible('.swipe-line'))
    box=pg.locator('.swipe-line').bounding_box();pg.mouse.move(box['x']+2,box['y']+300);pg.mouse.down();pg.mouse.move(box['x']+200,box['y']+300,steps=6);pg.mouse.up();pg.wait_for_timeout(300)
    ok('swipe dragged',float(pg.evaluate("getComputedStyle(document.querySelector('.swipe')).getPropertyValue('--x')").replace('%',''))>55)
    pg.locator('.dock label.check:has-text("So sánh")').click()
    pg.locator('.dock label.check:has-text("Lớp phủ đất")').click();pg.wait_for_timeout(800);ok('landcover legend','Lớp phủ đất' in pg.inner_text('.legend'))
    pg.locator('.dock label.check:has-text("Lớp phủ đất")').click();pg.wait_for_timeout(400)
    # search
    pg.fill('.dock input[type=search]','phu loi');pg.wait_for_selector('.dock-results .res');pg.click('.dock-results .res >> nth=0');pg.wait_for_timeout(1200)
    ok('search picks Phú Lợi',pg.inner_text('.detail-name')=='Phường Phú Lợi',pg.inner_text('.detail-name'))
    ok('Phú Lợi limited sample → warning tag','tin cậy thấp' in pg.inner_text('.metrics').lower(),pg.inner_text('.metrics'))
    pg.screenshot(path=S+'/e_d_map_philoi.png')
    # probe click on map
    pg.mouse.click(700,420);pg.wait_for_timeout(1500);ok('probe row shown',pg.is_visible('.probe'),pg.inner_text('.detail-inner')[:80])
    # share
    pg.click('button[aria-label="Sao chép liên kết"]');pg.wait_for_timeout(500);clip=pg.evaluate("navigator.clipboard.readText()");ok('share copies deep link','#/ban-do?' in clip and 'khu-vuc=' in clip,clip)
    # play
    pg.click('.year-row .btn');pg.wait_for_timeout(2300);ok('play advances year or wraps',pg.inner_text('.year-num') in ('2020','2021','2022','2023','2024','2025'));pg.click('.year-row .btn')
    # deep link
    pg.goto(U+'/#/ban-do?chi-so=tvdi&nam=2023&khu-vuc=27664&che-do=zones');pg.reload();wait_app(pg);pg.wait_for_timeout(1200)
    ok('deep link restores state',pg.inner_text('.detail-name')=='Xã Cần Giờ' and pg.inner_text('.year-num')=='2023',pg.inner_text('.detail-name')+pg.inner_text('.year-num'))
    ok('tvdi tile shows a dryness level',pg.inner_text('button.metric[data-index=tvdi]').lower().find('mức:')>=0,pg.inner_text('button.metric[data-index=tvdi]'))
    ok('tvdi legend lists 5 dryness levels',pg.locator('.legend .tvdi-classes span').count()==5)
    pg.goto(U+'/#/ban-do?khu-vuc=25780&nam=2025&chi-so=lst');pg.reload();wait_app(pg);pg.wait_for_selector('.alert-tvdi:not([hidden])',timeout=15000);ok('TVDI alert shows for a very dry area','Cảnh báo thử nghiệm' in pg.inner_text('.alert-tvdi') and 'không phải cảnh báo hạn chính thức' in pg.inner_text('.alert-tvdi'))
    pg.goto(U+'/#/ban-do?khu-vuc=25768&nam=2025&chi-so=lst');pg.reload();wait_app(pg);pg.wait_for_timeout(1200);ok('no TVDI alert for a humid area',not pg.is_visible('.alert-tvdi'))
    c.grant_permissions(['geolocation']);c.set_geolocation({'latitude':10.7725,'longitude':106.6980});pg.click('.fabs [aria-label="Vị trí của tôi"]');pg.wait_for_timeout(2500)
    ok('GPS picks the commune containing the position',pg.inner_text('.detail-name')!='' and 'Bến' in pg.inner_text('.detail-name'),pg.inner_text('.detail-name'))
    # ============ table ============
    pg.goto(U+'/#/bang-so-lieu');pg.wait_for_selector('.tbl tbody tr');pg.wait_for_timeout(600)
    ok('table: 25 rows first page',pg.locator('.tbl tbody tr').count()==25)
    pg.fill('.table-page input[type=search]','Bến Thành');pg.wait_for_timeout(500);ok('table search filters',pg.locator('.tbl tbody tr').count()<=3,pg.locator('.tbl tbody tr').count())
    pg.fill('.table-page input[type=search]','');pg.wait_for_timeout(400)
    pg.click('.th-sort >> nth=2');pg.wait_for_timeout(500);first=pg.locator('.tbl tbody tr:first-child td.val').first.inner_text();ok('table sort works',first not in ('',),first)
    pg.click('.pager .btn >> nth=1');pg.wait_for_timeout(300);ok('pagination next','Trang 2/' in pg.inner_text('.pager'))
    with pg.expect_download() as d: pg.click('text=Xuất bảng đang xem')
    ok('CSV export downloads',d.value.suggested_filename.endswith('.csv'))
    pg.click('.table-page .seg button:has-text("Bảng tổng")');pg.wait_for_selector('.sum');pg.wait_for_timeout(1500);ok('summary table 18 rows',pg.locator('.sum tbody tr').count()==18)
    pg.screenshot(path=S+'/e_d_summary.png',full_page=True)
    ok('table: guest does not see practice/CSV data sets',not pg.is_visible('.table-page .seg button:has-text("Điểm thực hành")') and not pg.is_visible('.table-page details.adv'))
    # ============ stats ============
    pg.goto(U+'/#/thong-ke');pg.wait_for_selector('.kpi-card');pg.wait_for_timeout(2000)
    v1=pg.inner_text('.kpi-row .kpi-card:nth-child(2) b')
    pg.click('.stats-page .filters .seg >> nth=0 >> button:has-text("Độ xanh")');pg.wait_for_timeout(2500);v2=pg.inner_text('.kpi-row .kpi-card:nth-child(2) b')
    ok('stats KPI changes with index',v1!=v2,(v1,v2))
    pg.locator('.pin-chip').first.click();pg.wait_for_timeout(300);n1=pg.locator('.pin-chip').count();ok('unpin ward',n1==2,n1)
    ok('ranking has 5 rows',pg.locator('.rank-row').count()==5)
    ok('scatter drawn',pg.locator('.ch-pt').count()>50,pg.locator('.ch-pt').count())
    pg.hover('.ch-pt >> nth=5');pg.wait_for_timeout(200);ok('chart tooltip appears',pg.is_visible('.ch-tip'))
    pg.wait_for_selector('.alert-row',timeout=8000);ok('TVDI screening lists units',pg.locator('.alert-row').count()>3)
    ok('stats: evidence appendix hidden for guests',not pg.is_visible('.appendix'))
    pg.click('.rank-row .btn >> nth=0');pg.wait_for_selector('.dock-inner');pg.wait_for_timeout(1000);ok('ranking → map deep link',pg.url.find('khu-vuc=')>0)
    # ============ scenario (guest) ============
    pg.click('#nav a[data-route=du-lieu]');pg.wait_for_selector('.method');pg.wait_for_timeout(800)
    about=pg.inner_text('.about-page').lower();ok('about page has no database jargon',not any(w in about for w in ('postgres','postgis','schema','rest api','migration','pg3')),about[:80])
    ok('about page: tidy footer',pg.is_visible('.about-page .foot') and 'học tập' not in about)
    ok('no console errors (guest desktop)',not errors,errors[:3]);c.close()
    # ================= admin flows =================
    errors.clear();c,pg=boot(b);pg.goto(U+'/login.html')
    pg.fill('#panelLogin [name=email]',ADMIN_EMAIL);pg.fill('#panelLogin [name=password]',auth_support.PASSWORD);pg.click('#panelLogin .auth-submit');pg.wait_for_url(U+'/admin.html',timeout=10000);pg.wait_for_selector('.stat',timeout=10000)
    ok('admin lands on admin page',pg.is_visible('.stat-row'));pg.screenshot(path=S+'/e_admin.png')
    pg.click('.admin-tabs button:has-text("Tài khoản")');pg.wait_for_selector('#userRows tr');ok('users table',pg.locator('#userRows tr').count()>=1)
    pg.goto(U+'/#/gia-lap');wait_app(pg);pg.wait_for_selector('.scenario-form',timeout=8000);pg.goto(U+'/#/chuyen-gia');pg.wait_for_selector('.expert-card');ok('admin sees the simulation card in the experts hub',pg.locator('.expert-card:visible').count()==3);pg.goto(U+'/#/gia-lap');pg.wait_for_selector('.scenario-form',timeout=8000);ok('admin sees scenario form',pg.is_visible('.scenario-form'))
    ok('admin chip in header',pg.is_visible('.acct-btn'))
    pg.goto(U+'/#/ban-do');wait_app(pg);pg.click('.dock-adv summary');pg.click('.dock-adv .seg button:has-text("GEE · bản gốc")');pg.wait_for_timeout(2500)
    ok('admin: switch to original GEE source ok','bản gốc' in pg.inner_text('.dock-adv').lower())
    pg.click('.dock-adv .seg button:has-text("GEE · đã bổ sung 2025")');pg.wait_for_timeout(2000)
    pg.goto(U+'/#/thong-ke');pg.wait_for_selector('.appendix summary',timeout=20000);pg.click('.appendix summary');pg.wait_for_selector('.evidence',timeout=8000);ok('admin: appendix gallery',pg.locator('.ev-card').count()==5)
    pg.goto(U+'/admin.html');pg.wait_for_selector('.admin-tabs');pg.click('.admin-tabs button:has-text("Dữ liệu")');pg.wait_for_selector('#coverageRows tr');ok('admin data tab: coverage by year for 6 years',pg.locator('#coverageRows tr').count()==6);ok('admin data tab lists low-coverage areas',pg.locator('#lowRows tr').count()>=1 and 'Phú Lợi' in pg.inner_text('#lowRows'));pg.click('.tech summary');ok('admin: technical details are tucked into the data tab','PostgreSQL' in pg.inner_text('#tab-data'))
    # demo CRUD
    pg.goto(U+'/#/bang-so-lieu');pg.wait_for_selector('.table-page .tbl',timeout=20000);pg.click('.table-page .seg button:has-text("Điểm thực hành")');pg.wait_for_timeout(900)
    pg.click('text=Thêm điểm');pg.wait_for_selector('dialog[open]')
    vals={'name':'E2E_DIEM','lat':'10.8','lon':'106.7','year':'2025','lst':'35','ndvi':'0.4','tvdi':'0.5'}
    for i,(k,v) in enumerate(vals.items()): pg.locator('dialog input').nth(i).fill(v)
    pg.click('dialog button[type=submit]');pg.wait_for_timeout(1200);ok('demo point added',pg.is_visible('text=E2E_DIEM'))
    pg.once('dialog',lambda d:d.accept());pg.locator('tr:has-text("E2E_DIEM") >> text=Xóa').click();pg.wait_for_timeout(1200);ok('demo point deleted',not pg.is_visible('text=E2E_DIEM'))
    ok('no console errors (admin)',not errors,errors[:3]);c.close()
    import database as _db
    CUST_EMAIL,CUST_ID=auth_support.create_user('customer')
    # admin sets a notice, creates an account and writes an area note
    errors.clear();c,pg=boot(b);pg.goto(U+'/login.html')
    pg.fill('#panelLogin [name=email]',ADMIN_EMAIL);pg.fill('#panelLogin [name=password]',auth_support.PASSWORD);pg.click('#panelLogin .auth-submit');pg.wait_for_url(U+'/admin.html',timeout=10000);pg.wait_for_selector('.stat',timeout=10000)
    pg.click('.admin-tabs button:has-text("Nội dung")');pg.fill('#noticeForm textarea','Bảo trì thử nghiệm E2E');pg.click('#noticeForm button');pg.wait_for_timeout(900)
    pg.click('.admin-tabs button:has-text("Tài khoản")');pg.click('.create-user summary');NEWMAIL=f'e2e-{CUST_ID}@example.test'
    pg.fill('#createUser [name=email]',NEWMAIL);pg.fill('#createUser [name=display_name]','Tạo bởi admin');pg.fill('#createUser [name=password]','Mat-khau-12345');pg.click('#createUser button[type=submit]');pg.wait_for_timeout(1200)
    ok('admin: users tab also holds password-reset requests',pg.is_visible('#resetRows'));ok('admin created an account',NEWMAIL in pg.inner_text('#userRows'))
    pg.goto(U+'/admin.html');pg.wait_for_selector('.admin-tabs');pg.click('.admin-tabs button:has-text("Nội dung")');pg.select_option('#noteForm [name=code]','26743');pg.fill('#noteForm [name=text]','E2E ghi chú khu trung tâm');pg.click('#noteForm button[type=submit]');pg.wait_for_timeout(1000)
    pg.goto(U+'/#/ban-do');pg.wait_for_selector('#notice:not([hidden])',timeout=15000);ok('notice banner shows for visitors','Bảo trì thử nghiệm E2E' in pg.inner_text('#notice'))
    pg.goto(U+'/#/ban-do?khu-vuc=26743&nam=2025');pg.wait_for_selector('.detail-name',timeout=20000);pg.wait_for_timeout(1500);ok('map detail shows the admin note','E2E ghi chú' in pg.inner_text('.detail-inner'),pg.inner_text('.detail-inner')[:80])
    with _db.connect() as cn:
        cn.execute("DELETE FROM mobilegis.site_settings WHERE key='notice'");cn.execute("DELETE FROM mobilegis.area_notes WHERE note LIKE 'E2E%'");cn.execute("DELETE FROM mobilegis.feedback WHERE message LIKE %s",('E2E góp ý %',));cn.execute('DELETE FROM mobilegis.app_users WHERE email=%s',(NEWMAIL,))
    auth_support.delete_user(CUST_ID)
    ok('no console errors (admin 2)',not errors,errors[:3]);c.close()
    # ================= mobile =================
    errors.clear();c,pg=boot(b,mob=True);pg.goto(U+'/');wait_app(pg);pg.wait_for_selector('.metric',timeout=10000);pg.wait_for_timeout(1000)
    ok('mobile: tab bar has 3 tabs',pg.locator('#nav a:visible').count()==3)
    ok('mobile: tab bar at bottom',pg.evaluate("document.querySelector('#nav').getBoundingClientRect().bottom")>=840)
    ok('mobile: no horizontal overflow',not pg.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth"))
    pg.screenshot(path=S+'/e_m_map.png')
    pg.tap('button.metric[data-index=ndvi]');pg.wait_for_timeout(700)
    ok('mobile: tapping a value tile switches the map layer','chi-so=ndvi' in pg.url,pg.url)
    ok('mobile: no tabs and no duplicate index cards',not pg.is_visible('.sheet-tab') and not pg.is_visible('.idx-grid'))
    ok('mobile: tab bar labels stay clear of the phone gesture bar',pg.evaluate("innerHeight-document.querySelector('#nav a').getBoundingClientRect().bottom")>=14)
    ok('mobile: sheet has an arrow button',pg.get_attribute('.sheet-handle','aria-label')=='Mở rộng bảng thông tin')
    pg.click('.sheet-handle');pg.wait_for_timeout(800);ok('sheet opens',pg.get_attribute('.map-shell','data-snap')=='open' and pg.get_attribute('.sheet-handle','aria-label')=='Thu gọn bảng thông tin');pg.screenshot(path=S+'/e_m_sheet.png')
    ok('mobile: one panel shows year slider and search',pg.is_visible('.g-year') and pg.is_visible('.g-search'))
    ok('mobile: map options are collapsed by default',not pg.locator('.dock-more').evaluate('e=>e.open'))
    pg.click('.dock-more > summary');pg.wait_for_timeout(500);ok('mobile: options expand on tap',pg.is_visible('.dock-more .seg') and pg.locator('.dock-more').evaluate('e=>e.open'));pg.screenshot(path=S+'/e_m_dock.png')
    pg.click('.sheet-handle');pg.wait_for_timeout(700)
    for route in ['chuyen-gia','bang-so-lieu','thong-ke','du-lieu']:
        pg.goto(f'{U}/#/{route}');pg.wait_for_timeout(2500)
        ok(f'mobile {route}: no overflow',not pg.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth"));pg.screenshot(path=f'{S}/e_m_{route}.png')
    ok('no console errors (mobile)',not errors,errors[:3]);c.close()
    b.close()
auth_support.delete_user(ADMIN_ID)
bad=[r for r in results if not r[1]];print(f'\n{len(results)-len(bad)}/{len(results)} checks passed')
if bad:print('FAILED:',[r[0] for r in bad])

sys.exit(1 if bad else 0)
