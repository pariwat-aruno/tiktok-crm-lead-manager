# TikTok CRM Lead Manager

ระบบ CRM จัดการคิวโทรลูกค้าจาก TikTok สำหรับสกินแคร์ (15-25 พนักงาน)

> **Apps Script เดียวจบ** — host ทั้ง LIFF + API + Sheet + Cron ไม่ต้องใช้ GitHub Pages / external host

## ✨ Features

| Feature | Detail |
|---|---|
| **4 Roles** | owner > manager > lead > staff (hierarchical) |
| **Onboarding** | ลงทะเบียนผ่าน LIFF + ถ่าย selfie + บัตรประชาชน → owner approve |
| **Product-based assignment** | พนักงาน 1 คนดูแล 1+ SKU → ลูกค้าซื้อ SKU ไหน assign ให้คนนั้น |
| **Leave system** | ขอลา → approve → cron ข้ามคนลาวันนั้นอัตโนมัติ |
| **Ban** | owner กด ban → reassign lead + unassign product + push card |
| **Flex Cards** | ทุกการสื่อสารเป็น Flex Bubble มีปุ่มกดง่าย |
| **Full Audit** | ทุก action เขียน `AuditLog` — trace ใครทำอะไรเมื่อไร |
| **6 Call Results** | ซื้อ / ไม่ซื้อ / ไม่รับ / เลื่อน / ปฏิเสธ / ขอ blacklist |
| **CSV Import** | TikTok Shop CSV → auto-create customer + order + lead |
| **Session Rollback** | ลบ import ผิดได้ภายใน 24 ชม. |
| **4 Cron Jobs** | morning push, SLA tick, dormant cycle, daily report |

## 🚀 Setup (10 นาที)

### 1. สร้าง Apps Script project

```
1. ไป script.google.com → New project
2. ตั้งชื่อ "TikTok CRM"
3. Project Settings → ติ๊ก "Show appsscript.json"
4. คัดลอกไฟล์ทั้งหมดใน apps-script/ ไปวาง
   (หรือใช้ clasp push)
```

### 2. รัน `setupAll()`

```
1. เลือก function `setupAll` ใน dropdown
2. กด Run → อนุญาต permissions
3. ดู Execution log → จะเห็น Sheet URL ที่สร้างให้
```

### 3. Deploy Web App

```
Deploy → New deployment → Web app
  - Execute as: Me
  - Who has access: Anyone
→ ได้ Web App URL (https://script.google.com/macros/s/.../exec)
```

### 4. สร้าง LINE Channel + LIFF

```
1. developers.line.biz → Create LINE Login channel
   (หรือใช้ Messaging API channel ที่มี LIFF)
2. Add LIFF app:
   - Endpoint = <Web App URL>?page=app
   - Size = Full
   - Scope = profile, openid
3. คัดลอก LIFF ID
4. Messaging API → คัดลอก Channel Access Token (long-lived)
```

### 5. กลับมา Apps Script → set credentials

```js
setLiffId('YOUR_LIFF_ID')              // จากขั้น 4
setLineAccessToken('YOUR_TOKEN')       // จากขั้น 4
addOwner('YOUR_LINE_USER_ID', 'ปุ้ย')  // ดูวิธีหาด้านล่าง
```

### 6. หา LINE User ID ของตัวเอง

```
เปิด LIFF URL บนมือถือ:
https://liff.line.me/<LIFF_ID>?page=myid
→ จะแสดง User ID → คัดลอกแล้วใช้ addOwner()
```

### 7. ทดสอบ

```
1. รัน runAllTests() → ดู log → ต้อง PASS 11/11
2. รัน showInfo() → ดูสถานะระบบทั้งหมด
```

### 8. ใช้งานจริง

```
- ส่ง LIFF URL ให้พนักงานใหม่
- พนักงานเปิด → กรอกข้อมูล + ถ่าย selfie + บัตร → ส่งคำขอ
- owner ได้ Flex card ใน LINE → กด approve → ระบุ role, ทีม, SKU
- พนักงานได้ Flex confirm → เปิดระบบ → เห็นคิว → เริ่มโทร
```

## 📁 Project Structure

```
.
├── CLAUDE.md          ← recipe หลัก (อ่านก่อนทุกครั้งที่ Claude Code ทำงาน)
├── CONTEXT.md         ← คำเฉพาะ + glossary + 15 sheets schema
├── TASKS.md           ← TODO 50+ tasks ตามลำดับ phase
├── README.md          ← ไฟล์นี้
├── docs/
│   ├── architecture.md       ← Mermaid + 6 flows + edge cases
│   ├── data-model.md         ← schema เต็ม 15 sheets
│   ├── flex-cards.md         ← spec 12 flex cards
│   ├── permissions.md        ← role × action matrix
│   ├── onboarding-flow.md    ← พนักงานใหม่ลงทะเบียน
│   └── leave-system.md       ← ระบบลางาน
└── apps-script/
    ├── appsscript.json
    ├── Setup.gs              ← setupAll(), setLiffId(), addOwner()
    ├── Utils.gs              ← helpers
    ├── Logger.gs / Audit.gs
    ├── Auth.gs               ← role + scope check
    ├── WebApp.gs             ← doGet/doPost router (33 actions)
    ├── Onboarding.gs         ← registerUser + approvePendingUser
    ├── Leave.gs              ← request/approve/cancel + isOnLeaveToday
    ├── Assign.gs             ← product-based round-robin
    ├── Lead.gs               ← staff actions
    ├── TeamLead.gs           ← lead actions (ใน team)
    ├── Manager.gs            ← manager actions (chain)
    ├── Owner.gs              ← ban, full audit, dashboard
    ├── ProductAssign.gs      ← product CRUD + assignment
    ├── Import.gs             ← CSV import + session rollback
    ├── Reminder.gs           ← 4 cron jobs
    ├── LineApi.gs            ← push with retry
    ├── FlexCard.gs           ← 12 flex builders
    ├── Tests.gs              ← runAllTests() — 11 tests
    ├── _styles.html          ← shared CSS
    ├── _app.html             ← shared JS (LIFF + API)
    ├── page-index.html       ← landing
    ├── page-myid.html        ← copy user ID
    ├── page-register.html    ← form + camera capture
    ├── page-app.html         ← auto-route by role
    ├── page-staff.html       ← คิว + 6 ปุ่มผลโทร
    ├── page-leave.html       ← ขอลา + ดูประวัติ
    ├── page-lead.html        ← dashboard + blacklist + audit
    ├── page-manager.html     ← multi-team + approve user
    └── page-owner.html       ← full admin
```

## 🎯 สำหรับ Claude Code

อ่านลำดับนี้:
1. **CLAUDE.md** — กฎและ workflow
2. **CONTEXT.md** — คำเฉพาะ + data model
3. **TASKS.md** — TODO 50+ tasks ตามลำดับ phase
4. **docs/architecture.md** — ภาพรวม + flow + edge cases
5. **docs/*.md** อื่นๆ — ตามที่ TASKS.md ชี้

โค้ดทุกไฟล์ใน `apps-script/` เป็น **foundation พร้อมใช้** + มี TODO markers ที่จุดที่ต้องขยาย

## ⚠️ ก่อน production

- [ ] Run `runAllTests()` ต้อง PASS 11/11
- [ ] ทดสอบ flow onboarding บนมือถือจริง (camera capture)
- [ ] ทดสอบ push flex ทั้ง 12 cards จริงผ่าน LINE
- [ ] ตรวจ permissions ทุก role ตาม `docs/permissions.md`
- [ ] Reset test data → `resetTestData()`
- [ ] เปลี่ยน brand_name, brand_color ใน Config sheet

## 📋 Brand Customization

เปิด Sheet → Config → แก้ row:
- `brand_name` = ชื่อแบรนด์
- `brand_color` = สีหลัก (hex เช่น `#c8102e`)

เปลี่ยนแล้ว reflect ทุกหน้า + flex card ทันที (ไม่ต้อง redeploy)

## 🔧 ปรับแต่งอื่นๆ ใน Config sheet

| key | default | meaning |
|---|---|---|
| `sla_hours` | 48 | ภายในกี่ ชม. ต้องโทร |
| `reassign_hours` | 72 | เกินกี่ ชม. ระบบ reassign |
| `rebuy_default_days` | 30 | รอบโทรซ้ำ default |
| `dormant_days` | 90 | ไม่ซื้อ ≥ กี่วัน = DORMANT |
| `churn_days` | 180 | ไม่ซื้อ ≥ กี่วัน = CHURNED |
| `copy_anomaly_threshold` | 20 | copy ≥ กี่ครั้ง/วัน แจ้ง owner |
| `rollback_window_hours` | 24 | rollback session ได้ใน ชม. |
| `leave_max_days` | 14 | ลาได้สูงสุด/ครั้ง |

## 🆘 Troubleshooting

| ปัญหา | แก้ |
|---|---|
| `SHEET_ID ว่าง` | รัน `setupAll()` ก่อน |
| `LIFF SDK ไม่โหลด` | LIFF endpoint ผิด — ต้อง `<webAppUrl>?page=app` |
| `ยังไม่ได้ตั้ง LIFF_ID` | รัน `setLiffId('xxx')` |
| Push ไม่ส่ง | ตรวจ `LINE_CHANNEL_ACCESS_TOKEN` + พนักงานต้องเป็นเพื่อนกับ OA |
| Approve user ไม่ส่ง flex | user ต้อง add OA เป็นเพื่อนก่อน |
| Drive upload fail | folder อาจถูกลบ → `setupAll()` จะสร้างใหม่ |

## License

Internal use only.
