// Chụp toàn bộ giao diện (chế độ sáng, dữ liệu demo cổng 5181 -> API 5099) cho báo cáo
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const OUT = `${__dirname}/shots`;
const BASE = 'http://localhost:5181';
const data = JSON.parse(fs.readFileSync(`${__dirname}/demo.json`, 'utf8'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LIGHT = { mode: 'light', bg: 'default', v: 2 };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    userDataDir: `${__dirname}/chrome-${Date.now()}`,
    defaultViewport: { width: 1440, height: 860 },
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const clickText = (p, sel, text) => p.evaluate((s, t) => { const e = [...document.querySelectorAll(s)].find((x) => x.textContent.includes(t)); if (e) e.click(); return !!e; }, sel, text);
  const shot = async (p, name) => { await p.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
  const login = async (p, token, theme = LIGHT) => {
    await p.goto(`${BASE}/login?next=%2F`, { waitUntil: 'domcontentloaded' });
    await p.evaluate((t, th) => { localStorage.setItem('token', t); localStorage.setItem('taskflow-theme', JSON.stringify(th)); }, token, theme);
  };
  const go = async (p, path, ms = 2000, keepUrgent = false) => {
    await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await wait(ms);
    if (!keepUrgent) { await clickText(p, '.urgent-modal button', 'Để sau'); await wait(400); }
  };

  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));

  // Chưa đăng nhập: giới thiệu, đăng nhập, đăng ký, trang link mời
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await wait(1800); await shot(page, 'intro-slide');
  await page.click('.intro-skip'); await wait(1300); await shot(page, 'intro-final');
  await clickText(page, '.intro-btn', 'Đăng nhập'); await wait(900); await shot(page, 'login');
  await go(page, '/register', 1500); await shot(page, 'register');
  await go(page, `/join/${data.code}`, 1500); await shot(page, 'join');

  await login(page, data.an);
  await go(page, '/', 2600, true); await shot(page, 'urgent');
  await clickText(page, '.urgent-modal button', 'Để sau'); await wait(600);
  await shot(page, 'dashboard');
  await clickText(page, '.bell > button', 'Thông báo'); await wait(800); await shot(page, 'notifications');

  await go(page, '/projects?nhom=mine'); await shot(page, 'projects-mine');
  await go(page, '/projects?nhom=joined'); await shot(page, 'projects-joined');
  await go(page, `/projects/${data.p1}`); await shot(page, 'board');
  await go(page, `/projects/${data.p1}?panel=new`, 1800); await shot(page, 'new-task');
  await go(page, `/projects/${data.p1}?panel=list`); await shot(page, 'list');
  await go(page, `/projects/${data.p1}?panel=calendar`); await shot(page, 'calendar');
  await go(page, `/projects/${data.p1}?panel=overview`); await shot(page, 'overview-people');
  await clickText(page, '.fullscreen-body .view-switch button', 'từng dự án'); await wait(1000); await shot(page, 'overview-projects');
  await clickText(page, '.fullscreen-body .view-switch button', 'tuần / tháng'); await wait(1000); await shot(page, 'overview-timeline');
  await clickText(page, '.fullscreen-body .view-switch button', 'Báo cáo tuần'); await wait(1200); await shot(page, 'weekly-report');
  await go(page, `/projects/${data.p1}?panel=settings`); await shot(page, 'settings-members');
  await clickText(page, '.settings-tabs button', 'Mời thành viên'); await wait(1000); await shot(page, 'settings-invite');
  await go(page, `/projects/${data.p1}?panel=manage`, 1500); await shot(page, 'manage');
  await go(page, `/projects/${data.p1}?task=${data.t6}`); await shot(page, 'task-review');
  await go(page, `/projects/${data.p1}?task=${data.t4}`); await shot(page, 'task-detail');
  await page.click('.dm-icon'); await wait(1500); await shot(page, 'task-dm');
  await go(page, `/projects/${data.p1}`);
  await page.click('.chat-btn'); await wait(1500); await shot(page, 'chat');
  // An là thành viên ở dự án 2: tự mở được phòng gọi
  await go(page, `/projects/${data.p2}`);
  await page.click('.call-btn'); await wait(1200); await shot(page, 'member-call');
  await go(page, '/appearance', 1500); await shot(page, 'appearance');
  await go(page, '/profile', 1500); await shot(page, 'profile');
  await go(page, '/overview', 2000); await shot(page, 'overview-global');
  // Ảnh nền: chữ hiển thị thẳng trên ảnh
  await login(page, data.an, { mode: 'light', bg: 'bg1', v: 2 });
  await go(page, '/', 2600); await shot(page, 'home-image');
  await login(page, data.an, { mode: 'dark', bg: 'bg1', v: 2 });
  await go(page, '/', 2600); await shot(page, 'home-image-dark');
  await login(page, data.an);

  // Điện thoại
  const phone = await browser.newPage();
  await phone.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await go(phone, '/', 2600);
  await phone.screenshot({ path: `${OUT}/mobile-home.png` }); console.log('shot mobile-home');
  await phone.click('.app-header .icon-btn'); await wait(800);
  await phone.screenshot({ path: `${OUT}/mobile-menu.png` }); console.log('shot mobile-menu');
  await go(phone, `/projects/${data.p1}`, 2200);
  await phone.screenshot({ path: `${OUT}/mobile-board.png` }); console.log('shot mobile-board');

  // Cuộc gọi nhóm (2 người, camera giả)
  const join = async (p) => {
    await p.goto(`${BASE}/projects/${data.p1}/call?code=${data.room.code}`, { waitUntil: 'domcontentloaded' });
    await wait(2200);
    await clickText(p, '.urgent-modal button', 'Để sau'); await wait(300);
    await p.type('.call-panel input[type=password]', data.room.password);
    await clickText(p, '.call-panel button', 'Vào phòng');
    await wait(3500);
  };
  await join(page);
  const ctx2 = await browser.createBrowserContext();
  const page2 = await ctx2.newPage();
  await page2.setViewport({ width: 1200, height: 800 });
  await login(page2, data.binh);
  await join(page2);
  await wait(3000);
  await clickText(page2, '.cbtn', 'Giơ tay'); await wait(500);
  await clickText(page2, '.cbtn', 'Tin nhắn'); await wait(500);
  await page2.type('.call-chat-form input', 'Em đã nộp sơ đồ use case, anh xem giúp em nhé');
  await page2.keyboard.press('Enter'); await wait(800);
  await clickText(page, '.cbtn', 'Tin nhắn'); await wait(1500);
  await shot(page, 'call');

  await browser.close();
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
