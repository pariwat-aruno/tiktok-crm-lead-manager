/**
 * TeamLead.gs — actions ของ "lead" (หัวหน้าทีม)
 * scope: ทีมของตน (Employees.team เดียวกัน)
 */

function getTeamDashboard(args) {
  const uid = args.lineUserId;
  if (!isLead(uid)) return { ok: false, error: 'not_lead' };

  const me = findEmployee(uid);
  const isFullScope = isManager(uid) || isOwner(uid);
  const allEmps = rows('Employees');

  const teamStaff = allEmps.filter(function (e) {
    if (String(e.role) !== 'staff') return false;
    if (!isActive(e)) return false;
    if (isFullScope) return true;
    return me && e.team === me.team;
  });

  const leads = rows('Leads');
  const calls = rows('CallLogs');
  const today = todayBkk();
  const now = Date.now();

  const stats = teamStaff.map(function (e) {
    const empLeads = leads.filter(function (l) { return String(l.assigned_to) === String(e.employee_id); });
    const pending = empLeads.filter(function (l) {
      return ['pending', 'no_answer', 'postponed'].indexOf(String(l.status)) >= 0;
    });
    const overdue = pending.filter(function (l) {
      return l.due_date && new Date(l.due_date).getTime() < now;
    });
    const closedToday = empLeads.filter(function (l) {
      return String(l.closed_at || '').indexOf(today) === 0;
    });
    const boughtToday = calls.filter(function (cl) {
      return String(cl.created_at || '').indexOf(today) === 0 &&
             cl.action === 'call_result' &&
             cl.result === 'bought' &&
             String(cl.employee_id) === String(e.employee_id);
    }).length;

    return {
      employeeId: e.employee_id,
      displayName: e.display_name,
      team: e.team || '',
      onLeave: isOnLeaveToday(e.employee_id),
      pending: pending.length,
      overdue: overdue.length,
      closedToday: closedToday.length,
      boughtToday: boughtToday,
    };
  });

  return { ok: true, stats: stats };
}

function getBlacklistRequests(args) {
  const uid = args.lineUserId;
  if (!isLead(uid)) return { ok: false, error: 'not_lead' };

  const me = findEmployee(uid);
  const isFullScope = isManager(uid) || isOwner(uid);
  const allEmps = rows('Employees');
  const empMap = {};
  allEmps.forEach(function (e) { empMap[e.employee_id] = e; });

  const requests = rows('Leads').filter(function (l) { return String(l.status) === 'blacklist_req'; });
  const custMap = {};
  rows('Customers').forEach(function (c) { custMap[c.customer_id] = c; });

  const filtered = requests.filter(function (l) {
    if (isFullScope) return true;
    const requester = empMap[l.assigned_to];
    return requester && me && requester.team === me.team;
  });

  return {
    ok: true,
    requests: filtered.map(function (l) {
      const c = custMap[l.customer_id] || {};
      const e = empMap[l.assigned_to] || {};
      return {
        leadId: l.lead_id,
        customerName: c.name || '',
        phone: c.phone || '',
        reason: l.note || '',
        requestedBy: e.display_name || l.assigned_to,
        requestedAt: l.assigned_at,
      };
    }),
  };
}

function approveBlacklist(args) {
  const uid = args.lineUserId;
  if (!isLead(uid)) return { ok: false, error: 'not_lead' };
  const approve = !!args.approve;

  return withLock(function () {
    const lead = findOne('Leads', 'lead_id', args.leadId);
    if (!lead) return { ok: false, error: 'lead_not_found' };
    if (String(lead.status) !== 'blacklist_req') return { ok: false, error: 'not_blacklist_req' };

    if (approve) {
      const cr = findRowIndex('Customers', 'customer_id', lead.customer_id);
      if (cr > 0) updateRow('Customers', cr, {
        blacklist: true, blacklist_reason: lead.note || '', updated_at: nowBkk(),
      });
      updateRow('Leads', lead._row, {
        status: 'closed', closed_at: nowBkk(),
        note: 'blacklist approved: ' + (lead.note || ''),
      });
    } else {
      updateRow('Leads', lead._row, {
        status: 'pending', note: 'blacklist rejected',
      });
    }

    audit({
      actor: uid, actorRole: (findEmployee(uid) || {}).role || 'lead',
      action: approve ? 'blacklist.approved' : 'blacklist.rejected',
      targetType: 'lead', targetId: lead.lead_id,
      before: { status: 'blacklist_req' },
      after: { status: approve ? 'closed' : 'pending', customer_blacklisted: approve },
    });

    return { ok: true, approve: approve };
  });
}

function getAuditCopy(args) {
  const uid = args.lineUserId;
  if (!isLead(uid)) return { ok: false, error: 'not_lead' };

  const me = findEmployee(uid);
  const isFullScope = isManager(uid) || isOwner(uid);
  const days = Number(args.days || 7);
  const cutoff = addDays(new Date(), -days);

  const empMap = {};
  rows('Employees').forEach(function (e) { empMap[e.employee_id] = e; });

  const calls = rows('CallLogs').filter(function (cl) {
    const t = new Date(cl.created_at);
    if (isNaN(t.getTime()) || t < cutoff) return false;
    if (isFullScope) return true;
    const e = empMap[cl.employee_id];
    return e && me && e.team === me.team;
  });

  const byEmp = {};
  calls.forEach(function (cl) {
    const id = String(cl.employee_id);
    if (!byEmp[id]) byEmp[id] = { copy: 0, call: 0 };
    if (cl.action === 'copy_phone') byEmp[id].copy++;
    else if (cl.action === 'call_result') byEmp[id].call++;
  });

  const threshold = Number(getConfig().copy_anomaly_threshold) || 20;
  const result = Object.keys(byEmp).map(function (id) {
    const s = byEmp[id];
    const e = empMap[id] || {};
    return {
      employeeId: id, displayName: e.display_name || id,
      copy: s.copy, call: s.call,
      ratio: s.call > 0 ? +(s.copy / s.call).toFixed(2) : (s.copy > 0 ? 999 : 0),
      anomaly: s.copy >= threshold && s.call === 0,
    };
  }).sort(function (a, b) { return b.copy - a.copy; });

  return { ok: true, days: days, threshold: threshold, stats: result };
}
