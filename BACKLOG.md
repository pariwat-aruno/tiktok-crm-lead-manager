# BACKLOG — TikTok CRM Lead Manager

> สถานะการ deploy + งานค้าง (อัปเดต 2026-05-14)

## Reference (ข้อมูลระบบ)

| รายการ | ค่า |
|---|---|
| Project root | `~/Downloads/tiktok-crm-lead-manager/` |
| Apps Script Editor | https://script.google.com/d/1smslW-lmyaZ-TEJ0pTfu7xIPT9aEAHtYx-Bs3BndYQDFnQKrWFZQZxUe/edit |
| Deployment ID | `AKfycbyIffdlua-m7zW4iqfW81EbIVljPrW31I-OCGveSS1biImW-UpkywwslPf0LJAH2vKoWQ` |
| Apps Script Web App | `https://script.google.com/macros/s/<deploymentId>/exec` |
| Sheet | https://docs.google.com/spreadsheets/d/1jsU2hFTmDIZfx9CG6e1dmYU7O15sOVKT4IDkGwrn724/edit |
| LIFF ID | `2010082378-Dyr6fRBQ` |
| **LIFF Endpoint URL** | `https://pariwat-aruno.github.io/tiktok-crm-lead-manager/` (GitHub Pages root) |
| Owner LINE ID | `Ub47d6b519be013dbe6e83c4fbd079c56` (พี่ปุ้ย) |
| GitHub repo | https://github.com/pariwat-aruno/tiktok-crm-lead-manager |
| GitHub Pages | https://pariwat-aruno.github.io/tiktok-crm-lead-manager/ (`gh-pages` branch root) |
| Apps Script deploy | `@16` |

### Deploy: แก้ apps-script/
```bash
cd ~/Downloads/tiktok-crm-lead-manager
~/.npm-global/bin/clasp push -f
~/.npm-global/bin/clasp deploy --deploymentId AKfycbyIffdlua-m7zW4iqfW81EbIVljPrW31I-OCGveSS1biImW-UpkywwslPf0LJAH2vKoWQ
```

### Deploy: แก้ HTML frontend
```bash
node tools/build-frontend.js          # gen frontend/*.html จาก apps-script/*.html
git add tools frontend && git commit && git push origin main
# แล้ว sync ขึ้น gh-pages:
git checkout gh-pages
git checkout main -- frontend
cp -f frontend/.nojekyll frontend/README.md frontend/*.html .
git rm -r --cached frontend; rm -rf frontend
git add -A && git commit && git push origin gh-pages
git checkout main
```
> ⚠ git ops ที่ใช้เวลา — รันแบบ background (`run_in_background`) เพราะถ้า user พิมพ์ระหว่างรัน harness จะ cancel command

## สถาปัตยกรรม

**Mode หลักที่ใช้งานจริง = GitHub Pages** (พิสูจน์แล้วว่าทำงาน):
```
LINE app → liff.line.me/<LIFF_ID>/app
  → GitHub Pages index.html → โหลด LIFF SDK → liff.init() → route → app.html
  → app.html → bootApp → initLiff (เห็น logged in แล้ว) → apiCall (fetch POST → Apps Script /exec)
  → Owner Dashboard
```
- frontend = static HTML บน GitHub Pages (`gh-pages` branch) — domain คงที่ ไม่ redirect → `liff.init()` ทำงาน
- backend = Apps Script Web App — `apiCall` ยิง `fetch POST` ไป `/exec` ได้ JSON กลับ (CORS `*` + ไม่ติด 405)
- `_app.html` มี dual-mode: ถ้า `APP.frontendBase` มี → GitHub Pages mode, ถ้าไม่มี → Apps Script-only mode (google.script.run + manual identity) — ตอนนี้ใช้ GitHub Pages เป็นหลัก

## ✅ เสร็จ + ทดสอบผ่านแล้ว

- Code — audit + แก้ bug 12 จุด + RichMenuImage (Sarabun font)
- Apps Script deploy `@16` + LIFF_ID + LINE token + owner
- **LIFF เปิดได้** — ไม่ค้าง ไม่ redirect loop ไม่จอเล็ก
- **Owner เปิด → เข้า Owner Dashboard ได้**
- **User ใหม่ → route ไปหน้า register** + แสดง LINE User ID
- **`apiCall` (fetch POST → Apps Script) ทำงาน** — owner dashboard โหลดข้อมูลได้
- bug ที่แก้ระหว่าง deploy:
  - `build-frontend.js` `$$`→`$` (replacement string) → ใช้ replacement function
  - `index.html` redirect loop — redirect ก่อน `liff.init()` + ทิ้ง params → แก้: `liff.init()` ก่อน route + forward params ทั้งหมด
  - viewport meta หาย ใน static build → เพิ่มใน `build-frontend.js`
- ลบ `cloudflare/` (legacy worker proxy — เลิกใช้)

## ⏳ เหลือทดสอบ flow เต็ม

- [ ] tab สินค้า — createProduct + assignProduct UI
- [ ] tab Upload CSV — importCsv
- [ ] tab Pending — approvePendingUser (มี `U18177490...` ค้าง register ไว้ทดสอบได้)
- [ ] หน้า ขอลา — requestLeave
- [ ] tab สร้าง Rich Menu — `setupRichMenuFromBase64` (base64 canvas ~50-200KB ผ่าน fetch POST — ยังไม่ทดสอบ)
- [ ] `setupRichMenuPrebuilt()` — รันใน Apps Script Editor ตั้ง rich menu (Sarabun font image)

## 🟢 ข้อจำกัด / ตัดสินใจภายหลัง

- **webhook OA (`id`/`help`)** — POST ตรงเข้า Apps Script ได้ 302→405 → คำสั่งใน OA ใช้ไม่ได้ ต้องมี relay (Cloudflare Worker) ถึงจะเปิดได้ — **ปิดฟีเจอร์นี้ไว้ก่อน** (user หาตัวเองด้วยหน้า register ที่แสดง LINE User ID + `_manualIdentity` fallback)
- **Apps Script-only mode** ยังอยู่ในโค้ด (`_app.html` dual-mode) — เผื่อ fallback แต่ไม่ได้ใช้เป็นหลัก — จะตัดออกหรือเก็บไว้ก็ได้

## Next session

1. ทดสอบ flow เต็ม (ดู ⏳) — ถ้าติดตรงไหนค่อย debug
2. รัน `setupRichMenuPrebuilt()` ให้ rich menu ขึ้น OA
3. ถ้าจะเปิด webhook OA → ตั้ง Cloudflare Worker relay
