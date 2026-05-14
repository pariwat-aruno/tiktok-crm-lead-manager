/**
 * Manager.gs — actions ของ "manager"
 * scope: chain ตน (report_to → ทรงตัวเอง)
 */

function getManagerDashboard(args) {
  const uid = args.lineUserId;
  if (!isManager(uid)) return { ok: false, error: 'forbidden' };

  const me = findEmployee(uid);
  const isFullScope = isOwner(uid);
  const allEmps = rows('Employees');

  // หาทุกคนในสายงาน
  const inChain = allEmps.filter(function (e) {
    if (!isActive(e)) return false;
    if (isFullScope) return true;
    return me && isInMyChain(me, e);
  });

  const leads = rows('Leads');
  const calls = rows('CallLogs');
  const today = todayBkk();
  const now = Date.now();

  // จัดกลุ่มตาม team
  const teamsMap = {};
  inChain.forEach(function (e) {
    const team = e.team || '(ไม่มีทีม)';
    if (!teamsMap[team]) teamsMap[team] = { team: team, members: [], pending: 0, overdue: 0, boughtToday: 0 };
    teamsMap[team].members.push(e);
    const emp = e;
    const empLeads = leads.filter(function (l) { return String(l.assigned_to) === String(emp.employee_id); });
    teamsMap[team].pending += empLeads.filter(function (l) {
      return ['pending', 'no_answer', 'postponed'].indexOf(String(l.status)) >= 0;
    }).length;
    teamsMap[team].overdue += empLeads.filter(function (l) {
      return ['pending', 'no_answer', 'postponed'].indexOf(String(l.status)) >= 0 &&
        l.due_date && new Date(l.due_date).getTime() < now;
    }).length;
    teamsMap[team].boughtToday += calls.filter(function (cl) {
      return String(cl.created_at || '').indexOf(today) === 0 &&
             cl.action === 'call_result' && cl.result === 'bought' &&
             String(cl.employee_id) === String(emp.employee_id);
    }).length;
  });

  return {
    ok: true,
    teams: Object.values(teamsMap).map(function (t) {
      return {
        team: t.team, memberCount: t.members.length,
        pending: t.pending, overdue: t.overdue, boughtToday: t.boughtToday,
      };
    }),
  };
}

function getMyTeamMembers(args) {
  const uid = args.lineUserId;
  if (!isLead(uid)) return { ok: false, error: 'forbidden' };

  const me = findEmployee(uid);
  const isFullScope = isManager(uid) || isOwner(uid);
  const team = args.team || (me && me.team);

  const members = rows('Employees').filter(function (e) {
    if (!isActive(e)) return false;
    if (isFullScope) {
      return !team || e.team === team;
    }
    return me && e.team === me.team;
  });

  return {
    ok: true,
    members: members.map(function (e) {
      return {
        employeeId: e.employee_id, displayName: e.display_name,
        role: e.role, team: e.team || '',
        onLeave: isOnLeaveToday(e.employee_id),
      };
    }),
  };
}

function getTeamPerformance(args) {
  const uid = args.lineUserId;
  if (!isManager(uid)) return { ok: false, error: 'forbidden' };

  const days = Number(args.days || 7);
  const cutoff = addDays(new Date(), -days);
  const me = findEmployee(uid);
  const isFullScope = isOwner(uid);

  const allEmps = rows('Employees');
  const empMap = {};
  allEmps.forEach(function (e) { empMap[e.employee_id] = e; });

  const inScope = allEmps.filter(function (e) {
    if (String(e.role) !== 'staff' || !isActive(e)) return false;
    if (isFullScope) return true;
    return me && isInMyChain(me, e);
  });

  const calls = rows('CallLogs').filter(function (cl) {
    const t = new Date(cl.created_at);
    return !isNaN(t.getTime()) && t >= cutoff && cl.action === 'call_result';
  });

  const stats = inScope.map(function (e) {
    const empCalls = calls.filter(function (cl) { return String(cl.employee_id) === String(e.employee_id); });
    const bought = empCalls.filter(function (cl) { return cl.result === 'bought'; }).length;
    return {
      employeeId: e.employee_id, displayName: e.display_name, team: e.team || '',
      calls: empCalls.length, bought: bought,
      conversionRate: empCalls.length > 0 ? +(bought / empCalls.length).toFixed(3) : 0,
    };
  }).sort(function (a, b) { return b.bought - a.bought; });

  return { ok: true, days: days, stats: stats };
}
