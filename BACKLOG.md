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
| Cloudflare Worker | `https://tiktok-crm-webhook.p-pui.workers.dev` |
| Owner LINE ID | `Ub47d6b519be013dbe6e83c4fbd079c56` (พี่ปุ้ย) |
| Current version | deploy @16 |

### Deploy command (ทุกครั้งที่แก้ code)
```bash
cd ~/Downloads/tiktok-crm-lead-manager
~/.npm-global/bin/clasp push -f
~/.npm-global/bin/clasp deploy --deploymentId AKfycbyIffdlua-m7zW4iqfW81EbIVljPrW31I-OCGveSS1biImW-UpkywwslPf0LJAH2vKoWQ
```

## ✅ เสร็จแล้ว

- Code 35 ไฟล์ — เขียน + audit + แก้ bug 12 จุด (mergeCustomers, dailyReport.revenue, role validation, notify dedup, product assign UI, search customers tab, manager ban tab, leave links, prompt→modal, Thai error mapping, date min)
- สร้าง Apps Script project + push + deploy @11
- ติดตั้ง clasp ที่ `~/.npm-global/bin/clasp` (npm prefix = `~/.npm-global`, PATH ใน `~/.zshrc`)
- ตั้ง LIFF_ID + LINE_CHANNEL_ACCESS_TOKEN (`bootstrap_` รันแล้ว)
- เพิ่ม owner (พี่ปุ้ย) — `_addPrimaryOwner` รันแล้ว
- Webhook ทำงาน — พิมพ์ `id`/`help` ใน OA ได้ (ผ่าน Cloudflare Worker relay แก้ปัญหา Apps Script ตอบ 302)
- Rich menu image — สร้างด้วย PIL + Sarabun font (3 ช่อง: เปิดระบบ/ขอลา/My ID) ฝัง base64 ใน `RichMenuImage.gs` → `setupRichMenuPrebuilt()`

## ✅ ล่าสุด: แก้ให้เป็น Apps Script-only fallback แล้ว — deploy @13

พี่ปุ้ยไม่ต้องการ GitHub Pages / Cloudflare Worker จึงแก้กลับมาให้ระบบอยู่บน Apps Script อย่างเดียว:

- `WebApp.gs` — ไม่ใช้ `WORKER_URL` แล้ว, `apiUrl` เป็น Apps Script Web App URL
- `WebApp.gs` — เพิ่ม `apiRoute(action,args)` สำหรับให้หน้า HTML เรียก backend ผ่าน `google.script.run`
- `_app.html` — `apiCall()` ใช้ `google.script.run.apiRoute()` ก่อน ไม่พึ่ง `fetch POST` ที่ชน redirect/CORS
- `_app.html` — `liff.init()` timeout เหลือ 5s แล้ว fallback เป็นหน้าใส่ LINE User ID เอง
- `_app.html` — เพิ่ม `&reset=1` เพื่อล้าง LINE User ID ที่จำไว้ในเครื่อง กรณีกรอกผิด

## ✅ เพิ่มเติม deploy @14

- `page-register.html` — หน้า new user แสดง LINE User ID และชื่อ LINE/ชื่อเล่นชัดเจนก่อนกรอกข้อมูล
- `page-register.html` — prefill ช่องชื่อเล่นจากชื่อ LINE แต่ยังให้แก้ได้
- `page-register.html` — บังคับมี LINE User ID, selfie และบัตรประชาชนก่อนส่งคำขอ
- owner ที่อยู่ใน `Owners` sheet ยังถูก route เข้า owner dashboard ผ่าน `getMyRole()` ไม่ต้องถ่ายรูป/ลงทะเบียนใหม่

## ✅ เพิ่มเติม deploy @15

- `_app.html` — เพิ่มเวลารอ `liff.init()` จาก 5s เป็น 20s เพื่อลดกรณี new user โดน fallback ให้กรอก LINE User ID เร็วเกินไป

## ✅ เตรียมย้าย frontend ไป GitHub Pages

- เพิ่ม `frontend/` เป็น static LIFF frontend สำหรับ GitHub Pages
- เพิ่ม `tools/build-frontend.js` สำหรับ generate static frontend จาก HTML ใน `apps-script/`
- เพิ่ม `docs/github-pages-frontend.md` เป็นขั้นตอนตั้ง GitHub Pages + LIFF endpoint
- `_app.html` รองรับ `frontendBase` แล้ว: เปิดจาก GitHub จะ navigate ไป `.html` local pages, แต่ API ยังยิง Apps Script backend เดิม
- เพิ่ม router สำหรับ `liff.state` เพื่อให้ลิงก์ `https://liff.line.me/<LIFF_ID>/owner` ไป `owner.html` ได้เมื่อ LIFF endpoint เป็น GitHub Pages root
- ทดสอบ Apps Script backend ด้วย `curl -L -H 'Content-Type: text/plain;charset=utf-8' --data '{"action":"ping"}' ...` แล้วได้ JSON ok
- Apps Script deploy ล่าสุด `@16`
- ยังไม่ได้ push ขึ้น GitHub เพราะ `gh auth status` แจ้ง token ของ account `pariwat-aruno` หมดอายุ ต้อง `gh auth login` ใหม่ก่อน
- `Setup.gs` — เพิ่ม `clearWorkerUrl()` และ `setupAppsScriptOnlyMode()`

URL ที่ทดสอบแล้วโหลด HTML ได้:
`https://script.google.com/macros/s/AKfycbyIffdlua-m7zW4iqfW81EbIVljPrW31I-OCGveSS1biImW-UpkywwslPf0LJAH2vKoWQ/exec?page=app`

ข้อจำกัดที่ยังเป็นข้อจำกัดของ Apps Script เอง:
- LINE Messaging API webhook ยิง `POST` ตรงเข้า Apps Script จะได้ `302` แล้วปลายทาง `script.googleusercontent.com` รับ `POST` เป็น `405`
- ดังนั้นถ้าไม่ใช้ Cloudflare/relay ใดๆ คำสั่งใน OA เช่น `id`/`help` อาจใช้ไม่ได้
- หน้าแอพยังใช้งานได้ เพราะ API ในหน้าเปลี่ยนไปใช้ `google.script.run` แล้ว

## เดิม: เปิดหน้า LIFF ไม่ได้ — `liff.init timeout (15s)`

### Root cause
Apps Script `/exec` คืน HTTP 302 redirect → `script.googleusercontent.com`
→ domain เปลี่ยนหลัง redirect → `liff.init()` เช็คเจอ webview domain ≠ LIFF endpoint domain
→ LINE ไม่ establish bridge → `liff.init()` ค้างจน timeout

(payroll-starter เจอปัญหาเดียวกัน → เลี่ยงด้วยการ host frontend บน GitHub Pages — ดู `~/Downloads/payroll-starter/docs/TROUBLESHOOTING.md` §2)

### bug ที่แก้ระหว่างทาง (ทุกอันเป็น bug จริง แก้ถูกแล้ว — แต่ไม่ใช่ root cause)
- relative URL `?page=x` → absolute `pageUrl()`/`gotoPage()` ใน `_app.html`
- `include()` ใช้ `createHtmlOutputFromFile` ไม่ evaluate scriptlet → เปลี่ยนเป็น `createTemplateFromFile().evaluate()` + ส่ง `_TEMPLATE_VARS`
- `<?=` (escaping) → `<?!=` (non-escaping) ใน `_app.html` (JSON.stringify values)
- org URL `/a/moodata.me/macros/` → normalize เป็น generic `/macros/`
- `liff.login` redirectUri ใช้ `location.href` (1-time token) → เปลี่ยนเป็น `pageUrl()`
- เพิ่ม progress status + timeout ใน `initLiff`/`apiCall`/`bootApp`

### ทางแก้ที่เลือก: Cloudflare Worker เป็น proxy
domain `workers.dev` คงที่ ไม่ redirect → `liff.init()` ทำงาน
- `GET` → Worker ดึง HTML จาก Apps Script (follow redirect ภายใน) → คืน 200
- `POST + action` → proxy → return JSON (apiCall)
- `POST + events` → fire-and-forget (webhook เดิม)

โค้ดฝั่ง Apps Script เสร็จแล้ว (deploy @11):
- `WebApp.gs` — `apiUrl` ใช้ `WORKER_URL` (ScriptProperty) ถ้าตั้งไว้
- `Setup.gs` — เพิ่ม `setWorkerUrl()` + `_setWorker()` (hardcoded)
- `FlexCard.gs` — flex card links ใช้ `liff.line.me/<LIFF_ID>/<page>`
- `cloudflare/worker.js` — เขียน GET proxy + POST split แล้ว (ยังไม่ deploy ขึ้น Cloudflare)

## ⏳ TODO — ขั้นที่ต้องทำต่อ (พี่ปุ้ยทำเอง)

1. **Refresh Apps Script Editor** (Cmd+R) — ถ้าเตือน unsaved → **Discard** (ไม่งั้นเขียนทับ code ใหม่)
2. **Run `_setWorker`** ใน Setup.gs → ตั้ง `WORKER_URL` property
3. **อัปเดต Cloudflare Worker** — paste code จาก `cloudflare/worker.js` → Save and deploy
4. **เปลี่ยน LIFF Endpoint URL** ใน LINE Developers Console → `https://tiktok-crm-webhook.p-pui.workers.dev` (ลบ `?page=app`)
5. **ทดสอบ** — เปิด `https://liff.line.me/2010082378-Dyr6fRBQ/app` ใน LINE → ควรเข้า Owner Dashboard
6. **Run `setupRichMenuPrebuilt`** — ถ้ายังไม่ได้ทำ (rich menu ขึ้นใน chat OA)

## ⚠️ ความเสี่ยง / ทางสำรอง

- **Worker proxy ยังไม่ทดสอบจริง** — ทฤษฎีแน่น (domain redirect = root cause) แต่ยังไม่ confirm
- **ทางสำรองถ้า Worker proxy ไม่ได้ผล:** ย้าย HTML frontend ไป **GitHub Pages** (เหมือน payroll-starter — พิสูจน์แล้วว่า work) — Apps Script เป็นแค่ API backend
- pathInfo forwarding ผ่าน Worker อาจมี edge case ที่ต้อง debug

## Next session — เริ่มจากตรงนี้

ถ้ากลับมาทำต่อ:
1. ถามพี่ปุ้ยว่าทำ TODO ขั้น 1-5 หรือยัง + ผลเป็นยังไง
2. ถ้า LIFF เปิดได้แล้ว → ทดสอบ flow เต็ม (สร้าง product, import CSV, approve user, ขอลา)
3. ถ้ายังไม่ได้ → debug Worker proxy หรือเปลี่ยนไป GitHub Pages
