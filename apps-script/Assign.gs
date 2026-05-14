/**
 * Assign.gs — product-based round-robin + ownership + leave + ban check
 */

function resolveOwner(opts) {
  opts = opts || {};
  const customer = opts.customer;
  const primarySku = opts.primarySku;
  const excludeIds = new Set((opts.excludeEmployeeIds || []).map(String));

  // 1) candidates ที่ดูแล SKU นี้
  let candidates = [];
  if (primarySku) {
    candidates = getActiveCandidatesForSku(primarySku, opts.excludeEmployeeIds || []);
  } else {
    candidates = getAllActiveStaff().filter(function (e) { return !excludeIds.has(String(e.employee_id)); });
  }

  // 2) มี owner เดิม + ยังอยู่ใน candidates → ใช้
  if (customer && customer.owner_employee_id) {
    const found = candidates.find(function (c) {
      return String(c.employee_id) === String(customer.owner_employee_id);
    });
    if (found) return { employeeId: found.employee_id, method: 'inherit' };
  }

  // 3) round-robin
  if (candidates.length > 0) {
    return { employeeId: roundRobinPick(candidates), method: 'product_match' };
  }

  // 4) fallback → manager
  const managers = rows('Employees').filter(function (e) {
    return String(e.role) === 'manager' && isActive(e)
      && !excludeIds.has(String(e.employee_id))
      && !isOnLeaveToday(e.employee_id);
  });
  if (managers.length > 0) {
    return { employeeId: managers[0].employee_id, method: 'fallback_manager' };
  }

  // 5) ultimate fallback → owner
  const owners = rows('Owners');
  if (owners.length > 0) {
    // map line_user_id → ถ้ามี employee row ใช้ employee_id, ถ้าไม่มี ใช้ line_user_id
    const o0 = owners[0];
    const emp = findEmployee(o0.line_user_id);
    return { employeeId: (emp && emp.employee_id) || o0.line_user_id, method: 'fallback_owner' };
  }

  throw new Error('no_candidates_available');
}

function roundRobinPick(staffList) {
  return withLock(function () {
    const cfg = getConfig();
    let ptr = Number(cfg.rr_pointer) || 0;
    ptr = ptr % staffList.length;
    const picked = staffList[ptr];
    setConfig('rr_pointer', (ptr + 1) % staffList.length);
    return picked.employee_id;
  });
}

/**
 * Merge ถ้ามี lead pending สำหรับ customer คนเดียวกัน หรือสร้างใหม่
 */
function mergeOrCreateLead(customer, orderId, primarySku, sessionId) {
  if (isTruthy(customer.blacklist)) return { skipped: 'blacklist' };

  return withLock(function () {
    const existing = rows('Leads').filter(function (l) {
      return String(l.customer_id) === String(customer.customer_id) &&
             ['pending', 'no_answer', 'postponed'].indexOf(String(l.status)) >= 0;
    });

    if (existing.length > 0) {
      const lead = existing[0];
      const orderIds = String(lead.order_ids || '').split(',').filter(function (s) { return s.trim(); });
      if (orderIds.indexOf(String(orderId)) < 0) {
        orderIds.push(orderId);
        updateRow('Leads', lead._row, { order_ids: orderIds.join(',') });
      }
      return { leadId: lead.lead_id, merged: true };
    }

    const owner = resolveOwner({ customer: customer, primarySku: primarySku });
    const cfg = getConfig();
    const slaH = Number(cfg.sla_hours) || 48;
    const leadId = nextDated('LEAD', 'Leads', 'lead_id');
    const due = Utilities.formatDate(addHours(new Date(), slaH), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");

    appendRow('Leads', {
      lead_id: leadId,
      customer_id: customer.customer_id,
      order_ids: orderId,
      primary_sku: primarySku || '',
      assigned_to: owner.employeeId,
      assigned_at: nowBkk(),
      assignment_reason: owner.method,
      status: 'pending',
      due_date: due,
      next_action_at: '',
      closed_at: '',
      result: '', reject_reason: '', note: '',
      session_id: sessionId || '',
    });

    audit({
      actor: 'SYSTEM', actorRole: 'system',
      action: 'lead.assigned',
      targetType: 'lead', targetId: leadId,
      before: null,
      after: { customer_id: customer.customer_id, owner: owner.employeeId, sku: primarySku, method: owner.method },
    });

    // อัปเดต owner ใน customer
    if (owner.method !== 'inherit') {
      const cr = findRowIndex('Customers', 'customer_id', customer.customer_id);
      if (cr > 0) updateRow('Customers', cr, { owner_employee_id: owner.employeeId });
    }

    return { leadId: leadId, merged: false };
  });
}
