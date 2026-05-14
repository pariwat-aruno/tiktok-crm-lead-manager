# Onboarding Flow — New User Registration

## Overview

```
LINE user (ใหม่) → LIFF → กรอก + ถ่ายรูป → upload Drive → PendingUsers
→ push flex → owner/manager → approve → Employees + ProductAssignments → push back
```

## Frontend: `page-register.html`

### Layout

```
┌─────────────────────────────────┐
│ BRAND_NAME                       │
│ ลงทะเบียนพนักงานใหม่              │
├─────────────────────────────────┤
│ ชื่อ-นามสกุล (ภาษาไทย) *          │
│ [_________________________]      │
│                                  │
│ ชื่อเล่น *                       │
│ [_________________________]      │
│                                  │
│ เบอร์โทร *                       │
│ [_________________________]      │
│                                  │
│ อีเมล                            │
│ [_________________________]      │
├─────────────────────────────────┤
│ Selfie (ถ่ายหน้าตรง) *           │
│ ┌──────┐                         │
│ │ 📷  │ → input file capture=user│
│ └──────┘                         │
│ (กดเพื่อถ่าย)                    │
├─────────────────────────────────┤
│ บัตรประชาชน (หน้าบัตร) *         │
│ ┌──────┐                         │
│ │ 📷  │ → capture=environment    │
│ └──────┘                         │
├─────────────────────────────────┤
│ [   ส่งคำขอ   ]                  │
│ * ข้อมูลถูกเก็บเป็นความลับ        │
└─────────────────────────────────┘
```

### Camera capture

```html
<input type="file" accept="image/*" capture="user" id="selfieInput">
<input type="file" accept="image/*" capture="environment" id="idCardInput">
```

### Image resize (ก่อน upload)

```js
async function resizeImage(file, maxDim) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > height) {
        if (width > maxDim) { height *= maxDim / width; width = maxDim; }
      } else {
        if (height > maxDim) { width *= maxDim / height; height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      const b64 = canvas.toDataURL('image/jpeg', 0.85);
      resolve(b64.split(',')[1]); // strip prefix
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
```

### Submit

```js
const selfieB64 = await resizeImage(selfieFile, 1024);
const idCardB64 = await resizeImage(idCardFile, 1024);

await apiCall('registerUser', {
  fullName, nickName, phone, email,
  selfieBase64: selfieB64,
  idCardBase64: idCardB64,
});
// → แสดง "กำลังตรวจสอบ รอ admin อนุมัติ"
```

## Backend: `Onboarding.gs`

### `registerUser(args)`

```js
function registerUser(args) {
  const uid = args.lineUserId;
  if (!uid) return { ok: false, error: 'no_line_user_id' };

  // 1) เช็คว่ามี Employee อยู่แล้วไหม
  const existing = findEmployee(uid);
  if (existing) {
    return existing.is_banned
      ? { ok: false, error: 'banned' }
      : { ok: false, error: 'already_registered' };
  }

  // 2) เช็ค pending request ที่ค้างอยู่
  const pending = rows('PendingUsers').filter(p =>
    String(p.line_user_id) === String(uid) && p.status === 'pending'
  );
  if (pending.length > 0) {
    return { ok: false, error: 'pending_review' };
  }

  // 3) validate
  if (!args.fullName || args.fullName.length < 3) return { ok: false, error: 'invalid_full_name' };
  if (!args.nickName) return { ok: false, error: 'invalid_nick_name' };
  if (!args.phone || normPhone(args.phone).length < 9) return { ok: false, error: 'invalid_phone' };
  if (!args.selfieBase64) return { ok: false, error: 'no_selfie' };
  if (!args.idCardBase64) return { ok: false, error: 'no_id_card' };

  // 4) upload to Drive
  const folder = getOrCreatePendingFolder_();
  const stamp = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmmss');
  const safeName = args.fullName.replace(/[^\u0E00-\u0E7Fa-zA-Z0-9 ]/g, '').slice(0, 30);

  const selfieUrl = uploadBase64_(folder, args.selfieBase64,
    `${stamp}_${safeName}_selfie.jpg`);
  const idCardUrl = uploadBase64_(folder, args.idCardBase64,
    `${stamp}_${safeName}_idcard.jpg`);

  // 5) insert PendingUsers
  const pendingId = nextRunning('PEND', 'PendingUsers', 'pending_id');
  appendRow('PendingUsers', {
    pending_id: pendingId,
    line_user_id: uid,
    line_display_name: args.lineDisplayName || '',
    full_name: args.fullName,
    nick_name: args.nickName,
    phone: normPhone(args.phone),
    email: args.email || '',
    selfie_url: selfieUrl,
    id_card_url: idCardUrl,
    requested_at: nowBkk(),
    status: 'pending',
    reviewed_by: '', reviewed_at: '', rejection_reason: '',
  });

  // 6) audit
  audit({
    actor: uid, actorRole: 'guest',
    action: 'user.register',
    targetType: 'pending_user', targetId: pendingId,
    before: null,
    after: { full_name: args.fullName, nick_name: args.nickName, phone: args.phone },
  });

  // 7) push flex → owner + manager ทุกคน
  notifyApprovers_(pendingId);

  return { ok: true, pendingId: pendingId };
}

function uploadBase64_(folder, b64, filename) {
  const bytes = Utilities.base64Decode(b64);
  const blob = Utilities.newBlob(bytes, 'image/jpeg', filename);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  return file.getUrl();
}

function getOrCreatePendingFolder_() {
  const folderName = 'TikTok CRM - Pending Users';
  const it = DriveApp.getFoldersByName(folderName);
  return it.hasNext() ? it.next() : DriveApp.createFolder(folderName);
}

function notifyApprovers_(pendingId) {
  const pending = findOne('PendingUsers', 'pending_id', pendingId);
  // owners
  rows('Owners').forEach(o => {
    if (o.line_user_id) pushFlex(o.line_user_id, cardNewUserPending(pending));
  });
  // managers (active)
  rows('Employees').filter(e =>
    String(e.role) === 'manager' && isActive(e) && !e.is_banned && e.line_user_id
  ).forEach(m => pushFlex(m.line_user_id, cardNewUserPending(pending)));
}
```

### `approvePendingUser(args)`

```js
function approvePendingUser(args) {
  const uid = args.lineUserId;
  if (!isManager(uid) && !isOwner(uid)) return { ok: false, error: 'forbidden' };

  const pendingId = args.pendingId;
  const decision = args.decision; // 'approve' | 'reject'
  const pending = findOne('PendingUsers', 'pending_id', pendingId);
  if (!pending) return { ok: false, error: 'not_found' };
  if (String(pending.status) !== 'pending') return { ok: false, error: 'already_reviewed' };

  const me = findEmployee(uid) || { employee_id: 'OWNER', role: 'owner' };

  return withLock(function () {
    if (decision === 'reject') {
      updateRow('PendingUsers', pending._row, {
        status: 'rejected',
        reviewed_by: me.employee_id,
        reviewed_at: nowBkk(),
        rejection_reason: args.rejectionReason || '',
      });
      audit({
        actor: uid, actorRole: me.role,
        action: 'user.reject',
        targetType: 'pending_user', targetId: pendingId,
        before: { status: 'pending' },
        after: { status: 'rejected', reason: args.rejectionReason },
      });
      pushFlex(pending.line_user_id, cardUserRejected(pending, args.rejectionReason));
      return { ok: true, decision: 'rejected' };
    }

    // approve
    const role = args.role || 'staff'; // 'staff' | 'lead' | 'manager'
    const team = args.team || '';
    const reportTo = args.reportTo || me.employee_id; // default → ผู้ approve
    const skus = Array.isArray(args.productSkus) ? args.productSkus : [];

    // owner ห้ามแต่งตั้ง owner ผ่าน flow นี้
    if (role === 'owner') return { ok: false, error: 'cannot_create_owner_via_approval' };

    const empId = nextRunning('EMP', 'Employees', 'employee_id');
    appendRow('Employees', {
      employee_id: empId,
      line_user_id: pending.line_user_id,
      display_name: pending.nick_name,
      full_name: pending.full_name,
      phone: pending.phone,
      email: pending.email,
      role: role,
      team: team,
      report_to: reportTo,
      selfie_url: pending.selfie_url,
      id_card_url: pending.id_card_url,
      is_active: true,
      is_banned: false,
      ban_reason: '',
      joined_at: nowBkk(),
      approved_by: me.employee_id,
      approved_at: nowBkk(),
      inactivated_at: '',
      banned_at: '',
    });

    // ผูก products
    skus.forEach(sku => {
      appendRow('ProductAssignments', {
        assignment_id: nextRunning('PA', 'ProductAssignments', 'assignment_id'),
        employee_id: empId,
        sku: sku,
        assigned_at: nowBkk(),
        assigned_by: me.employee_id,
        is_active: true,
      });
    });

    updateRow('PendingUsers', pending._row, {
      status: 'approved',
      reviewed_by: me.employee_id,
      reviewed_at: nowBkk(),
    });

    audit({
      actor: uid, actorRole: me.role,
      action: 'user.approve',
      targetType: 'pending_user', targetId: pendingId,
      before: { status: 'pending' },
      after: { status: 'approved', employee_id: empId, role: role, team: team, skus: skus },
    });

    // push card → user
    const emp = findOne('Employees', 'employee_id', empId);
    pushFlex(emp.line_user_id, cardUserApproved(emp, skus));

    return { ok: true, decision: 'approved', employeeId: empId };
  });
}
```

## UI flow บน Owner page

```
?page=owner&tab=pending
→ list pending users with [ดู] button
→ คลิก → modal:
    - แสดงรูป selfie + บัตร (img src=drive url ต้องเปิด sharing เป็น "anyone with link can view" ชั่วคราว หรือ thumbnail)
    - form: role select (staff/lead/manager), team input, reportTo select, sku multi-select
    - [อนุมัติ] [ปฏิเสธ + เหตุผล]
```

## Privacy

- Drive folder ตั้ง PRIVATE
- URL ใน Sheet เป็น drive.google.com/file/d/... — เปิดได้เฉพาะคนใน Workspace ของพี่ปุ้ย
- Cleanup: หลัง approved/rejected 90 วัน → optional cron ลบรูป (ทำใน Phase 12)
