# Leave System

## Logic

```
1. Staff request → status=pending
2. Approver (lead/manager/owner) อนุมัติ → status=approved
3. ทุก function ที่ assign งาน → ต้องเช็ค isOnLeaveToday(employeeId)
4. ถ้าวันแรกของลามาถึง → cron reassign pending leads
5. วันลาผ่าน → auto กลับมา active (ไม่ต้องทำอะไรเพิ่ม — แค่ filter โดยวันที่)
```

## `Leave.gs`

### `requestLeave(args)` — staff

```js
function requestLeave(args) {
  const uid = args.lineUserId;
  if (!isStaff(uid)) return { ok: false, error: 'not_staff' };
  const emp = findEmployee(uid);

  // validate dates
  const start = args.startDate, end = args.endDate;
  if (!start || !end) return { ok: false, error: 'no_dates' };
  if (new Date(start) > new Date(end)) return { ok: false, error: 'invalid_range' };

  // ห้ามลาย้อนหลัง
  if (new Date(start) < addDays(new Date(), -1)) {
    return { ok: false, error: 'cannot_leave_in_past' };
  }

  // เช็คซ้ำ (overlap pending/approved)
  const overlap = rows('Leaves').filter(l =>
    String(l.employee_id) === String(emp.employee_id) &&
    ['pending', 'approved'].indexOf(String(l.status)) >= 0 &&
    !(new Date(l.end_date) < new Date(start) || new Date(l.start_date) > new Date(end))
  );
  if (overlap.length > 0) return { ok: false, error: 'overlap_existing_leave' };

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
    after: { start, end, type: args.leaveType, reason: args.reason },
  });

  // หา approver
  const approverIds = getApproversFor_(emp);
  approverIds.forEach(uid => pushFlex(uid, cardLeaveRequest(findOne('Leaves', 'leave_id', leaveId), emp)));

  return { ok: true, leaveId: leaveId };
}

function getApproversFor_(emp) {
  // ลำดับ: report_to → manager ในสายงาน → owner คนแรก
  if (emp.report_to) {
    const sup = findOne('Employees', 'employee_id', emp.report_to);
    if (sup && isActive(sup) && !sup.is_banned && sup.line_user_id) {
      return [sup.line_user_id];
    }
  }
  // fallback: ทุก owner
  return rows('Owners').map(o => o.line_user_id).filter(Boolean);
}
```

### `approveLeave(args)` — lead/manager/owner

```js
function approveLeave(args) {
  const uid = args.lineUserId;
  const leaveId = args.leaveId;
  const approve = !!args.approve;

  if (!isLead(uid) && !isManager(uid) && !isOwner(uid)) return { ok: false, error: 'forbidden' };

  const leave = findOne('Leaves', 'leave_id', leaveId);
  if (!leave) return { ok: false, error: 'not_found' };
  if (String(leave.status) !== 'pending') return { ok: false, error: 'already_reviewed' };

  const me = findEmployee(uid) || { employee_id: 'OWNER', role: 'owner' };
  const target = findOne('Employees', 'employee_id', leave.employee_id);

  // เช็ค scope: lead → ทีมตน, manager → สายงานตน
  if (isLead(uid) && !isOwner(uid) && !isManager(uid)) {
    if (me.team !== target.team) return { ok: false, error: 'out_of_scope' };
  }
  if (isManager(uid) && !isOwner(uid)) {
    if (!isInMyChain(me, target)) return { ok: false, error: 'out_of_scope' };
  }

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
      targetType: 'leave', targetId: leaveId,
      before: { status: 'pending' },
      after: { status: approve ? 'approved' : 'rejected', reviewer: me.employee_id },
    });

    // ถ้า approve และวันลาเริ่มวันนี้/ผ่านแล้ว → reassign leads ทันที
    if (approve && new Date(leave.start_date) <= new Date()) {
      reassignLeadsOfLeavingStaff_(target.employee_id);
    }

    // push back to user
    if (target.line_user_id) {
      pushFlex(target.line_user_id,
        approve ? cardLeaveApproved(leave) : cardLeaveRejected(leave, args.rejectionReason));
    }

    return { ok: true, decision: approve ? 'approved' : 'rejected' };
  });
}

function reassignLeadsOfLeavingStaff_(empId) {
  const pending = rows('Leads').filter(l =>
    String(l.assigned_to) === String(empId) &&
    ['pending', 'no_answer', 'postponed'].indexOf(String(l.status)) >= 0
  );
  let reassigned = 0;
  pending.forEach(l => {
    try {
      const customer = findOne('Customers', 'customer_id', l.customer_id);
      if (!customer) return;
      const newOwner = resolveOwner({
        customer: customer,
        primarySku: l.primary_sku,
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
```

### `isOnLeaveToday(employeeId)`

```js
function isOnLeaveToday(employeeId) {
  if (!employeeId) return false;
  const today = todayBkk();
  const t = new Date(today + 'T12:00:00+07:00').getTime();
  return rows('Leaves').some(l =>
    String(l.employee_id) === String(employeeId) &&
    String(l.status) === 'approved' &&
    new Date(l.start_date).getTime() <= t &&
    new Date(l.end_date + 'T23:59:59+07:00').getTime() >= t
  );
}
```

### `cancelLeave(args)` — เจ้าตัวเท่านั้น

```js
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
```

## Integration with Assign

`Assign.gs.resolveOwner()` — pseudo-code:

```js
function resolveOwner({ customer, primarySku, excludeEmployeeIds }) {
  const exclude = new Set(excludeEmployeeIds || []);
  // 1) get staff ที่ดูแล SKU นี้
  const assignments = rows('ProductAssignments').filter(a =>
    String(a.sku) === String(primarySku) &&
    (a.is_active === true || String(a.is_active).toUpperCase() === 'TRUE')
  );
  const allEmployees = rows('Employees');
  const empMap = {};
  allEmployees.forEach(e => empMap[e.employee_id] = e);

  let candidates = assignments
    .map(a => empMap[a.employee_id])
    .filter(e => e
      && isActive(e) && !e.is_banned
      && !isOnLeaveToday(e.employee_id)
      && !exclude.has(String(e.employee_id))
    );

  // 2) มี owner เดิม + ยังอยู่ใน candidates?
  if (customer && customer.owner_employee_id) {
    const inList = candidates.find(c => String(c.employee_id) === String(customer.owner_employee_id));
    if (inList) return { employeeId: inList.employee_id, method: 'inherit' };
  }

  // 3) round-robin
  if (candidates.length > 0) {
    return { employeeId: roundRobinPick(candidates), method: 'product_match' };
  }

  // 4) fallback → manager (active, ไม่ลา) แล้ว owner
  const managers = allEmployees.filter(e =>
    String(e.role) === 'manager' && isActive(e) && !e.is_banned
    && !isOnLeaveToday(e.employee_id) && !exclude.has(String(e.employee_id))
  );
  if (managers.length > 0) {
    return { employeeId: managers[0].employee_id, method: 'fallback_manager' };
  }
  const owners = rows('Owners');
  if (owners.length > 0) {
    return { employeeId: owners[0].line_user_id, method: 'fallback_owner' };
  }

  throw new Error('no_candidates_available');
}
```

## UI: `page-leave.html`

```
┌─────────────────────────┐
│ ขอลางาน                  │
├─────────────────────────┤
│ ประเภทการลา              │
│ ( ) ลาป่วย               │
│ ( ) ลากิจ                │
│ ( ) ลาพักร้อน            │
│ ( ) อื่นๆ                │
│                          │
│ วันเริ่ม * [date picker] │
│ วันสิ้นสุด *[date picker] │
│ เหตุผล                   │
│ [textarea]               │
│                          │
│ [ ส่งคำขอ ]              │
├─────────────────────────┤
│ ประวัติ                  │
│ ─ 1-3 ม.ค. (อนุมัติ)     │
│ ─ 5 ม.ค. (รออนุมัติ)     │
│   [ยกเลิก]               │
└─────────────────────────┘
```
