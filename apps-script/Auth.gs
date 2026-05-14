/**
 * Auth.gs — role + permission checking
 */

function findEmployee(lineUserId) {
  if (!lineUserId) return null;
  return findOne('Employees', 'line_user_id', lineUserId);
}

function isActive(emp) {
  if (!emp) return false;
  return isTruthy(emp.is_active) && !isTruthy(emp.is_banned);
}

function isOwner(lineUserId) {
  if (!lineUserId) return false;
  // Owners sheet override
  const o = findOne('Owners', 'line_user_id', lineUserId);
  if (o) return true;
  const emp = findEmployee(lineUserId);
  return emp && String(emp.role) === 'owner' && isActive(emp);
}

function isManager(lineUserId) {
  if (isOwner(lineUserId)) return true;
  const emp = findEmployee(lineUserId);
  return emp && String(emp.role) === 'manager' && isActive(emp);
}

function isLead(lineUserId) {
  if (isManager(lineUserId)) return true;
  const emp = findEmployee(lineUserId);
  return emp && String(emp.role) === 'lead' && isActive(emp);
}

function isStaff(lineUserId) {
  // active employee ทุก role
  if (!lineUserId) return false;
  const emp = findEmployee(lineUserId);
  return emp && isActive(emp);
}

function getMyRole(lineUserId) {
  if (!lineUserId) return { ok: false, error: 'no_line_user_id' };

  // Owner override
  const ownerRow = findOne('Owners', 'line_user_id', lineUserId);
  const emp = findEmployee(lineUserId);

  if (!emp && ownerRow) {
    return {
      ok: true, role: 'owner',
      employeeId: null,
      displayName: ownerRow.display_name || 'Owner',
    };
  }
  if (!emp) {
    // เช็ค pending request
    const pending = rows('PendingUsers').filter(function (p) {
      return String(p.line_user_id) === String(lineUserId) && String(p.status) === 'pending';
    });
    if (pending.length > 0) {
      return { ok: false, error: 'pending_review', pendingId: pending[0].pending_id };
    }
    return { ok: false, error: 'not_registered' };
  }
  if (isTruthy(emp.is_banned)) {
    return { ok: false, error: 'banned', reason: emp.ban_reason };
  }
  if (!isTruthy(emp.is_active)) {
    return { ok: false, error: 'inactive' };
  }
  return {
    ok: true,
    role: ownerRow ? 'owner' : emp.role,
    employeeId: emp.employee_id,
    displayName: emp.display_name,
    fullName: emp.full_name,
    team: emp.team,
  };
}

/* ===== Scope helpers ===== */
function isInMyTeam(me, target) {
  return me && target && me.team && me.team === target.team;
}

function isInMyChain(mgr, target) {
  if (!mgr || !target) return false;
  let cur = target;
  for (let depth = 0; depth < 10; depth++) {
    if (!cur || !cur.report_to) return false;
    if (String(cur.report_to) === String(mgr.employee_id)) return true;
    cur = findOne('Employees', 'employee_id', cur.report_to);
  }
  return false;
}

function getActiveCandidatesForSku(sku, excludeIds) {
  excludeIds = new Set((excludeIds || []).map(String));
  const assignments = rows('ProductAssignments').filter(function (a) {
    return String(a.sku) === String(sku) && isTruthy(a.is_active);
  });
  const empMap = {};
  rows('Employees').forEach(function (e) { empMap[e.employee_id] = e; });
  return assignments
    .map(function (a) { return empMap[a.employee_id]; })
    .filter(function (e) {
      return e && isActive(e) && !excludeIds.has(String(e.employee_id)) && !isOnLeaveToday(e.employee_id);
    });
}

function getAllActiveStaff() {
  return rows('Employees').filter(function (e) {
    return String(e.role) === 'staff' && isActive(e) && !isOnLeaveToday(e.employee_id);
  });
}

/**
 * isOnLeaveToday — เช็คว่าพนักงานคนนี้ลาวันนี้ไหม
 * (จะถูก implement ใน Leave.gs — ที่นี่ใส่ stub)
 */
function isOnLeaveToday(employeeId) {
  if (!employeeId) return false;
  if (typeof _isOnLeaveTodayImpl === 'function') return _isOnLeaveTodayImpl(employeeId);
  // stub: ถ้ายังไม่มี Leave.gs return false ตลอด
  return false;
}
