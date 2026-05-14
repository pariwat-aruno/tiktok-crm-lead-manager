/**
 * Leave.gs — ระบบลางาน
 *
 * Override _isOnLeaveTodayImpl เพื่อให้ Auth.gs ใช้ได้
 */

function _isOnLeaveTodayImpl(employeeId) {
  if (!employeeId) return false;
  const today = todayBkk();
  const t = new Date(today + 'T12:00:00+07:00').getTime();
  return rows('Leaves').some(function (l) {
    if (String(l.employee_id) !== String(employeeId)) return false;
    if (String(l.status) !== 'approved') return false;
    const start = new Date(l.start_date).getTime();
    const end = new Date(String(l.end_date) + 'T23:59:59+07:00').getTime();
    return start <= t && t <= end;
  });
}

function requestLeave(args) {
  const uid = args.lineUserId;
  if (!isStaff(uid)) return { ok: false, error: 'not_staff' };
  const emp = findEmployee(uid);
  if (!emp) return { ok: false, error: 'no_employee' };

  const start = args.startDate, end = args.endDate;
  if (!start || !end) return { ok: false, error: 'no_dates' };
  if (new Date(start) > new Date(end)) return { ok: false, error: 'invalid_range' };
  if (new Date(start) < addDays(new Date(), -1)) return { ok: false, error: 'cannot_leave_in_past' };

  const cfg = getConfig();
  const maxDays = Number(cfg.leave_max_days) || 14;
  if (diffDays(new Date(end), new Date(start)) + 1 > maxDays) {
    return { ok: false, error: 'exceeds_max_days', maxDays: maxDays };
  }

  // เช็ค overlap
  const overlap = rows('Leaves').filter(function (l) {
    if (String(l.employee_id) !== String(emp.employee_id)) return false;
    if (['pending', 'approved'].indexOf(String(l.status)) < 0) return false;
    const ls = new Date(l.start_date).getTime();
    const le = new Date(l.end_date).getTime();
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    return !(le < s || ls > e);
  });
  if (overlap.length > 0) return { ok: false, error: 'overlap_existing' };

  const leaveId = nextRunning('LEAVE', 'Leaves', 'leave_id');
  appendRow('Leaves', {
    leave_id: leaveId,
    employee_id: emp.employee_id,
    start_date: start,
    end_date: end,
    leave_type: args.leaveType || 'personal',
    reason: args.reason || '',
    status: 'pending',
    requested_at: nowBkk(),
    reviewed_by: '', reviewed_at: '', rejection_reason: '',
  });

  audit({
    actor: uid, actorRole: emp.role,
    action: 'leave.requested',
    targetType: 'leave', targetId: leaveId,
    before: null,
    after: { start: start, end: end, type: args.leaveType, reason: args.reason },
  });

  // notify approver
  try {
    const approvers = _getApproversFor(emp);
    const leave = findOne('Leaves', 'leave_id', leaveId);
    const card = cardLeaveRequest(leave, emp);
    approvers.forEach(function (uid) { pushFlex(uid, card); });
  } catch (e) { logError('requestLeave.notify', e.message); }

  return { ok: true, leaveId: leaveId };
}

function approveLeave(args) {
  const uid = args.lineUserId;
  if (!isLead(uid) && !isManager(uid) && !isOwner(uid)) return { ok: false, error: 'forbidden' };

  const leave = findOne('Leaves', 'leave_id', args.leaveId);
  if (!leave) return { ok: false, error: 'not_found' };
  if (String(leave.status) !== 'pending') return { ok: false, error: 'already_reviewed' };

  const me = findEmployee(uid) || { employee_id: 'OWNER', role: 'owner' };
  const target = findOne('Employees', 'employee_id', leave.employee_id);
  if (!target) return { ok: false, error: 'target_not_found' };

  // scope
  if (!isOwner(uid)) {
    if (String(me.role) === 'lead' && !isInMyTeam(me, target)) {
      return { ok: false, error: 'out_of_scope' };
    }
    if (String(me.role) === 'manager' && !isInMyChain(me, target) && !isInMyTeam(me, target)) {
      return { ok: false, error: 'out_of_scope' };
    }
  }

  const approve = !!args.approve;

  return withLock(function () {
    updateRow('Leaves', leave._row, {
      status: approve ? 'approved' : 'rejected',
      reviewed_by: me.employee_id,
      reviewed_at: nowBkk(),
      rejection_reason: approve ? '' : (args.rejectionReason || ''),
    });

    audit({
      actor: uid, actorRole: me.role,
      action: approve ? 'leave.approved' : 'leave.rejected',
      targetType: 'leave', targetId: leave.leave_id,
      before: { status: 'pending' },
      after: { status: approve ? 'approved' : 'rejected', reviewer: me.employee_id },
    });

    // ถ้า approve และเริ่มลาแล้ว → reassign ทันที
    if (approve && new Date(leave.start_date) <= new Date()) {
      try { _reassignLeadsOf(target.employee_id); }
      catch (e) { logError('approveLeave.reassign', e.message); }
    }

    try {
      if (target.line_user_id) {
        pushFlex(target.line_user_id,
          approve ? cardLeaveApproved(leave) : cardLeaveRejected(leave, args.rejectionReason || ''));
      }
    } catch (e) {}

    return { ok: true, decision: approve ? 'approved' : 'rejected' };
  });
}

function cancelLeave(args) {
  const uid = args.lineUserId;
  const leave = findOne('Leaves', 'leave_id', args.leaveId);
  if (!leave) return { ok: false, error: 'not_found' };
  const emp = findEmployee(uid);
  if (!emp || String(emp.employee_id) !== String(leave.employee_id)) {
    return { ok: false, error: 'not_yours' };
  }
  if (['pending', 'approved'].indexOf(String(leave.status)) < 0) {
    return { ok: false, error: 'cannot_cancel' };
  }
  updateRow('Leaves', leave._row, { status: 'cancelled' });
  audit({
    actor: uid, actorRole: emp.role,
    action: 'leave.cancelled',
    targetType: 'leave', targetId: leave.leave_id,
    before: { status: leave.status }, after: { status: 'cancelled' },
  });
  return { ok: true };
}

function getMyLeaves(args) {
  const uid = args.lineUserId;
  if (!isStaff(uid)) return { ok: false, error: 'not_staff' };
  const emp = findEmployee(uid);
  const list = rows('Leaves').filter(function (l) {
    return String(l.employee_id) === String(emp.employee_id);
  }).sort(function (a, b) {
    return String(b.requested_at).localeCompare(String(a.requested_at));
  });
  return { ok: true, leaves: list };
}

function getPendingLeaves(args) {
  const uid = args.lineUserId;
  if (!isLead(uid) && !isManager(uid) && !isOwner(uid)) return { ok: false, error: 'forbidden' };

  const me = findEmployee(uid);
  const allPending = rows('Leaves').filter(function (l) { return String(l.status) === 'pending'; });
  const empMap = {};
  rows('Employees').forEach(function (e) { empMap[e.employee_id] = e; });

  // filter ตาม scope
  const filtered = allPending.filter(function (l) {
    if (isOwner(uid)) return true;
    const target = empMap[l.employee_id];
    if (!target) return false;
    if (String(me.role) === 'lead') return isInMyTeam(me, target);
    if (String(me.role) === 'manager') return isInMyChain(me, target) || isInMyTeam(me, target);
    return false;
  });

  return {
    ok: true,
    pending: filtered.map(function (l) {
      const t = empMap[l.employee_id] || {};
      return {
        leaveId: l.leave_id,
        employeeId: l.employee_id,
        employeeName: t.display_name || l.employee_id,
        startDate: l.start_date,
        endDate: l.end_date,
        leaveType: l.leave_type,
        reason: l.reason,
        requestedAt: l.requested_at,
      };
    }),
  };
}

/* ===== Internal ===== */

function _getApproversFor(emp) {
  const approvers = [];
  if (emp.report_to) {
    const sup = findOne('Employees', 'employee_id', emp.report_to);
    if (sup && isActive(sup) && sup.line_user_id) approvers.push(sup.line_user_id);
  }
  if (approvers.length === 0) {
    rows('Owners').forEach(function (o) { if (o.line_user_id) approvers.push(o.line_user_id); });
  }
  return approvers;
}

function _reassignLeadsOf(empId) {
  const pending = rows('Leads').filter(function (l) {
    return String(l.assigned_to) === String(empId) &&
           ['pending', 'no_answer', 'postponed'].indexOf(String(l.status)) >= 0;
  });
  let reassigned = 0;
  pending.forEach(function (l) {
    try {
      const customer = findOne('Customers', 'customer_id', l.customer_id);
      if (!customer) return;
      const newOwner = resolveOwner({
        customer: customer,
        primarySku: l.primary_sku || '',
        excludeEmployeeIds: [empId],
      });
      updateRow('Leads', l._row, {
        assigned_to: newOwner.employeeId,
        assigned_at: nowBkk(),
        assignment_reason: 'reassign_leave',
      });
      audit({
        actor: 'SYSTEM', actorRole: 'system',
        action: 'lead.reassigned',
        targetType: 'lead', targetId: l.lead_id,
        before: { assigned_to: empId },
        after: { assigned_to: newOwner.employeeId, reason: 'reassign_leave' },
      });
      reassigned++;
    } catch (e) { logError('reassignOnLeave', e.message); }
  });
  return reassigned;
}
