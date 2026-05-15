/**
 * Allocation.gs — Tier 1+2 allocation algorithm
 * ดู docs/lead-allocation.md
 *
 * Cron jobs:
 *   06:00 prepareMorningQueue() — pick Tier 2 ให้ทุก employee active (status=hold)
 *   09:30 checkClockInDeadline() — no-show → release Tier 2 + push lead [คืน/ยกเลิก]
 *   18:00 endOfDayCleanup() — release Tier 2 ที่ไม่โทร + auto-cancel + auto-clock-out
 */

function prepareMorningQueue() {
  try {
    const today = todayBkk();
    const cfg = getConfig();
    const quota = Number(cfg.tier2_daily_quota) || 30;

    const employees = rows('Employees').filter(function (e) { return isActive(e); });
    let createdHolds = 0;

    employees.forEach(function (emp) {
      try {
        if (isOnLeaveToday(emp.employee_id)) {
          _upsertAttendance_(emp.employee_id, today, 'leave');
          return;
        }
        _upsertAttendance_(emp.employee_id, today, 'pending');

        const mySkus = rows('ProductAssignments').filter(function (a) {
          return String(a.employee_id) === String(emp.employee_id) && isTruthy(a.is_active);
        }).map(function (a) { return String(a.sku); });
        if (mySkus.length === 0) return;

        const heldLeadIds = new Set(
          rows('LeadHolds').filter(function (h) { return !h.released_at; })
            .map(function (h) { return String(h.lead_id); })
        );
        const custMap = {};
        rows('Customers').forEach(function (c) { custMap[c.customer_id] = c; });

        const candidates = rows('Leads').filter(function (l) {
          if (l.assigned_to) return false;
          if (mySkus.indexOf(String(l.primary_sku)) < 0) return false;
          if (heldLeadIds.has(String(l.lead_id))) return false;
          const c = custMap[l.customer_id];
          if (c && isTruthy(c.blacklist)) return false;
          return true;
        });

        const picks = candidates.slice(0, quota);
        const deadlineIso = today + 'T' + (cfg.clock_in_deadline || '09:30') + ':00+07:00';

        picks.forEach(function (lead) {
          createHold_(lead.lead_id, emp.employee_id, 'clock_in_pending', deadlineIso);
          updateRow('Leads', lead._row, {
            assigned_to: emp.employee_id, assigned_at: nowBkk(),
            assignment_reason: 'tier2_morning',
            tier: 2, held_status: 'held', bucket_date: today,
            status: 'pending',
          });
          createdHolds++;
        });

        audit({
          actor: 'SYSTEM', actorRole: 'system',
          action: 'lead.tier2_picked',
          targetType: 'attendance', targetId: emp.employee_id + ':' + today,
          before: null, after: { picked: picks.length },
        });
      } catch (e) { logError('prepareMorningQueue.emp', emp.employee_id + ': ' + e.message); }
    });

    logInfo('prepareMorningQueue', 'done', { employees: employees.length, holds: createdHolds });
    return { ok: true, employees: employees.length, holdsCreated: createdHolds };
  } catch (e) { logError('prepareMorningQueue', e.message); return { ok: false, error: e.message }; }
}

function checkClockInDeadline() {
  try {
    const today = todayBkk();
    const employees = rows('Employees').filter(function (e) { return isActive(e); });
    let noShow = 0;

    employees.forEach(function (emp) {
      try {
        const att = findAttendance_(emp.employee_id, today);
        if (!att) return;
        if (['leave', 'banned'].indexOf(String(att.status)) >= 0) return;
        if (att.clock_in_at) return;

        updateRow('Attendance', att._row, { status: 'no_show' });

        const holds = rows('LeadHolds').filter(function (h) {
          return String(h.held_by_employee_id) === String(emp.employee_id)
            && String(h.reason) === 'clock_in_pending' && !h.released_at;
        });
        let released = 0;
        holds.forEach(function (h) {
          releaseHold_(h, 'no_show');
          const lead = findOne('Leads', 'lead_id', h.lead_id);
          if (lead) {
            updateRow('Leads', lead._row, {
              assigned_to: '', assignment_reason: 'released_no_show',
              tier: '', held_status: 'released', status: 'unassigned',
            });
            released++;
          }
        });

        audit({
          actor: 'SYSTEM', actorRole: 'system',
          action: 'attendance.no_show',
          targetType: 'attendance', targetId: emp.employee_id + ':' + today,
          before: null, after: { holds_released: released },
        });

        try {
          _getApproverLineUids_(emp).forEach(function (uid) {
            pushFlex(uid, cardNoShowDecision(emp, released));
          });
        } catch (e) { logError('noShow.push', e.message); }
        noShow++;
      } catch (e) { logError('checkClockInDeadline.emp', emp.employee_id + ': ' + e.message); }
    });

    logInfo('checkClockInDeadline', 'done', { no_show: noShow });
    return { ok: true, noShow: noShow };
  } catch (e) { logError('checkClockInDeadline', e.message); return { ok: false, error: e.message }; }
}

function endOfDayCleanup() {
  try {
    const today = todayBkk();

    // auto-cancel no_show ค้าง
    const noShowAtt = rows('Attendance').filter(function (a) {
      return String(a.date) === today && String(a.status) === 'no_show';
    });
    noShowAtt.forEach(function (a) {
      updateRow('Attendance', a._row, { status: 'cancelled' });
    });

    // release Tier 2 ที่ไม่โทร
    const calledLeadIds = new Set();
    rows('CallLogs').forEach(function (cl) {
      if (String(cl.created_at || '').indexOf(today) === 0) calledLeadIds.add(String(cl.lead_id));
    });
    const tier2Today = rows('Leads').filter(function (l) {
      return String(l.tier) === '2' && String(l.bucket_date) === today
        && (String(l.held_status) === 'held' || String(l.held_status) === 'active')
        && ['pending', 'no_answer', 'postponed'].indexOf(String(l.status)) >= 0;
    });
    let released = 0;
    tier2Today.forEach(function (l) {
      if (calledLeadIds.has(String(l.lead_id))) return;
      updateRow('Leads', l._row, {
        assigned_to: '', assignment_reason: 'released_eod',
        tier: '', held_status: 'released', status: 'unassigned',
      });
      const hold = getActiveHoldForLead_(l.lead_id);
      if (hold) releaseHold_(hold, 'eod');
      released++;
    });

    // auto clock-out
    const activeNoOut = rows('Attendance').filter(function (a) {
      return String(a.date) === today && a.clock_in_at && !a.clock_out_at
        && ['active', 'late'].indexOf(String(a.status)) >= 0;
    });
    activeNoOut.forEach(function (a) {
      updateRow('Attendance', a._row, { clock_out_at: nowBkk(), status: 'auto_out' });
    });

    audit({
      actor: 'SYSTEM', actorRole: 'system',
      action: 'allocation.eod_cleanup',
      targetType: 'system', targetId: today,
      before: null,
      after: { tier2_released: released, auto_cancelled: noShowAtt.length, auto_clocked_out: activeNoOut.length },
    });

    logInfo('endOfDayCleanup', 'done', { tier2_released: released, auto_cancelled: noShowAtt.length });
    return { ok: true, tier2Released: released };
  } catch (e) { logError('endOfDayCleanup', e.message); return { ok: false, error: e.message }; }
}

/* ===== Lead actions (Lead กดจาก flex) ===== */

function restoreSlot(args) {
  const uid = args.lineUserId;
  if (!isLead(uid) && !isOwner(uid)) return { ok: false, error: 'forbidden' };
  const empId = args.employeeId;
  if (!empId) return { ok: false, error: 'no_employee_id' };

  return withLock(function () {
    const emp = findOne('Employees', 'employee_id', empId);
    if (!emp) return { ok: false, error: 'employee_not_found' };
    const today = todayBkk();
    const att = findAttendance_(empId, today);
    if (!att) return { ok: false, error: 'no_attendance_today' };
    if (['no_show', 'cancelled'].indexOf(String(att.status)) < 0) return { ok: false, error: 'not_no_show' };

    const cfg = getConfig();
    const quota = Number(cfg.tier2_daily_quota) || 30;
    const mySkus = rows('ProductAssignments').filter(function (a) {
      return String(a.employee_id) === String(empId) && isTruthy(a.is_active);
    }).map(function (a) { return String(a.sku); });
    if (mySkus.length === 0) return { ok: false, error: 'no_skus' };

    const heldLeadIds = new Set(
      rows('LeadHolds').filter(function (h) { return !h.released_at; }).map(function (h) { return String(h.lead_id); })
    );
    const custMap = {};
    rows('Customers').forEach(function (c) { custMap[c.customer_id] = c; });
    const candidates = rows('Leads').filter(function (l) {
      if (l.assigned_to) return false;
      if (mySkus.indexOf(String(l.primary_sku)) < 0) return false;
      if (heldLeadIds.has(String(l.lead_id))) return false;
      const c = custMap[l.customer_id];
      if (c && isTruthy(c.blacklist)) return false;
      return true;
    });

    const picks = candidates.slice(0, quota);
    picks.forEach(function (lead) {
      createHold_(lead.lead_id, empId, 'restored', '');
      updateRow('Leads', lead._row, {
        assigned_to: empId, assigned_at: nowBkk(), assignment_reason: 'restored',
        tier: 2, held_status: 'active', bucket_date: today, status: 'pending',
      });
    });

    updateRow('Attendance', att._row, { status: 'late' });
    audit({
      actor: uid, actorRole: (findEmployee(uid) || {}).role || 'lead',
      action: 'lead.slot_restored',
      targetType: 'attendance', targetId: empId + ':' + today,
      before: { status: att.status }, after: { status: 'late', restored: picks.length },
    });
    if (emp.line_user_id) {
      try { pushFlex(emp.line_user_id, cardSlotRestored(picks.length)); } catch (e) {}
    }
    return { ok: true, restored: picks.length };
  });
}

function cancelSlot(args) {
  const uid = args.lineUserId;
  if (!isLead(uid) && !isOwner(uid)) return { ok: false, error: 'forbidden' };
  const empId = args.employeeId;
  if (!empId) return { ok: false, error: 'no_employee_id' };

  return withLock(function () {
    const today = todayBkk();
    const att = findAttendance_(empId, today);
    if (!att) return { ok: false, error: 'no_attendance_today' };

    updateRow('Attendance', att._row, { status: 'cancelled' });

    const releasedHolds = rows('LeadHolds').filter(function (h) {
      return String(h.held_by_employee_id) === String(empId)
        && String(h.released_reason) === 'no_show'
        && String(h.released_at).indexOf(today) === 0;
    });

    const allEmps = rows('Employees').filter(function (e) {
      return isActive(e) && String(e.employee_id) !== String(empId)
        && !isOnLeaveToday(e.employee_id) && isOnDutyNow(e.employee_id);
    });
    const skuPeers = {};
    rows('ProductAssignments').forEach(function (pa) {
      if (!isTruthy(pa.is_active)) return;
      if (!allEmps.find(function (x) { return String(x.employee_id) === String(pa.employee_id); })) return;
      if (!skuPeers[pa.sku]) skuPeers[pa.sku] = [];
      skuPeers[pa.sku].push(pa.employee_id);
    });

    const redist = {};
    let rrIdx = 0;
    releasedHolds.forEach(function (h) {
      const lead = findOne('Leads', 'lead_id', h.lead_id);
      if (!lead || lead.assigned_to) return;
      const peers = skuPeers[lead.primary_sku] || [];
      if (peers.length === 0) return;
      const newOwner = peers[rrIdx % peers.length]; rrIdx++;
      createHold_(lead.lead_id, newOwner, 'redistributed', '');
      updateRow('Leads', lead._row, {
        assigned_to: newOwner, assigned_at: nowBkk(),
        assignment_reason: 'redistributed', tier: 2, held_status: 'active',
        bucket_date: today, status: 'pending',
      });
      redist[newOwner] = (redist[newOwner] || 0) + 1;
    });

    Object.keys(redist).forEach(function (peerId) {
      const e = allEmps.find(function (x) { return String(x.employee_id) === String(peerId); });
      if (e && e.line_user_id) {
        try { pushFlex(e.line_user_id, cardSlotIncreased(redist[peerId])); } catch (err) {}
      }
    });

    audit({
      actor: uid, actorRole: (findEmployee(uid) || {}).role || 'lead',
      action: 'lead.slot_cancelled',
      targetType: 'attendance', targetId: empId + ':' + today,
      before: { status: att.status }, after: { status: 'cancelled', redistributed: redist },
    });
    return { ok: true, redistributed: redist };
  });
}

/* ===== Internal ===== */

function _upsertAttendance_(empId, dateStr, status) {
  const att = findAttendance_(empId, dateStr);
  if (att) {
    if (String(att.status) === 'pending') {
      updateRow('Attendance', att._row, { status: status });
    }
    return;
  }
  appendRow('Attendance', {
    attendance_id: nextDated('ATT', 'Attendance', 'attendance_id'),
    employee_id: empId, date: dateStr,
    clock_in_at: '', clock_out_at: '', status: status,
    tier1_count: 0, tier2_count: 0,
    calls_made: 0, calls_answered: 0, orders_closed: 0, revenue: 0,
    total_duration_seconds: 0, note: '',
  });
}

function _getApproverLineUids_(emp) {
  const uids = [];
  if (emp.report_to) {
    const sup = findOne('Employees', 'employee_id', emp.report_to);
    if (sup && isActive(sup) && sup.line_user_id) uids.push(sup.line_user_id);
  }
  if (uids.length === 0) {
    rows('Owners').forEach(function (o) { if (o.line_user_id) uids.push(o.line_user_id); });
  }
  return uids;
}

/* ===== Stub flex cards ===== */

function cardNoShowDecision(emp, releasedCount) {
  return {
    type: 'flex',
    altText: emp.display_name + ' ไม่ clock-in — ปล่อย ' + releasedCount + ' เบอร์',
    contents: {
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'sm', contents: [
        { type: 'text', text: '⚠️ พนักงานไม่ clock-in', weight: 'bold', size: 'md' },
        { type: 'text', text: emp.display_name + ' · ' + (emp.team || '-'), size: 'sm' },
        { type: 'text', text: 'Tier 2 ปล่อยแล้ว ' + releasedCount + ' เบอร์', size: 'sm', color: '#6b7280' },
        { type: 'text', text: 'EMP: ' + emp.employee_id, size: 'xs', color: '#9ca3af' },
      ]},
    },
  };
}

function cardSlotRestored(count) {
  return {
    type: 'flex',
    altText: 'คืน Tier 2 ' + count + ' เบอร์',
    contents: {
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'sm', contents: [
        { type: 'text', text: '✓ คืน Tier 2 ให้แล้ว', weight: 'bold' },
        { type: 'text', text: count + ' เบอร์', size: 'sm' },
      ]},
    },
  };
}

function cardSlotIncreased(count) {
  return {
    type: 'flex',
    altText: 'ได้รับเบอร์เพิ่ม ' + count + ' เบอร์',
    contents: {
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'sm', contents: [
        { type: 'text', text: '📈 ได้รับเบอร์เพิ่ม', weight: 'bold' },
        { type: 'text', text: count + ' เบอร์ (re-distribute)', size: 'sm' },
      ]},
    },
  };
}
