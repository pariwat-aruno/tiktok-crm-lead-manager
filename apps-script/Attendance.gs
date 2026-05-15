/**
 * Attendance.gs — clock-in/out รายวัน
 *
 * Status enum:
 *   pending   — รอ clock-in
 *   active    — clock-in ทันเวลา (≤ deadline)
 *   late      — clock-in หลัง deadline
 *   no_show   — ไม่ clock-in (set ตอน 09:30 cron)
 *   leave     — ลาวันนั้น
 *   banned    — โดน ban
 *   cancelled — Lead กดยกเลิกหลัง no_show
 *   auto_out  — auto clock-out ตอน 18:00
 */

function clockIn(args) {
  const uid = args.lineUserId;
  if (!isStaff(uid)) return { ok: false, error: 'not_staff' };
  const emp = findEmployee(uid);
  if (!emp) return { ok: false, error: 'no_employee' };

  const today = todayBkk();
  return withLock(function () {
    let att = findAttendance_(emp.employee_id, today);
    if (att && att.clock_in_at) {
      return { ok: false, error: 'already_clocked_in', clockInAt: att.clock_in_at };
    }
    if (att && String(att.status) === 'leave') {
      return { ok: false, error: 'on_leave_today' };
    }

    const cfg = getConfig();
    const deadline = _todayWithTime_(today, cfg.clock_in_deadline || '09:30');
    const status = new Date().getTime() <= deadline.getTime() ? 'active' : 'late';

    if (att) {
      updateRow('Attendance', att._row, { clock_in_at: nowBkk(), status: status });
    } else {
      appendRow('Attendance', {
        attendance_id: nextDated('ATT', 'Attendance', 'attendance_id'),
        employee_id: emp.employee_id,
        date: today,
        clock_in_at: nowBkk(),
        clock_out_at: '',
        status: status,
        tier1_count: 0, tier2_count: 0,
        calls_made: 0, calls_answered: 0, orders_closed: 0, revenue: 0,
        total_duration_seconds: 0,
        note: '',
      });
    }

    // confirm Tier 2 holds: clock_in_pending → released(clock_in_ok), held_status: held → active
    const holds = rows('LeadHolds').filter(function (h) {
      return String(h.held_by_employee_id) === String(emp.employee_id)
        && String(h.reason) === 'clock_in_pending'
        && !h.released_at;
    });
    holds.forEach(function (h) {
      updateRow('LeadHolds', h._row, {
        released_at: nowBkk(),
        released_reason: 'clock_in_ok',
      });
      const lead = findOne('Leads', 'lead_id', h.lead_id);
      if (lead) updateRow('Leads', lead._row, { held_status: 'active' });
    });

    audit({
      actor: uid, actorRole: emp.role,
      action: 'attendance.clock_in',
      targetType: 'attendance', targetId: emp.employee_id + ':' + today,
      before: null,
      after: { status: status, holds_confirmed: holds.length },
    });

    return { ok: true, status: status, holdsConfirmed: holds.length };
  });
}

function clockOut(args) {
  const uid = args.lineUserId;
  if (!isStaff(uid)) return { ok: false, error: 'not_staff' };
  const emp = findEmployee(uid);
  if (!emp) return { ok: false, error: 'no_employee' };

  const today = todayBkk();
  const att = findAttendance_(emp.employee_id, today);
  if (!att || !att.clock_in_at) return { ok: false, error: 'not_clocked_in' };
  if (att.clock_out_at) return { ok: false, error: 'already_clocked_out' };

  updateRow('Attendance', att._row, { clock_out_at: nowBkk() });
  audit({
    actor: uid, actorRole: emp.role,
    action: 'attendance.clock_out',
    targetType: 'attendance', targetId: emp.employee_id + ':' + today,
    before: null, after: { clock_out_at: nowBkk() },
  });
  return { ok: true };
}

function getAttendance(args) {
  const uid = args.lineUserId;
  if (!isStaff(uid)) return { ok: false, error: 'not_staff' };
  const emp = findEmployee(uid);
  if (!emp) return { ok: false, error: 'no_employee' };

  const today = todayBkk();
  const att = findAttendance_(emp.employee_id, today);
  if (!att) {
    return { ok: true, attendance: { date: today, status: 'pending', clockInAt: null, clockOutAt: null } };
  }
  return {
    ok: true,
    attendance: {
      date: att.date,
      status: att.status,
      clockInAt: att.clock_in_at || null,
      clockOutAt: att.clock_out_at || null,
    },
  };
}

/**
 * isOnDutyNow — เช็คว่าพนักงานคนนี้ clock-in อยู่ตอนนี้ไหม (ใช้ใน allocation/UI)
 */
function isOnDutyNow(empId) {
  if (!empId) return false;
  const att = findAttendance_(empId, todayBkk());
  if (!att || !att.clock_in_at || att.clock_out_at) return false;
  return ['active', 'late'].indexOf(String(att.status)) >= 0;
}

/* ===== Internal ===== */

function findAttendance_(empId, dateStr) {
  return rows('Attendance').find(function (a) {
    return String(a.employee_id) === String(empId) && String(a.date) === String(dateStr);
  });
}

function _todayWithTime_(dateStr, timeStr) {
  return new Date(dateStr + 'T' + timeStr + ':00+07:00');
}
