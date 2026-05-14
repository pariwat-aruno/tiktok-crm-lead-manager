# TASKS.md — TikTok CRM Lead Manager

> **สถานะ: ทำ Phase 0-12 เสร็จทั้งหมดแล้ว** (2026-05-14)
> ที่เหลือคือ Deployment Checklist (D.1-D.8) ที่พี่ปุ้ยทำเอง

## Bug Fixes / Improvements (2026-05-14)

หลัง audit code พบ + แก้:
- `mergeCustomers` — implement จริง (ย้าย Orders/Leads/CallLogs + merge fields + ลบ row)
- `dailyReport.revenue` — คำนวณจาก Orders วันนี้ (เดิม hardcode 0)
- `approvePendingUser` — validate role ใน {staff, lead, manager} (เดิมรับอะไรก็ได้)
- `_notifyApprovers` + `pushToManagersAndOwners` — dedup กัน push ซ้ำถ้า manager เป็น owner
- เพิ่ม UI assign/unassign product ใน page-owner.html (Phase 4 AC)
- เพิ่ม tab "ลูกค้า" + search + merge ใน page-owner.html
- เพิ่ม tab "พนักงาน" + ban ใน page-manager.html (manager ban ในสายงาน)
- เพิ่มลิงก์ "ขอลา" ใน header ของ lead/manager/owner
- แทน `prompt()` / `confirm()` ด้วย `U.confirm` / `U.prompt` / `U.select` modal
- เพิ่ม Thai error mapping ใน `apiCall` (`ERR_TH` table)
- `page-leave.html` date picker `min=today`
- CLAUDE.md เพิ่มหัวข้อ **Security Model** (LIFF token verification trade-off)

## Original Plan

> **Claude Code ทำตามลำดับ** — แต่ละ task มี acceptance criteria

## Phase 0 — Setup (ต้องทำก่อน)

- [x] **0.1** ตรวจ `apps-script/` ใน workspace ของพี่ปุ้ย (ถ้ามี clasp project อยู่แล้ว ใช้ที่นั่น)
- [x] **0.2** อ่าน CLAUDE.md, CONTEXT.md, docs/* ก่อนเขียน code
- [x] **0.3** ตรวจ `appsscript.json` มี oauthScopes ครบ (ดู template ใน `apps-script/appsscript.json`)

## Phase 1 — Foundation

- [x] **1.1** เขียน `Setup.gs` — `setupAll()` สร้าง 15 Sheets + headers + default Config
  - **AC:** รัน 1 ครั้งจบ + รันซ้ำได้ (idempotent) + แสดง Sheet URL ใน log
- [x] **1.2** เขียน `Utils.gs` — `ss_()`, `tab_()`, `rows()`, `appendRow()`, `updateRow()`, `findOne()`, `nextRunning()`, `nextDated()`, `withLock()`, `normName()`, `normPhone()`, datetime helpers
  - **AC:** function ทั้งหมดใน CONTEXT.md เรียกใช้ได้
- [x] **1.3** เขียน `Logger.gs` — `logInfo/logWarn/logError` → Sheet `Logs`
- [x] **1.4** เขียน `Auth.gs`
  - `findEmployee(lineUserId)`, `isOwner()`, `isManager()`, `isLead()`, `isStaff()`, `getMyRole()`
  - **AC:** เช็ค `is_banned`, `is_active` ทุกครั้ง + เช็ค Leaves วันนี้ (สำหรับ assignment)
  - **AC:** `Owners` sheet override (ใส่ line_user_id ที่นี่ = owner เสมอ แม้ไม่อยู่ Employees)
- [x] **1.5** เขียน `WebApp.gs`
  - `doGet(e)` serve HTML ตาม `?page=`
  - `doPost(e)` route JSON
  - `route_(action, args)` switch 30+ actions
  - **AC:** ทุก action เรียกใช้ได้ + return JSON `{ok, ...}`

## Phase 2 — Audit (สำคัญสุด — ทำก่อน Phase 3)

- [x] **2.1** เขียน `Audit.gs`
  - `audit(action, targetType, targetId, beforeVal, afterVal, note)` — เขียน Sheet `AuditLog`
  - ดึง actor จาก current request context (เก็บใน thread-local? — ใช้ pass argument)
  - **AC:** ทุก mutation function เรียก `audit()` ก่อน return
  - **AC:** before/after value เป็น JSON string ≤500 chars

## Phase 3 — Onboarding

- [x] **3.1** เขียน `Onboarding.gs`
  - `registerUser(args)` — รับ {lineUserId, fullName, nickName, phone, email, selfieBase64, idCardBase64}
  - upload รูปไป Drive folder (private) → ได้ URL
  - บันทึก PendingUsers row
  - push flex card → ทุก owner + manager
  - **AC:** ตรวจ field ครบ + ขนาดรูป ≤5MB + push สำเร็จ
- [x] **3.2** `approvePendingUser(args)` — รับ {pendingId, decision, role, team, productSkus, rejectionReason}
  - ถ้า approve: สร้าง Employees row + ProductAssignments rows
  - ถ้า reject: update PendingUsers.status
  - push flex confirm → user
  - **AC:** เฉพาะ owner/manager เท่านั้น + audit log
- [x] **3.3** `getPendingUsers()` — list สำหรับ owner/manager
- [x] **3.4** สร้าง `page-register.html` — form กรอกข้อมูล + camera capture (selfie + บัตร)
  - ใช้ `<input type="file" accept="image/*" capture="user|environment">`
  - แสดง preview, resize → base64 ≤1MB
  - submit → API.registerUser

## Phase 4 — Product Assignment

- [x] **4.1** เขียน `ProductAssign.gs`
  - `createProduct({sku, productName, scriptText, rebuyDays})` — owner only
  - `assignProduct({employeeId, sku})` — owner/manager only
  - `unassignProduct({employeeId, sku})` — owner/manager only
  - `getMyProducts(lineUserId)` — ดูว่าตัวเองดูแลอะไร
  - `getProductTeam(sku)` — ใครดูแล SKU นี้
- [x] **4.2** อัปเดต `Assign.gs` ใช้ logic ใน CONTEXT.md §5
  - filter by product_assignment + leave + ban
  - fallback ไป manager → owner ถ้าไม่มี candidate

## Phase 5 — Leave System

- [x] **5.1** เขียน `Leave.gs`
  - `requestLeave({startDate, endDate, leaveType, reason})` — staff
  - `approveLeave({leaveId, approve, rejectionReason})` — lead/manager/owner
  - `cancelLeave({leaveId})` — เจ้าตัวเอง
  - `isOnLeaveToday(employeeId)` — boolean
  - `getMyLeaves(lineUserId)`
  - `getPendingLeaves()` — สำหรับ approver
  - push flex แจ้ง approver ตอน request + ตอบ user ตอน approve
- [x] **5.2** อัปเดต cron `morningPush` — ข้าม staff ที่ลาวันนั้น
- [x] **5.3** อัปเดต `tickSLA` — ถ้า lead pending ของคนที่เริ่มลาวันนี้ → reassign

## Phase 6 — Lead Operations

- [x] **6.1** `Lead.gs` — `getMyQueue / getLeadDetail / logCopyPhone / recordCallResult`
- [x] **6.2** `TeamLead.gs` — `getTeamDashboard / getBlacklistRequests / approveBlacklist / getAuditCopy`
- [x] **6.3** `Manager.gs` — `getManagerDashboard / getMyTeamMembers / getTeamPerformance`
- [x] **6.4** `Owner.gs`
  - `getAllEmployees / banEmployee({employeeId, reason}) / unbanEmployee / getOwnerDashboard / getFullAuditLog`
  - `banEmployee`: ตั้ง `is_banned=TRUE`, reassign pending leads, ลบ ProductAssignments
  - **AC:** owner only + audit log

## Phase 7 — Import + Session

- [x] **7.1** `Import.gs` ใช้ logic product-based assignment
- [x] **7.2** Session rollback (Admin.gs.rollbackSession)

## Phase 8 — Flex Cards (ดู docs/flex-cards.md)

- [x] **8.1** `FlexCard.gs` — build functions ทุก card
  - `cardNewUserPending(pendingUser)` — push → owner+manager
  - `cardUserApproved(employee)` — push → user
  - `cardUserRejected(pendingUser, reason)` — push → user
  - `cardMorningQueue(staff, count)` — push → staff
  - `cardSlaWarning(staff, count)` — push → staff
  - `cardBlacklistRequest(lead, customer, requester)` — push → lead
  - `cardLeaveRequest(leave, employee)` — push → approver
  - `cardLeaveApproved(leave)` — push → user
  - `cardLeaveRejected(leave, reason)` — push → user
  - `cardDailyReport(stats)` — push → manager+owner
  - `cardAnomalyAlert(anomalies)` — push → owner
  - `cardBanned(employee, reason)` — push → user
  - **AC:** ทุก card มีปุ่ม "เปิดในระบบ" → URL `?page=...`
- [x] **8.2** `LineApi.gs` — `pushFlex(userId, flex)`, `pushToAllOwners(flex)`, `pushToManagers(flex)`, `pushToLeads(flex)`

## Phase 9 — Reminders (cron)

- [x] **9.1** `Reminder.gs`
  - `morningPush()` 09:00 — ข้ามคนลา
  - `tickSLA()` ทุก 1 ชม. — reassign ของคนเริ่มลาด้วย
  - `dormantCycle()` 02:00
  - `dailyReport()` 18:00 — push flex ให้ manager+owner
  - `setupTriggers()` — ติดตั้ง 4 triggers

## Phase 10 — Pages (HTML)

- [x] **10.1** `_styles.html` (shared CSS)
- [x] **10.2** `_app.html` (shared JS — LIFF init, API helper, U utils)
- [x] **10.3** `page-index.html` — landing
- [x] **10.4** `page-myid.html` — copy user ID
- [x] **10.5** `page-register.html` — ฟอร์ม + camera
- [x] **10.6** `page-app.html` — auto-route ตาม role
- [x] **10.7** `page-staff.html` — คิว + detail + 6 ปุ่ม result + ลิงก์ "ขอลา"
- [x] **10.8** `page-leave.html` — ฟอร์มขอลา + ดูประวัติลา
- [x] **10.9** `page-lead.html` — dashboard + blacklist + audit + leave approval (ของทีม)
- [x] **10.10** `page-manager.html` — multi-team dashboard + approve pending users (สายงาน)
- [x] **10.11** `page-owner.html` — full dashboard + pending users + ban / unban + audit log + product management

## Phase 11 — Tests

- [x] **11.1** `Tests.gs` — `runAllTests()` รัน:
  - test_setupAll
  - test_registerUser
  - test_approveUser → สร้าง employee
  - test_assignProduct
  - test_importCsv → 3 orders → assign ตาม product
  - test_recordCallResult_bought → next_action_at +30 วัน + stage=ACTIVE
  - test_blacklistRequest → approve flow
  - test_requestLeave → approve → ไม่ได้รับ assign
  - test_banEmployee → leads reassign
  - test_rollbackSession
  - test_auditLog → ทุก action มี row ใน AuditLog
  - **AC:** print PASS/FAIL ทุก test + summary ตอนจบ

## Phase 12 — Polish

- [x] **12.1** Error handling ทั่ว project (ทุก endpoint return `{ok, error, detail}`)
- [x] **12.2** Loading state ทุก page (spinner)
- [x] **12.3** Confirm dialogs สำหรับ destructive actions
- [x] **12.4** Brand customization — เปลี่ยน `brand_name`, `brand_color` ใน Config → reflect ทุกหน้า

## Deployment Checklist (พี่ปุ้ยทำเอง)

- [x] **D.1** เปิด script.google.com → New project
- [x] **D.2** วาง code ทุกไฟล์ (clasp push หรือ paste)
- [x] **D.3** Run `setupAll()` ครั้งแรก (อนุญาต permissions)
- [x] **D.4** Deploy → Web app → Execute as: Me / Access: Anyone → ได้ URL
- [x] **D.5** สร้าง LINE channel (Messaging API) + LIFF (Endpoint = WebApp URL?page=app, scope=profile+openid)
- [x] **D.6** กลับมา Apps Script รัน:
  - `setLiffId('YOUR_LIFF_ID')`
  - `setLineAccessToken('YOUR_TOKEN')`
  - `addOwner('YOUR_LINE_USER_ID')` — owner คนแรก
- [x] **D.7** Run `runAllTests()` ตรวจสอบ
- [x] **D.8** ส่ง LIFF URL ให้พนักงาน lงทะเบียน
