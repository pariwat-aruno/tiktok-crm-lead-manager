# CLAUDE.md — TikTok CRM Lead Manager

> **อ่านไฟล์นี้ก่อนทำงานบน project นี้ทุกครั้ง**

## Project Identity

ระบบจัดการลูกค้า + คิวโทร CRM จาก TikTok สำหรับธุรกิจสกินแคร์ (15-25 พนักงาน)

**Stack:** Apps Script เดียวจบ — host ทั้ง LIFF (HTML) + JSON API + Sheet database + Cron
**ไม่ใช้:** GitHub Pages / ไม่ใช้ external host

## โครงสร้าง

```
project/
├── CLAUDE.md          ← ไฟล์นี้ (recipe)
├── CONTEXT.md         ← คำเฉพาะ + data model
├── TASKS.md           ← TODO 50+ tasks ที่ Claude Code ทำต่อ
├── docs/
│   ├── architecture.md       ← Mermaid + flow + edge cases
│   ├── data-model.md         ← schema 15 sheets ครบ
│   ├── flex-cards.md         ← spec flex card ทุกแบบ
│   ├── permissions.md        ← role × action matrix
│   ├── onboarding-flow.md    ← พนักงานใหม่ลงทะเบียน → approve
│   └── leave-system.md       ← ระบบลางาน + ส่งงานข้าม
└── apps-script/
    ├── appsscript.json       ← scopes + webapp config
    ├── Setup.gs              ← setupAll() ครั้งเดียวจบ
    ├── Utils.gs              ← helpers
    ├── Logger.gs             ← log Sheet AuditLog
    ├── Auth.gs               ← role check
    ├── Assign.gs             ← product-based + RR
    ├── Lead.gs               ← staff actions
    ├── TeamLead.gs           ← lead actions
    ├── Manager.gs            ← manager actions
    ├── Owner.gs              ← owner actions (approve user, ban)
    ├── Import.gs             ← CSV import
    ├── Reminder.gs           ← 4 cron
    ├── LineApi.gs            ← push + flex
    ├── FlexCard.gs           ← flex builders ทุกแบบ
    ├── WebApp.gs             ← doGet/doPost router
    ├── Onboarding.gs         ← register + approve
    ├── Leave.gs              ← ระบบลางาน
    ├── ProductAssign.gs      ← assign สินค้าให้พนักงาน
    ├── Tests.gs              ← runAllTests()
    ├── _styles.html          ← CSS shared
    ├── _app.html             ← JS shared (LIFF + API helpers)
    ├── page-index.html       ← landing
    ├── page-myid.html        ← copy user ID
    ├── page-register.html    ← new user form
    ├── page-staff.html       ← พนักงานโทร
    ├── page-lead.html        ← หัวหน้าทีม
    ├── page-manager.html     ← ผู้จัดการ
    ├── page-owner.html       ← owner / admin
    ├── page-leave.html       ← ขอลา
    └── page-app.html         ← auto-route
```

## Roles (4 ระดับ)

| Role | สิทธิ์ |
|------|--------|
| **owner** | ทุกอย่าง: approve user / ban / สร้าง product / assign manager |
| **manager** | คุมหลายทีม / approve user ในสายงานตน / assign lead / ดู report |
| **lead** | คุม 1 ทีม / approve blacklist / audit copy / ดู dashboard ทีม |
| **staff** | โทร / กดผลโทร / ลางาน |

## Product-Based Assignment (สำคัญ)

- พนักงาน 1 คนดูแล **1+ SKU** (ผ่าน Sheet `ProductAssignments`)
- ตอน import CSV → ลูกค้าซื้อ SKU-A → assign ให้พนักงานที่ดูแล SKU-A เท่านั้น
- ถ้าหลายคนดูแล SKU เดียวกัน → round-robin ในกลุ่มนั้น
- ถ้าวันนั้นพนักงานคนนั้น **ลาอยู่** → ข้ามไปคนถัดไป
- ถ้าทุกคน lock SKU นั้นลา → fallback ให้ manager คนแรกที่ active

## ทุก action มี audit log

ทุก mutation เขียน Sheet `AuditLog`:
```
log_id | timestamp | actor_employee_id | actor_role | action |
target_type | target_id | before_value | after_value | ip | user_agent | note
```

Actions ที่ log:
- user.register, user.approve, user.reject, user.ban, user.unban
- lead.assigned, lead.reassigned, lead.viewed, lead.phone_copied
- call.result_recorded, call.blacklist_requested
- blacklist.approved, blacklist.rejected
- product.assigned, product.unassigned
- leave.requested, leave.approved, leave.rejected, leave.cancelled
- session.imported, session.rolled_back
- customer.merged, customer.blacklisted

## ทุกการสื่อสาร = Flex Card

ห้าม push text เปลือย ๆ ทุก message เป็น **Flex Bubble** มีปุ่มกดง่าย:
- Onboarding pending → ปุ่ม "อนุมัติ / ปฏิเสธ / ดูรายละเอียด"
- Morning push → ปุ่ม "เปิดคิว"
- SLA warning → ปุ่ม "ดู lead ค้าง"
- Blacklist request → ปุ่ม "ดูคำขอ / อนุมัติ / ปฏิเสธ"
- Leave request → ปุ่ม "อนุมัติ / ปฏิเสธ"
- Daily report → ปุ่ม "เปิด dashboard"
- Anomaly alert → ปุ่ม "ดู audit"

Spec อยู่ใน `docs/flex-cards.md`

## Onboarding Flow (พนักงานใหม่)

```
1. พนักงานใหม่เปิด LIFF (?page=register)
   → liff.getProfile() = LINE userId + displayName
2. กรอกฟอร์ม:
   - ชื่อ-นามสกุล (ภาษาไทย)
   - ชื่อเล่น
   - เบอร์โทร
   - email
   - selfie (ถ่ายผ่าน camera)
   - บัตรประชาชน (ถ่ายผ่าน camera)
   → upload → Drive folder (private)
   → URL เก็บใน Sheet PendingUsers
3. ระบบ push flex card → ทุก owner+manager (active)
   "มีพนักงานใหม่ลงทะเบียน [ชื่อ]"
   ปุ่ม: ดูรายละเอียด / อนุมัติ / ปฏิเสธ
4. Owner/Manager กดอนุมัติ:
   - สร้าง employee_id
   - assign role (default: staff)
   - assign team
   - เลือก SKU ที่ดูแล
   → push flex confirm กลับให้ user
5. ถ้าปฏิเสธ → push เหตุผล
```

## Leave System

```
1. พนักงานเปิด ?page=leave → กรอกวันลา + เหตุผล
2. ระบบ push flex → lead/manager ของทีมนั้น
   ปุ่ม: อนุมัติ / ปฏิเสธ
3. ถ้าอนุมัติ:
   - เขียน Sheet Leaves (active=TRUE ในวันนั้น)
   - cron tickSLA ตรวจ: ถ้าจะ assign ให้คนนี้ในวันลา → ข้ามไปคนถัดไป
4. วันเริ่มลา cron จะ:
   - reassign lead pending ของคนลาในวันนั้น → คนถัดไปใน SKU เดียวกัน
   - ห้าม push morning push ให้คนลา
5. วันกลับ → คน auto-active
```

## Ban Pattern

```
owner กด ban → Employees.is_banned = TRUE
→ cron + login ตรวจ is_banned ก่อนทำอะไร
→ ถ้า ban: liff แสดง "บัญชีถูกระงับ" + เหตุผล
→ pending leads → reassign ทันที
→ ProductAssignments → ลบ
```

## Workflow per code change

```
แก้ local → clasp push → ใน Apps Script UI Deploy → Manage → Edit → Version: ใหม่ → Deploy
```

## Conventions

- Comment ไทย, function/var อังกฤษ
- ทุก function try-catch + log AuditLog ทุก mutation
- Idempotent: setup รันซ้ำได้
- Timezone: Asia/Bangkok
- ID format: `<PREFIX>-XXXX` หรือ `<PREFIX>-YYYYMMDD-XXXX`
- ห้าม emoji ใน flex card ยกเว้น ⚠️ (อันที่จำเป็น)

## Security Model

- **Auth ผ่าน LINE User ID เท่านั้น** — client ส่ง `userId` จาก `liff.getProfile()` มาในทุก request
- **ไม่ verify LIFF ID Token** ที่ backend — สำหรับทีม internal 15-25 คนถือว่ารับได้ (LIFF endpoint ผูกกับ LINE channel + bot link → user ต้องเป็นเพื่อนกับ OA ก่อนถึงจะเปิด LIFF ได้ + Apps Script Web App เป็น "Anyone" แต่ url เดาไม่ได้)
- **Risk:** ถ้ามี user รู้ Web App URL + LINE User ID ของ owner → ปลอม `lineUserId` ใน POST body ได้ → bypass auth
- **ถ้าต้องเพิ่ม:** เพิ่ม `liff.getIDToken()` ใน client + verify ID token ที่ backend ผ่าน LINE Verify API (`https://api.line.me/oauth2/v2.1/verify`) — เพิ่มในเฟสถัดไปถ้าทีมขยายเกิน 50 คน
- **Drive รูป**: PRIVATE — แค่คนใน Workspace ของพี่ปุ้ยเปิดได้

## ห้ามทำ (out of scope)

- ❌ ไม่ใช้ password / OAuth นอก LINE
- ❌ ไม่ดึง TikTok API ตรง (CSV manual)
- ❌ ไม่ใช้ external host (GitHub Pages, Vercel)
- ❌ ไม่ใช้ database นอก Google Sheet (เช่น Firestore)
- ❌ ไม่ใช้ realtime websocket
