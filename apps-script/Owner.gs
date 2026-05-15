/**
 * Owner.gs — actions ของ "owner" (สิทธิ์สูงสุด)
 */

function getAllEmployees(args) {
  if (!isManager(args.lineUserId) && !isOwner(args.lineUserId)) return { ok: false, error: 'forbidden' };

  const me = findEmployee(args.lineUserId);
  const isFullScope = isOwner(args.lineUserId);

  const list = rows('Employees').filter(function (e) {
    if (isFullScope) return true;
    return me && (isInMyChain(me, e) || String(e.employee_id) === String(me.employee_id));
  });

  return {
    ok: true,
    employees: list.map(function (e) {
      return {
        employeeId: e.employee_id,
        lineUserId: e.line_user_id,
        displayName: e.display_name,
        fullName: e.full_name,
        role: e.role,
        team: e.team || '',
        reportTo: e.report_to || '',
        isActive: isTruthy(e.is_active),
        isBanned: isTruthy(e.is_banned),
        banReason: e.ban_reason || '',
        onLeave: isOnLeaveToday(e.employee_id),
        joinedAt: e.joined_at,
      };
    }),
  };
}

function banEmployee(args) {
  const uid = args.lineUserId;
  if (!isManager(uid) && !isOwner(uid)) return { ok: false, error: 'forbidden' };

  const empId = args.employeeId;
  const reason = args.reason || '';
  if (!empId) return { ok: false, error: 'no_employee_id' };
  if (!reason || reason.length < 3) return { ok: false, error: 'reason_required' };

  return withLock(function () {
    const target = findOne('Employees', 'employee_id', empId);
    if (!target) return { ok: false, error: 'not_found' };
    if (isTruthy(target.is_banned)) return { ok: false, error: 'already_banned' };

    // ห้าม ban ตัวเอง
    const me = findEmployee(uid);
    if (me && String(me.employee_id) === String(empId)) {
      return { ok: false, error: 'cannot_ban_self' };
    }
    // manager ห้าม ban manager+, ban เฉพาะในสายงาน
    if (!isOwner(uid)) {
      if (['manager', 'owner'].indexOf(String(target.role)) >= 0) {
        return { ok: false, error: 'cannot_ban_higher_role' };
      }
      if (!isInMyChain(me, target)) {
        return { ok: false, error: 'out_of_scope' };
      }
    }

    // ban
    updateRow('Employees', target._row, {
      is_banned: true, ban_reason: reason, banned_at: nowBkk(), is_active: false,
    });

    // ลบ ProductAssignments
    let unassigned = 0;
    rows('ProductAssignments').forEach(function (pa) {
      if (String(pa.employee_id) === String(empId) && isTruthy(pa.is_active)) {
        updateRow('ProductAssignments', pa._row, { is_active: false });
        unassigned++;
      }
    });

    // เคลียร์ owner ใน customers
    rows('Customers').forEach(function (c) {
      if (String(c.owner_employee_id) === String(empId)) {
        updateRow('Customers', c._row, { owner_employee_id: '', updated_at: nowBkk() });
      }
    });

    // reassign pending leads
    let reassigned = 0;
    rows('Leads').filter(function (l) {
      return String(l.assigned_to) === String(empId) &&
             ['pending', 'no_answer', 'postponed'].indexOf(String(l.status)) >= 0;
    }).forEach(function (l) {
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
          assignment_reason: 'reassign_banned',
        });
        reassigned++;
      } catch (e) { logError('ban.reassign', e.message); }
    });

    audit({
      actor: uid, actorRole: (me || {}).role || 'owner',
      action: 'user.ban',
      targetType: 'employee', targetId: empId,
      before: { is_banned: false, role: target.role },
      after: { is_banned: true, reason: reason, products_unassigned: unassigned, leads_reassigned: reassigned },
    });

    // push to user
    if (target.line_user_id) {
      try { pushFlex(target.line_user_id, cardBanned(target, reason)); } catch (e) {}
    }

    return { ok: true, employeeId: empId, leadsReassigned: reassigned, productsUnassigned: unassigned };
  }, 30000);
}

function unbanEmployee(args) {
  const uid = args.lineUserId;
  if (!isOwner(uid)) return { ok: false, error: 'forbidden' };

  const target = findOne('Employees', 'employee_id', args.employeeId);
  if (!target) return { ok: false, error: 'not_found' };
  if (!isTruthy(target.is_banned)) return { ok: false, error: 'not_banned' };

  updateRow('Employees', target._row, {
    is_banned: false, ban_reason: '', banned_at: '', is_active: true,
  });

  audit({
    actor: uid, actorRole: 'owner',
    action: 'user.unban',
    targetType: 'employee', targetId: args.employeeId,
    before: { is_banned: true }, after: { is_banned: false },
  });

  return { ok: true };
}

function getOwnerDashboard(args) {
  if (!isOwner(args.lineUserId)) return { ok: false, error: 'forbidden' };

  const customers = rows('Customers');
  const leads = rows('Leads');
  const orders = rows('Orders');
  const today = todayBkk();
  const now = Date.now();

  const stages = { NEW: 0, ACTIVE: 0, DORMANT: 0, CHURNED: 0 };
  customers.forEach(function (c) {
    const s = String(c.stage || 'NEW');
    if (stages[s] !== undefined) stages[s]++;
  });

  const pending = leads.filter(function (l) {
    return ['pending', 'no_answer', 'postponed'].indexOf(String(l.status)) >= 0;
  });
  const overdue = pending.filter(function (l) {
    return l.due_date && new Date(l.due_date).getTime() < now;
  });

  const todayCalls = rows('CallLogs').filter(function (cl) {
    return String(cl.created_at || '').indexOf(today) === 0 && cl.action === 'call_result';
  });
  const todayBought = todayCalls.filter(function (cl) { return cl.result === 'bought'; });

  const empCount = rows('Employees').filter(function (e) { return isActive(e); }).length;
  const pendingUsersCount = rows('PendingUsers').filter(function (p) { return String(p.status) === 'pending'; }).length;

  return {
    ok: true,
    summary: {
      totalCustomers: customers.length,
      totalOrders: orders.length,
      stages: stages,
      pendingLeads: pending.length,
      overdueLeads: overdue.length,
      blacklistReq: leads.filter(function (l) { return String(l.status) === 'blacklist_req'; }).length,
      todayCalls: todayCalls.length,
      todayBought: todayBought.length,
      activeEmployees: empCount,
      pendingUsers: pendingUsersCount,
      blacklistedCustomers: customers.filter(function (c) { return isTruthy(c.blacklist); }).length,
    },
  };
}

/**
 * Snapshot คิว — counts + per-employee สำหรับ tab "คิว" ของ owner
 */
function getQueueSnapshot(args) {
  if (!isManager(args.lineUserId) && !isOwner(args.lineUserId)) return { ok: false, error: 'forbidden' };

  const allLeads = rows('Leads');
  const now = Date.now();
  const today = todayBkk();

  let tier1 = 0, tier2 = 0, overdue = 0, freshPool = 0, closedToday = 0;
  allLeads.forEach(function (l) {
    const open = ['pending', 'no_answer', 'postponed'].indexOf(String(l.status)) >= 0;
    if (open) {
      if (String(l.tier) === '2') tier2++; else tier1++;
      if (l.due_date && new Date(l.due_date).getTime() < now) overdue++;
    }
    if (String(l.status) === 'unassigned') freshPool++;
    if (String(l.status) === 'closed' && String(l.closed_at || '').indexOf(today) === 0) closedToday++;
  });
  const activeHolds = rows('LeadHolds').filter(function (h) { return !h.released_at; }).length;

  const empMap = {};
  rows('Employees').filter(function (e) { return isActive(e) && String(e.role) === 'staff'; })
    .forEach(function (e) {
      empMap[e.employee_id] = {
        id: e.employee_id, name: e.display_name, team: e.team || '',
        tier1: 0, tier2: 0, calls: 0, bought: 0, revenue: 0,
        attendance: 'pending', clockInAt: '',
      };
    });
  allLeads.forEach(function (l) {
    if (!empMap[l.assigned_to]) return;
    if (['pending', 'no_answer', 'postponed'].indexOf(String(l.status)) < 0) return;
    if (String(l.tier) === '2') empMap[l.assigned_to].tier2++;
    else empMap[l.assigned_to].tier1++;
  });
  rows('Attendance').forEach(function (a) {
    if (String(a.date) !== today) return;
    if (empMap[a.employee_id]) {
      empMap[a.employee_id].attendance = a.status;
      empMap[a.employee_id].clockInAt = a.clock_in_at || '';
    }
  });
  rows('CallLogs').forEach(function (cl) {
    if (String(cl.created_at || '').indexOf(today) !== 0) return;
    if (cl.action !== 'call_result') return;
    if (!empMap[cl.employee_id]) return;
    empMap[cl.employee_id].calls++;
    if (cl.result === 'bought') empMap[cl.employee_id].bought++;
  });

  return {
    ok: true,
    snapshot: {
      totalLeads: allLeads.length,
      tier1: tier1, tier2: tier2,
      overdue: overdue, freshPool: freshPool,
      closedToday: closedToday, activeHolds: activeHolds,
    },
    employees: Object.values(empMap).sort(function (a, b) {
      return (b.tier1 + b.tier2) - (a.tier1 + a.tier2);
    }),
  };
}

/**
 * รายการ leads ทั้งหมด + filter
 * args: { filter: {status, tier, assignedTo, sku, q}, limit }
 */
function getAllLeads(args) {
  if (!isManager(args.lineUserId) && !isOwner(args.lineUserId)) return { ok: false, error: 'forbidden' };

  let leads = rows('Leads');
  const filter = args.filter || {};
  if (filter.status) leads = leads.filter(function (l) { return String(l.status) === String(filter.status); });
  if (filter.tier) leads = leads.filter(function (l) { return String(l.tier) === String(filter.tier); });
  if (filter.assignedTo) leads = leads.filter(function (l) { return String(l.assigned_to) === String(filter.assignedTo); });
  if (filter.sku) leads = leads.filter(function (l) { return String(l.primary_sku) === String(filter.sku); });

  const custMap = {};
  rows('Customers').forEach(function (c) { custMap[c.customer_id] = c; });
  const empMap = {};
  rows('Employees').forEach(function (e) { empMap[e.employee_id] = e; });

  if (filter.q) {
    const qN = normName(filter.q);
    const qP = normPhone(filter.q);
    leads = leads.filter(function (l) {
      const c = custMap[l.customer_id];
      if (!c) return false;
      if (qN && String(c.name_normalized || '').indexOf(qN) >= 0) return true;
      if (qP && String(c.phone || '').indexOf(qP) >= 0) return true;
      return false;
    });
  }

  leads.sort(function (a, b) {
    const open = ['pending', 'no_answer', 'postponed', 'unassigned'];
    const aOpen = open.indexOf(String(a.status)) >= 0;
    const bOpen = open.indexOf(String(b.status)) >= 0;
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    return String(b.assigned_at || '').localeCompare(String(a.assigned_at || ''));
  });

  const total = leads.length;
  const limit = Number(args.limit || 200);
  leads = leads.slice(0, limit);

  return {
    ok: true, total: total, shown: leads.length,
    leads: leads.map(function (l) {
      const c = custMap[l.customer_id] || {};
      const e = empMap[l.assigned_to] || {};
      return {
        leadId: l.lead_id, customerId: l.customer_id,
        name: c.name || '', phone: c.phone || '',
        sku: l.primary_sku || '',
        status: l.status, tier: l.tier || '',
        assignedTo: l.assigned_to || '',
        assignedName: e.display_name || '',
        team: e.team || '',
        dueDate: l.due_date || '',
        nextActionAt: l.next_action_at || '',
        result: l.result || '',
        blacklist: !!isTruthy(c.blacklist),
        bucketDate: l.bucket_date || '',
      };
    }),
  };
}

/**
 * รายละเอียด lead (สำหรับ modal คลิกแถวใน tab คิว)
 */
function getLeadFullDetail(args) {
  if (!isManager(args.lineUserId) && !isOwner(args.lineUserId)) return { ok: false, error: 'forbidden' };
  const lead = findOne('Leads', 'lead_id', args.leadId);
  if (!lead) return { ok: false, error: 'lead_not_found' };

  const customer = findOne('Customers', 'customer_id', lead.customer_id);
  const orderIds = String(lead.order_ids || '').split(',').filter(function (s) { return s.trim(); });
  const orders = rows('Orders').filter(function (o) { return orderIds.indexOf(String(o.order_id)) >= 0; });
  const callLogs = rows('CallLogs').filter(function (cl) { return String(cl.lead_id) === String(args.leadId); })
    .sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
  const emp = lead.assigned_to ? findOne('Employees', 'employee_id', lead.assigned_to) : null;

  return {
    ok: true,
    lead: lead, customer: customer, orders: orders, callLogs: callLogs,
    assignedEmployee: emp,
  };
}

function getFullAuditLog(args) {
  if (!isManager(args.lineUserId) && !isOwner(args.lineUserId)) return { ok: false, error: 'forbidden' };
  return {
    ok: true,
    logs: queryAudit({
      action: args.action,
      actorEmployeeId: args.actorEmployeeId,
      targetType: args.targetType,
      targetId: args.targetId,
      from: args.from,
      to: args.to,
      limit: args.limit || 200,
    }),
  };
}
