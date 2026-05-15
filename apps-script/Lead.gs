/**
 * Lead.gs — staff actions (Phase 6.1)
 *
 * TODO Claude Code: ขยาย logic ตาม spec ใน TASKS.md Phase 6
 */

const VALID_RESULTS = ['bought', 'not_bought', 'no_answer', 'postponed', 'rejected', 'blacklist_req'];
const VALID_REJECT_REASONS = ['price_too_high', 'still_have_stock', 'changed_mind', 'unsatisfied', 'other_brand', 'other'];

function getMyQueue(args) {
  const uid = args.lineUserId;
  if (!isStaff(uid)) return { ok: false, error: 'not_staff' };
  const emp = findEmployee(uid);
  if (!emp) return { ok: false, error: 'no_employee' };

  const today = todayBkk();
  const myLeads = rows('Leads').filter(function (l) {
    return String(l.assigned_to) === String(emp.employee_id) &&
           ['pending', 'no_answer', 'postponed'].indexOf(String(l.status)) >= 0;
  });
  const custMap = {};
  rows('Customers').forEach(function (c) { custMap[c.customer_id] = c; });

  function mapLead(l) {
    const c = custMap[l.customer_id] || {};
    return {
      leadId: l.lead_id, customerId: l.customer_id,
      name: c.name || '', phone: c.phone || '',
      primarySku: l.primary_sku || '',
      status: l.status, dueDate: l.due_date,
      tier: l.tier || '', heldStatus: l.held_status || '',
      bucketDate: l.bucket_date || '',
      orderIds: String(l.order_ids || '').split(',').filter(function (s) { return s; }),
      assignedAt: l.assigned_at, note: l.note || '',
    };
  }

  // Tier 1 = ลูกค้าตัวเอง (tier=1, ว่าง, legacy)  →  ดูได้ทุกวัน
  const tier1 = myLeads.filter(function (l) {
    return String(l.tier) !== '2';
  }).sort(function (a, b) { return String(a.due_date).localeCompare(String(b.due_date)); }).map(mapLead);

  // Tier 2 = เบอร์ใหม่ของวันนี้ (tier=2 + bucket_date=today) — show เฉพาะ active (confirmed clock-in)
  // ขณะ held → ยังไม่แสดง (รอ clock-in)
  const tier2 = myLeads.filter(function (l) {
    return String(l.tier) === '2'
      && String(l.bucket_date) === today
      && String(l.held_status) !== 'released';
  }).sort(function (a, b) { return String(a.assigned_at).localeCompare(String(b.assigned_at)); }).map(mapLead);

  return {
    ok: true,
    employeeId: emp.employee_id,
    displayName: emp.display_name,
    tier1: tier1,
    tier2: tier2,
    // backward-compat field
    queue: tier1.concat(tier2),
  };
}

function getLeadDetail(args) {
  const uid = args.lineUserId;
  if (!isStaff(uid)) return { ok: false, error: 'not_staff' };

  const lead = findOne('Leads', 'lead_id', args.leadId);
  if (!lead) return { ok: false, error: 'lead_not_found' };

  // permission: ของตัวเอง, หรือ lead+ ในขอบเขต
  if (!isLead(uid)) {
    const emp = findEmployee(uid);
    if (!emp || String(emp.employee_id) !== String(lead.assigned_to)) {
      return { ok: false, error: 'not_your_lead' };
    }
  }

  const customer = findOne('Customers', 'customer_id', lead.customer_id);
  const orderIds = String(lead.order_ids || '').split(',').filter(function (s) { return s.trim(); });
  const orders = rows('Orders').filter(function (o) { return orderIds.indexOf(String(o.order_id)) >= 0; });

  // หา script จาก primary_sku
  let scriptText = '', rebuyDays = Number(getConfig().rebuy_default_days) || 30;
  if (lead.primary_sku) {
    const prod = findOne('Products', 'sku', lead.primary_sku);
    if (prod) {
      scriptText = String(prod.script_text || '');
      if (prod.rebuy_days) rebuyDays = Number(prod.rebuy_days) || rebuyDays;
      scriptText = scriptText
        .replace(/\{name\}/g, customer ? customer.name : '')
        .replace(/\{product\}/g, prod.product_name || '')
        .replace(/\{last_order_date\}/g, customer ? String(customer.last_order_at || '').slice(0, 10) : '');
    }
  }

  // log view
  audit({
    actor: uid, actorRole: 'staff',
    action: 'lead.viewed',
    targetType: 'lead', targetId: lead.lead_id,
    before: null, after: null,
  });

  return {
    ok: true,
    lead: {
      leadId: lead.lead_id, status: lead.status,
      dueDate: lead.due_date, primarySku: lead.primary_sku,
    },
    customer: customer ? {
      customerId: customer.customer_id, name: customer.name,
      phone: customer.phone, address: customer.address,
      stage: customer.stage, blacklist: isTruthy(customer.blacklist),
    } : null,
    orders: orders.map(function (o) {
      return {
        orderId: o.order_id, sku: o.sku, productName: o.product_name,
        quantity: o.quantity, amount: o.amount, orderedAt: o.ordered_at,
      };
    }),
    script: { text: scriptText, rebuyDays: rebuyDays },
  };
}

function logCopyPhone(args) {
  const uid = args.lineUserId;
  if (!isStaff(uid)) return { ok: false, error: 'not_staff' };
  const lead = findOne('Leads', 'lead_id', args.leadId);
  if (!lead) return { ok: false, error: 'lead_not_found' };

  const emp = findEmployee(uid);
  appendRow('CallLogs', {
    log_id: nextDated('LOG', 'CallLogs', 'log_id'),
    lead_id: lead.lead_id, customer_id: lead.customer_id,
    employee_id: emp.employee_id,
    action: 'copy_phone', result: '', reject_reason: '',
    note: '', next_action_at: '', created_at: nowBkk(),
  });

  audit({
    actor: uid, actorRole: emp.role,
    action: 'lead.phone_copied',
    targetType: 'lead', targetId: lead.lead_id,
    before: null, after: null,
  });

  return { ok: true };
}

function recordCallResult(args) {
  const uid = args.lineUserId;
  if (!isStaff(uid)) return { ok: false, error: 'not_staff' };
  if (VALID_RESULTS.indexOf(args.result) < 0) return { ok: false, error: 'invalid_result' };

  const emp = findEmployee(uid);
  return withLock(function () {
    const lead = findOne('Leads', 'lead_id', args.leadId);
    if (!lead) return { ok: false, error: 'lead_not_found' };
    if (!isLead(uid) && String(emp.employee_id) !== String(lead.assigned_to)) {
      return { ok: false, error: 'not_your_lead' };
    }
    if (['pending', 'no_answer', 'postponed'].indexOf(String(lead.status)) < 0) {
      return { ok: false, error: 'already_closed', currentStatus: lead.status };
    }

    const cfg = getConfig();
    const updates = { result: args.result, note: String(args.note || lead.note || '') };
    let nextAt = '', rejectReason = '';

    if (args.result === 'bought') {
      // หา rebuy days จาก primary_sku
      let rebuyDays = Number(cfg.rebuy_default_days) || 30;
      if (lead.primary_sku) {
        const prod = findOne('Products', 'sku', lead.primary_sku);
        if (prod && prod.rebuy_days) rebuyDays = Number(prod.rebuy_days) || rebuyDays;
      }
      nextAt = Utilities.formatDate(addDays(new Date(), rebuyDays), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
      updates.status = 'closed';
      updates.closed_at = nowBkk();
      updates.next_action_at = nextAt;
      // update customer
      const cr = findRowIndex('Customers', 'customer_id', lead.customer_id);
      if (cr > 0) updateRow('Customers', cr, {
        stage: 'ACTIVE', last_order_at: nowBkk(), updated_at: nowBkk(),
      });
    } else if (args.result === 'not_bought') {
      rejectReason = String(args.rejectReason || '');
      if (VALID_REJECT_REASONS.indexOf(rejectReason) < 0) return { ok: false, error: 'invalid_reject_reason' };
      updates.status = 'closed'; updates.closed_at = nowBkk();
      updates.reject_reason = rejectReason;
    } else if (args.result === 'no_answer') {
      nextAt = Utilities.formatDate(addDays(new Date(), 1), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
      updates.status = 'no_answer'; updates.next_action_at = nextAt;
    } else if (args.result === 'postponed') {
      const d = Number(args.postponeDays || 0);
      if (!d || d < 1 || d > 90) return { ok: false, error: 'invalid_postpone_days' };
      nextAt = Utilities.formatDate(addDays(new Date(), d), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
      updates.status = 'postponed'; updates.next_action_at = nextAt;
    } else if (args.result === 'rejected') {
      updates.status = 'closed'; updates.closed_at = nowBkk();
    } else if (args.result === 'blacklist_req') {
      const reason = String(args.note || '').trim();
      if (reason.length < 5) return { ok: false, error: 'reason_too_short' };
      updates.status = 'blacklist_req'; updates.note = reason;
      // push to lead/manager
      try {
        const customer = findOne('Customers', 'customer_id', lead.customer_id);
        const reqEmp = emp;
        const card = cardBlacklistRequest(lead, customer || {}, reqEmp);
        pushToLeads(card);
      } catch (e) { logError('blacklist.notify', e.message); }
    }

    updateRow('Leads', lead._row, updates);

    appendRow('CallLogs', {
      log_id: nextDated('LOG', 'CallLogs', 'log_id'),
      lead_id: lead.lead_id, customer_id: lead.customer_id,
      employee_id: emp.employee_id,
      action: 'call_result', result: args.result, reject_reason: rejectReason,
      note: args.note || '', next_action_at: nextAt, created_at: nowBkk(),
    });

    audit({
      actor: uid, actorRole: emp.role,
      action: args.result === 'blacklist_req' ? 'call.blacklist_requested' : 'call.result_recorded',
      targetType: 'lead', targetId: lead.lead_id,
      before: { status: lead.status },
      after: { status: updates.status, result: args.result, reject_reason: rejectReason },
    });

    return { ok: true, leadId: lead.lead_id, newStatus: updates.status };
  });
}
