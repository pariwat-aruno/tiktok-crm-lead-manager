# BACKLOG — TikTok CRM Lead Manager

> สถานะการ deploy + งานค้าง (อัปเดต 2026-05-14)

## Reference (ข้อมูลระบบ)

| รายการ | ค่า |
|---|---|
| Project root | `~/Downloads/tiktok-crm-lead-manager/` |
| Apps Script Editor | https://script.google.com/d/1smslW-lmyaZ-TEJ0pTfu7xIPT9aEAHtYx-Bs3BndYQDFnQKrWFZQZxUe/edit |
| Deployment ID | `AKfycbyIffdlua-m7zW4iqfW81EbIVljPrW31I-OCGveSS1biImW-UpkywwslPf0LJAH2vKoWQ` |
| Web App URL | `https://script.google.com/macros/s/<deploymentId>/exec` |
| Sheet | https://docs.google.com/spreadsheets/d/1jsU2hFTmDIZfx9CG6e1dmYU7O15sOVKT4IDkGwrn724/edit |
| LIFF ID | `2010082378-Dyr6fRBQ` |
| Owner LINE ID | `Ub47d6b519be013dbe6e83c4fbd079c56` (พี่ปุ้ย) |
| GitHub repo | https://github.com/pariwat-aruno/tiktok-crm-lead-manager |
| GitHub Pages | https://pariwat-aruno.github.io/tiktok-crm-lead-manager/ (`gh-pages` branch) |
| Apps Script deploy | `@16` |

### Deploy command (ทุกครั้งที่แก้ apps-script/)
```bash
cd ~/Downloads/tiktok-crm-lead-manager
~/.npm-global/bin/clasp push -f
~/.npm-global/bin/clasp deploy --deploymentId AKfycbyIffdlua-m7zW4iqfW81EbIVljPrW31I-OCGveSS1biImW-UpkywwslPf0LJAH2vKoWQ
```

### Build frontend (ทุกครั้งที่แก้ HTML ใน apps-script/)
```bash
node tools/build-frontend.js   # generate frontend/*.html จาก apps-script/*.html
```

## สถาปัตยกรรม (สรุป)

ระบบรองรับ **2 mode** ในโค้ดเดียวกัน:
1. **Apps Script-only** — LIFF Endpoint = Apps Script `/exec?page=app`, `apiCall` ใช้ `google.script.run.apiRoute()` (เลี่ยง POST redirect)
2. **GitHub Pages** — LIFF Endpoint = GitHub Pages root, `frontend/*.html` เป็น static, API ยิง Apps Script `/exec` ผ่าน `fetch`

ตัว `_app.html` ตรวจ `APP.frontendBase`: ถ้ามี → mode 2, ถ้าไม่มี → mode 1

## ✅ เสร็จแล้ว

- Code 37 ไฟล์ — audit + แก้ bug 12 จุด (mergeCustomers, dailyReport.revenue, role validation, notify dedup, product assign UI, search customers tab, manager ban tab, leave links, prompt→modal, Thai error mapping, date min)
- Apps Script project + deploy `@16`
- ติดตั้ง clasp ที่ `~/.npm-global/bin/clasp`
- ตั้ง LIFF_ID + LINE_CHANNEL_ACCESS_TOKEN
- เพิ่ม owner (พี่ปุ้ย)
- Rich menu image (PIL + Sarabun font) ฝัง base64 ใน `RichMenuImage.gs` → `setupRichMenuPrebuilt()`
- **แก้ปัญหาหน้าขาว/liff.init ค้าง** — เปลี่ยน `apiCall` มาใช้ `google.script.run` (Apps Script-only mode) + `_manualIdentity()` fallback ถ้า LIFF ไม่พร้อม
- เตรียม GitHub Pages: `frontend/` + `tools/build-frontend.js` + `docs/github-pages-frontend.md`
- **แก้ build-frontend.js bug** (2026-05-14) — replacement string ที่มี `$$` (จาก `U.$$`) ถูก String.replace ตีความเป็น literal `$` → `U.$$` กลายเป็น `U.$` ใน `frontend/*.html` → 5 หน้า crash. แก้: ใช้ replacement function ทุก `.replace()` + re-build แล้ว

## 🟡 ต้องทดสอบจริง — ยังไม่ฟันธง

1. **`frontend/` (GitHub Pages) mode — apiCall จะใช้ได้ไหม**
   - GitHub Pages ไม่มี `google.script.run` → `apiCall` ตก fallback `fetch POST` ไป Apps Script `/exec`
   - POST → 302 redirect → `script.googleusercontent.com` — ยังไม่ชัดว่า follow redirect แล้วได้ JSON หรือ 405
   - `curl -L` POST เคยได้ JSON ok แต่ webhook POST เคยได้ 405 — ต้องทดสอบ `fetch` จาก browser จริง
   - ถ้า 405 → `frontend/` mode apiCall พังทั้งหมด → ต้องใช้ Apps Script-only mode เท่านั้น
2. **`google.script.run` + base64 ใหญ่** — `registerUser` (selfie+idcard) และ `setupRichMenuFromBase64` ส่ง base64 ~100-300KB — ควรทดสอบ payload limit
3. **Apps Script-only mode — liff.init ใน LINE webview** — ยังไม่ confirm ว่า `liff.init()` ทำงานเมื่อ endpoint = Apps Script `/exec` (domain redirect). ถ้าไม่ → ระบบ fallback `_manualIdentity()` (กรอก LINE User ID เอง) — ใช้งานได้แต่ UX ด้อยกว่า

## 🟢 เก็บกวาด / ตัดสินใจ

- **เลือก mode หลัก** — Apps Script-only หรือ GitHub Pages — ตอนนี้มี 2 mode ในโค้ด ทำให้ test/maintain งง ควรเลือกอันเดียว
- `cloudflare/worker.js` + `cloudflare/*.png` — legacy (เคยลองใช้ Worker proxy) ไม่ใช้แล้ว — ลบหรือย้ายไป archive
- webhook (`id`/`help` ใน OA) — POST ตรงเข้า Apps Script ได้ 302→405 — ถ้าจะให้คำสั่ง OA ใช้ได้ ต้องมี relay (Cloudflare Worker) — ตอนนี้ปิดฟีเจอร์นี้ไว้ก่อน

## Next session — เริ่มจากตรงนี้

1. ถามพี่ปุ้ยว่าเลือก mode ไหน (Apps Script-only vs GitHub Pages)
2. ทดสอบ apiCall ของ mode ที่เลือกให้ผ่านจริง (ดู §🟡)
3. ถ้าผ่าน → ทดสอบ flow เต็ม: เปิดแอพ → สร้าง product → import CSV → approve user → ขอลา → rich menu
4. เก็บกวาด cloudflare/ + ตัด mode ที่ไม่ใช้
