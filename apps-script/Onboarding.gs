/**
 * Onboarding.gs — registration + approval
 *
 * ดู docs/onboarding-flow.md สำหรับ spec ละเอียด
 *
 * Functions:
 *   registerUser(args)        — user-side: รับฟอร์มใหม่
 *   getPendingUsers(args)     — owner/manager: list ขอ approve
 *   approvePendingUser(args)  — owner/manager: approve/reject
 */

function registerUser(args) {
  const uid = args.lineUserId;
  if (!uid) return { ok: false, error: 'no_line_user_id' };

  // เช็คว่ามี Employee อยู่แล้ว
  const existing = findEmployee(uid);
  if (existing) {
    if (isTruthy(existing.is_banned)) return { ok: false, error: 'banned', reason: existing.ban_reason };
    return { ok: false, error: 'already_registered' };
  }
  // เช็ค pending
  const pending = rows('PendingUsers').filter(function (p) {
    return String(p.line_user_id) === String(uid) && String(p.status) === 'pending';
  });
  if (pending.length > 0) return { ok: false, error: 'pending_review', pendingId: pending[0].pending_id };

  // validate
  if (!args.fullName || String(args.fullName).length < 3) return { ok: false, error: 'invalid_full_name' };
  if (!args.nickName) return { ok: false, error: 'invalid_nick_name' };
  if (!args.phone || normPhone(args.phone).length < 9) return { ok: false, error: 'invalid_phone' };
  if (!args.selfieBase64) return { ok: false, error: 'no_selfie' };
  if (!args.idCardBase64) return { ok: false, error: 'no_id_card' };

  // upload to Drive
  const folder = _getUploadFolder();
  const stamp = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmmss');
  const safe = String(args.fullName).replace(/[^\u0E00-\u0E7Fa-zA-Z0-9 ]/g, '').slice(0, 30);
  const selfieUrl = _uploadBase64(folder, args.selfieBase64, stamp + '_' + safe + '_selfie.jpg');
  const idCardUrl = _uploadBase64(folder, args.idCardBase64, stamp + '_' + safe + '_idcard.jpg');

  // insert
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

  audit({
    actor: uid, actorRole: 'guest',
    action: 'user.register',
    targetType: 'pending_user', targetId: pendingId,
    before: null,
    after: { full_name: args.fullName, nick_name: args.nickName, phone: args.phone },
  });

  // push to approvers
  try { _notifyApprovers(pendingId); }
  catch (e) { logError('registerUser.notify', e.message); }

  return { ok: true, pendingId: pendingId };
}

function getPendingUsers(args) {
  if (!isManager(args.lineUserId) && !isOwner(args.lineUserId)) {
    return { ok: false, error: 'forbidden' };
  }
  const all = rows('PendingUsers').filter(function (p) {
    return String(p.status) === 'pending';
  }).sort(function (a, b) {
    return String(b.requested_at).localeCompare(String(a.requested_at));
  });
  return {
    ok: true,
    pending: all.map(function (p) {
      return {
        pendingId: p.pending_id,
        lineUserId: p.line_user_id,
        lineDisplayName: p.line_display_name,
        fullName: p.full_name,
        nickName: p.nick_name,
        phone: p.phone,
        email: p.email,
        selfieUrl: p.selfie_url,
        idCardUrl: p.id_card_url,
        requestedAt: p.requested_at,
      };
    }),
  };
}

function approvePendingUser(args) {
  const uid = args.lineUserId;
  if (!isManager(uid) && !isOwner(uid)) return { ok: false, error: 'forbidden' };

  const pending = findOne('PendingUsers', 'pending_id', args.pendingId);
  if (!pending) return { ok: false, error: 'not_found' };
  if (String(pending.status) !== 'pending') return { ok: false, error: 'already_reviewed' };

  const me = findEmployee(uid) || { employee_id: 'OWNER', role: 'owner' };
  const decision = args.decision; // 'approve' | 'reject'

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
        targetType: 'pending_user', targetId: args.pendingId,
        before: { status: 'pending' },
        after: { status: 'rejected', reason: args.rejectionReason },
      });
      try {
        pushFlex(pending.line_user_id, cardUserRejected(pending, args.rejectionReason || ''));
      } catch (e) { logError('approve.reject.push', e.message); }
      return { ok: true, decision: 'rejected' };
    }

    // approve — validate role values
    const role = String(args.role || 'staff').toLowerCase();
    if (['staff', 'lead', 'manager'].indexOf(role) < 0) {
      return { ok: false, error: 'invalid_role', allowed: ['staff', 'lead', 'manager'] };
    }

    const team = args.team || '';
    const reportTo = args.reportTo || me.employee_id;
    const skus = Array.isArray(args.productSkus) ? args.productSkus : [];

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

    skus.forEach(function (sku) {
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
      targetType: 'pending_user', targetId: args.pendingId,
      before: { status: 'pending' },
      after: { status: 'approved', employee_id: empId, role: role, team: team, skus: skus },
    });

    try {
      const emp = findOne('Employees', 'employee_id', empId);
      pushFlex(emp.line_user_id, cardUserApproved(emp, skus));
    } catch (e) { logError('approve.push', e.message); }

    return { ok: true, decision: 'approved', employeeId: empId };
  });
}

/* ===== Internal ===== */

function _getUploadFolder() {
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty('DRIVE_FOLDER_ID');
  if (folderId) {
    try { return DriveApp.getFolderById(folderId); }
    catch (e) { /* fall through */ }
  }
  const folder = DriveApp.createFolder('TikTok CRM - Uploads');
  props.setProperty('DRIVE_FOLDER_ID', folder.getId());
  return folder;
}

function _uploadBase64(folder, b64, filename) {
  const clean = String(b64).replace(/^data:[^,]+,/, '');
  const bytes = Utilities.base64Decode(clean);
  const blob = Utilities.newBlob(bytes, 'image/jpeg', filename);
  const file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); }
  catch (e) {}
  return file.getUrl();
}

function _notifyApprovers(pendingId) {
  const pending = findOne('PendingUsers', 'pending_id', pendingId);
  if (!pending) return;
  const card = cardNewUserPending(pending);

  // รวม owners + active managers แล้ว dedup (manager บางคนอาจอยู่ทั้ง Owners และ Employees)
  const seen = new Set();
  rows('Owners').forEach(function (o) { if (o.line_user_id) seen.add(String(o.line_user_id)); });
  rows('Employees').forEach(function (e) {
    if (String(e.role) === 'manager' && isActive(e) && e.line_user_id) {
      seen.add(String(e.line_user_id));
    }
  });
  seen.forEach(function (uid) {
    try { pushFlex(uid, card); } catch (e) {}
  });
}
