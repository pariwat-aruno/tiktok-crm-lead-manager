# BACKLOG — TikTok CRM Lead Manager

> สถานะการ deploy + งานค้าง (อัปเดต 2026-05-16)

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

### Deploy: แก้ apps-script/
```bash
cd ~/Downloads/tiktok-crm-lead-manager
~/.npm-global/bin/clasp push -f
~/.npm-global/bin/clasp deploy --deploymentId AKfycbyIffdlua-m7zW4iqfW81EbIVljPrW31I-OCGveSS1biImW-UpkywwslPf0LJAH2vKoWQ
```

### Deploy: แก้ HTML frontend
```bash
node tools/build-frontend.js
git add apps-script tools frontend && git commit && git push origin main
git checkout gh-pages
git checkout main -- frontend
cp -f frontend/.nojekyll frontend/README.md frontend/*.html .
git rm -r --cached frontend; rm -rf frontend
git add -A && git commit && git push origin gh-pages
git checkout main
```
> ⚠ git ops ที่ใช้เวลา — รันแบบ `run_in_background: true` เพราะถ้า user พิมพ์ระหว่างรัน harness จะ cancel command

## สถาปัตยกรรม

**Mode หลัก = GitHub Pages frontend + Apps Script backend**
```
LINE app → liff.line.me/<LIFF_ID>/<path>
  → GitHub Pages index.html → โหลด LIFF SDK → liff.init() → route → <page>.html
  → bootApp → apiCall (fetch POST → Apps Script /exec) → JSON
```
- domain `pariwat-aruno.github.io` คงที่ ไม่ redirect → `liff.init()` ทำงาน
- backend = Apps Script `/exec` — `fetch POST` ได้ JSON (CORS `*`)
- `_app.html` dual-mode: GitHub Pages (default) / Apps Script-only (fallback ผ่าน `google.script.run`)

## ⭐ Feature ที่มีในระบบ

### Core
- 4 roles: owner / manager / lead / staff (visitor = ยังไม่ pair)
- Onboarding ผ่าน LIFF + selfie + บัตรประชาชน → Drive → owner/manager approve
- Audit log ครบทุก mutation
- Flex card ทุกการสื่อสาร (ห้าม text เปลือย)
- 4 cron เดิม: morningPush · tickSLA (warn only) · dormantCycle · dailyReport

### Tier 1+2 Lead Allocation (ใหม่)
- **Tier 1** = ลูกค้าตัวเอง (inherit จาก owner_employee_id) — ไม่จำกัด, คงไว้เสมอ
- **Tier 2** = เบอร์ใหม่ (fresh pool) — quota 30/คน/วัน
- **06:00 cron** `prepareMorningQueue` — RR global per SKU + เช็ค quota เหลือ + `withLock`
- **09:30 cron** `checkClockInDeadline` — no-show → release Tier 2 + push lead [คืน/ยกเลิก]
- **18:00 cron** `endOfDayCleanup` — release Tier 2 ที่ไม่โทร + auto-cancel + auto clock-out
- **Lead actions:** `restoreSlot` (คืน Tier 2) · `cancelSlot` (re-distribute ให้เพื่อนใน SKU)

### Clock-in/out
- **Attendance** sheet — ทุกคนต้อง clock-in ก่อน 09:30 (deadline config ได้)
- clockIn() ปลด Tier 2 hold → confirm assignment
- UI staff: ปุ่ม "⏰ Clock-in" / "⏏ Clock-out" + แสดงสถานะวันนี้

### Owner tab 📋 คิว
- **Snapshot** — คิวทั้งหมด · Tier 1/2 · เลย SLA · รอจัดสรร · Hold · ปิดวันนี้
- **พนักงานวันนี้** — list + attendance status + T1/T2/โทร/ปิด
- **รายการคิว** — filter (สถานะ/tier/ค้นชื่อ-เบอร์) + คลิกเห็น modal (customer + orders + call history)
- **ปุ่ม ⚡ แจก Tier 2 ตอนนี้** — เรียก `runPrepareMorningQueue` manual (โผล่เมื่อมี freshPool > 0)
- Thai labels: STATUS_TH · RESULT_TH · TIER_TH · ATT_TH

### Import flow (เปลี่ยนจาก assign-time → fresh pool)
```
CSV → mergeOrCreateLead:
  - ลูกค้าเก่า + owner active → Tier 1 inherit (assigned_to=owner, status=pending)
  - เบอร์ใหม่ → unassigned (รอ Tier 2 cron pick)
  - blacklist → skip
```

### Other Owner UI
- tab Pending — รูป selfie + บัตรประชาชนในการ์ด + เลือก role/team/SKU inline → กดอนุมัติทีเดียว
- tab สินค้า — form แยก list (ไม่ refresh ตอนพิมพ์) + ปุ่มลบ product (soft delete)
- tab ลูกค้า — search + multi-select + merge customers
- tab Upload CSV / Sessions / Audit
- ลิงก์ "ขอลา" ใน header ทุกหน้า role lead+

## 📊 Sheets (18)

Owners · Employees · PendingUsers · Products · ProductAssignments · Customers · Orders · Leads (+tier/held_status/bucket_date) · CallLogs · Leaves · **Attendance** · **LeadHolds** · Sessions · Stats · AuditLog · Config · Logs

## ⚙️ Cron (7)

| เวลา | function | หน้าที่ |
|---|---|---|
| 06:00 | `prepareMorningQueue` | pick Tier 2 hold |
| 09:00 | `morningPush` | flex แจ้งคิวพนักงาน |
| 09:30 | `checkClockInDeadline` | no-show → release |
| ทุก 1 ชม. | `tickSLA` | warn (ไม่ reassign แล้ว) |
| 02:00 | `dormantCycle` | NEW → DORMANT → CHURNED |
| 18:00 | `endOfDayCleanup` | EOD Tier 2 release + auto-out |
| 18:00 | `dailyReport` | flex รายงาน owner+manager |

## ⏳ ยังไม่ได้ทำ (folder 2 spec)

- Call timer + pause/resume + note (UX โทร)
- Inbound Order — staff สร้าง order ใหม่ → cancel นัดเก่า + reset rebuy
- Conflict resolution — 2 คน claim ลูกค้าเดียวกัน
- Cold-call list — 180 วันหยุดโทร
- Performance alert — staff ต่ำกว่าเกณฑ์
- Pairing code — 6 หลัก แทน LINE userId ตรงๆ

## 🟢 ข้อจำกัดที่รับได้

- **webhook OA** (`id`/`help`) — POST ตรงเข้า Apps Script ติด 302→405 → ปิดฟีเจอร์ไว้ (พนักงานใหม่ลงทะเบียนผ่าน LIFF page-register แสดง User ID ให้แล้ว)
- Apps Script-only mode (fallback) ยังอยู่ใน `_app.html` — ไม่ใช้แต่เก็บไว้เผื่อ

## 🛠 Setup steps (ครั้งเดียวหลัง deploy ใหม่)

ทุกครั้งที่ schema เปลี่ยน (เพิ่ม sheet/field) ต้องรัน 2 function ใน Apps Script Editor:
1. `setupAll` — สร้าง/อัปเดต sheets + Config defaults
2. `setupTriggers` — ติดตั้ง 7 cron triggers

## 🧪 Test data

- `_seed10Leads()` ใน Setup.gs — สร้าง 10 customers + 10 orders + 10 leads (unassigned) ตาม SKU แรกของระบบ
- หลัง seed → กดปุ่ม "⚡ แจก Tier 2 ตอนนี้" ใน Owner → tab คิว เพื่อ pick

## Next session

1. ทดสอบ flow เต็ม: register → approve → clock-in → Tier 2 → โทร → ปิด → audit
2. ถ้าจะทำ feature ต่อ — เลือกจากรายการ ⏳ ด้านบน
