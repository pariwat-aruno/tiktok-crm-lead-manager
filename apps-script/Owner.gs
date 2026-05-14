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
