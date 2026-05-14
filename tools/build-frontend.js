const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apps = path.join(root, 'apps-script');
const out = path.join(root, 'frontend');

const BRAND = 'TikTok CRM';
const COLOR = '#c8102e';
const LIFF_ID = '2010082378-Dyr6fRBQ';
const API_URL = 'https://script.google.com/macros/s/AKfycbyIffdlua-m7zW4iqfW81EbIVljPrW31I-OCGveSS1biImW-UpkywwslPf0LJAH2vKoWQ/exec';

const pages = {
  index: 'page-index.html',
  myid: 'page-myid.html',
  register: 'page-register.html',
  app: 'page-app.html',
  staff: 'page-staff.html',
  lead: 'page-lead.html',
  manager: 'page-manager.html',
  owner: 'page-owner.html',
  leave: 'page-leave.html',
  genmenu: 'page-genmenu.html',
};

const styles = fs.readFileSync(path.join(apps, '_styles.html'), 'utf8');
const shared = fs.readFileSync(path.join(apps, '_app.html'), 'utf8');

function jsonScriptValue(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function appScript(page) {
  const frontendBase =
    '<script>window.__CRM_FRONTEND_BASE = window.location.href.replace(/[^\\/]*$/, "");</script>\n';
  const appObject = [
    'const APP = {',
    `    brand: ${jsonScriptValue(BRAND)},`,
    `    liffId: ${jsonScriptValue(LIFF_ID)},`,
    `    apiUrl: ${jsonScriptValue(API_URL)},`,
    '    frontendBase: window.__CRM_FRONTEND_BASE || "",',
    `    page: ${jsonScriptValue(page)},`,
    '    params: Object.fromEntries(new URLSearchParams(window.location.search).entries()),',
    '  };',
  ].join('\n');
  // ใช้ replacement function — กัน `$$`/`$&` ใน source (เช่น U.$$) ถูกตีความเป็น special pattern
  return frontendBase + shared.replace(
    /const APP = \{[\s\S]*?\n  \};/,
    () => appObject
  );
}

function transform(page, source) {
  let html = source;
  // ใช้ replacement function ทุกที่ที่ replacement อาจมี `$` (เช่น U.$$, regex ใน JS)
  // เพื่อกัน String.replace ตีความ `$$`/`$&`/`$1` เป็น special pattern
  html = html.replace(/<base target="_top">/g, '');
  html = html.replace(/<\?= brand \?>/g, () => BRAND);
  html = html.replace(/<\?!= include\('_styles'\) \?>/g, () => styles);
  html = html.replace(/<\?!= include\('_app'\) \?>/g, () => appScript(page));
  html = html.replace(/<\?= apiUrl \?>\?page=([a-z]+)/g, (_, p) => `${p}.html`);
  html = html.replace(/<\?= apiUrl \?>/g, () => API_URL);
  html = html.replace(/<\?= color \?>/g, () => COLOR);
  html = html.replace(/<\?[\s\S]*?\?>/g, '');
  if (page === 'index') {
    html = html.replace('<body>', () => '<body>\n' + indexRouterScript());
  }
  return html;
}

function indexRouterScript() {
  return `<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
<script>
(function () {
  var params = new URLSearchParams(window.location.search);
  var rawState = params.get('liff.state');
  if (!rawState) return; // ไม่มี liff.state → แสดง landing page ปกติ

  var LIFF_ID = ${JSON.stringify(LIFF_ID)};
  var pageMap = {
    id: 'myid', myid: 'myid',
    reg: 'register', register: 'register',
    app: 'app',
    staff: 'staff', lead: 'lead', manager: 'manager', owner: 'owner',
    leave: 'leave', genmenu: 'genmenu', menu: 'genmenu'
  };

  function routeNow() {
    var state = String(rawState).replace(/^\\/+/, '');
    var path = state.split('?')[0].replace(/\\.html$/i, '').toLowerCase();
    var target = pageMap[path];
    if (!target) return;
    var base = window.location.href.replace(/[^\\/]*$/, '').split('?')[0];
    // ส่ง query ทั้งหมดต่อ (ยกเว้น liff.state) — รวม login params ที่ LIFF ใส่มา
    var fwd = new URLSearchParams(window.location.search);
    fwd.delete('liff.state');
    var inner = state.indexOf('?') >= 0 ? state.slice(state.indexOf('?') + 1) : '';
    if (inner) new URLSearchParams(inner).forEach(function (v, k) { fwd.set(k, v); });
    var qs = fwd.toString();
    window.location.replace(base + target + '.html' + (qs ? '?' + qs : ''));
  }

  // liff.init() ก่อน เพื่อให้ LIFF SDK resolve login state + เก็บไว้
  // แล้วค่อย route — กัน loop (app.html จะเห็น logged in แล้ว ไม่ liff.login ซ้ำ)
  if (typeof liff === 'undefined') { routeNow(); return; }
  liff.init({ liffId: LIFF_ID }).then(routeNow).catch(routeNow);
}());
</script>`;
}

if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });

Object.entries(pages).forEach(([page, file]) => {
  const source = fs.readFileSync(path.join(apps, file), 'utf8');
  const html = transform(page, source);
  const name = page === 'index' ? 'index.html' : `${page}.html`;
  fs.writeFileSync(path.join(out, name), html);
});

fs.writeFileSync(path.join(out, 'README.md'), [
  '# TikTok CRM Frontend',
  '',
  'Static LIFF frontend for GitHub Pages.',
  '',
  `LIFF ID: \`${LIFF_ID}\``,
  `Apps Script API: \`${API_URL}\``,
  '',
  'LINE Developers LIFF Endpoint URL should be your GitHub Pages root URL, for example:',
  '',
  '`https://<github-user>.github.io/<repo>/`',
  '',
].join('\n'));

console.log(`Generated ${Object.keys(pages).length} frontend pages in ${out}`);
