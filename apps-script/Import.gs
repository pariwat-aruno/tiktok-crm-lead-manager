/**
 * Import.gs — CSV import
 *
 * TODO Claude Code: ขยาย field mapping ตาม TikTok Shop CSV จริง
 */

function importCsv(args) {
  if (!isOwner(args.lineUserId)) return { ok: false, error: 'forbidden' };

  const csvB64 = args.csvBase64;
  if (!csvB64) return { ok: false, error: 'no_csv' };

  let csvText;
  try {
    const clean = String(csvB64).replace(/^data:[^,]+,/, '');
    csvText = Utilities.newBlob(Utilities.base64Decode(clean)).getDataAsString('UTF-8');
  } catch (e) { return { ok: false, error: 'decode_failed', detail: e.message }; }

  let rowsCsv;
  try { rowsCsv = Utilities.parseCsv(csvText); }
  catch (e) { return { ok: false, error: 'parse_failed', detail: e.message }; }
  if (!rowsCsv || rowsCsv.length < 2) return { ok: false, error: 'csv_empty' };

  const headers = rowsCsv[0].map(function (h) { return String(h || '').trim(); });
  const dataRows = rowsCsv.slice(1);
  const colMap = _mapCsvCols(headers);
  if (colMap.errors.length > 0) return { ok: false, error: 'missing_columns', missing: colMap.errors };

  const sessionId = newSessionId();
  const adminEmp = findEmployee(args.lineUserId);
  appendRow('Sessions', {
    session_id: sessionId,
    imported_by: (adminEmp && adminEmp.employee_id) || args.lineUserId,
    csv_filename: args.filename || 'upload.csv',
    total_rows: dataRows.length,
    orders_created: 0, leads_created: 0, customers_created: 0,
    status: 'active', created_at: nowBkk(), rolled_back_at: '',
  });

  const existingOrderIds = new Set();
  rows('Orders').forEach(function (o) { existingOrderIds.add(String(o.order_id)); });

  const custByKey = {};
  rows('Customers').forEach(function (c) {
    custByKey[String(c.name_normalized || '') + '|' + String(c.phone || '')] = c;
  });

  let ordersCreated = 0, customersCreated = 0, leadsCreated = 0, skipped = 0;
  const errors = [];

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    try {
      const orderId = String(_csv(r, colMap.order_id) || '').trim();
      if (!orderId || existingOrderIds.has(orderId)) { skipped++; continue; }

      const rawName = _csv(r, colMap.name) || '';
      const rawPhone = _csv(r, colMap.phone) || '';
      const nameN = normName(rawName);
      const phoneN = normPhone(rawPhone);
      if (!nameN || !phoneN) { skipped++; continue; }

      const key = nameN + '|' + phoneN;
      let customer = custByKey[key];
      const sku = String(_csv(r, colMap.sku) || '').trim();

      if (!customer) {
        const newId = nextRunning('CUST', 'Customers', 'customer_id');
        appendRow('Customers', {
          customer_id: newId,
          name: rawName.trim(), name_normalized: nameN, phone: phoneN,
          address: _csv(r, colMap.address) || '',
          owner_employee_id: '',
          stage: 'NEW',
          blacklist: false, blacklist_reason: '',
          created_at: nowBkk(), last_order_at: nowBkk(), updated_at: nowBkk(),
        });
        customer = {
          customer_id: newId, name: rawName.trim(),
          name_normalized: nameN, phone: phoneN,
          owner_employee_id: '', stage: 'NEW', blacklist: false,
        };
        custByKey[key] = customer;
        customersCreated++;
      } else {
        const cr = findRowIndex('Customers', 'customer_id', customer.customer_id);
        if (cr > 0) updateRow('Customers', cr, { last_order_at: nowBkk(), updated_at: nowBkk() });
      }

      const csvRaw = {};
      headers.forEach(function (h, j) { csvRaw[h] = r[j] || ''; });
      appendRow('Orders', {
        order_id: orderId, customer_id: customer.customer_id, session_id: sessionId,
        sku: sku, product_name: _csv(r, colMap.product_name) || '',
        quantity: Number(_csv(r, colMap.quantity) || 1),
        amount: Number(_csv(r, colMap.amount) || 0),
        ordered_at: _csv(r, colMap.ordered_at) || nowBkk(),
        imported_at: nowBkk(), csv_raw: JSON.stringify(csvRaw),
      });
      existingOrderIds.add(orderId);
      ordersCreated++;

      const lead = mergeOrCreateLead(customer, orderId, sku, sessionId);
      if (lead.leadId && !lead.merged) leadsCreated++;

      if (i > 0 && i % 50 === 0) SpreadsheetApp.flush();
    } catch (e) {
      errors.push('row ' + (i + 2) + ': ' + e.message);
      skipped++;
    }
  }

  const sr = findRowIndex('Sessions', 'session_id', sessionId);
  if (sr > 0) updateRow('Sessions', sr, {
    orders_created: ordersCreated, leads_created: leadsCreated, customers_created: customersCreated,
  });

  audit({
    actor: args.lineUserId, actorRole: 'owner',
    action: 'session.imported',
    targetType: 'session', targetId: sessionId,
    before: null,
    after: { rows: dataRows.length, orders: ordersCreated, customers: customersCreated, leads: leadsCreated },
  });

  return {
    ok: true, sessionId: sessionId,
    summary: {
      totalRows: dataRows.length, ordersCreated: ordersCreated,
      customersCreated: customersCreated, leadsCreated: leadsCreated,
      skipped: skipped, errors: errors.slice(0, 10),
    },
  };
}

function _mapCsvCols(headers) {
  const norm = headers.map(function (h) { return String(h).toLowerCase().replace(/[\s_-]+/g, ''); });
  const find = function (cands) {
    for (let i = 0; i < cands.length; i++) {
      const c = String(cands[i]).toLowerCase().replace(/[\s_-]+/g, '');
      const idx = norm.indexOf(c);
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const map = {
    order_id: find(['order id', 'orderid', 'order no']),
    name: find(['recipient', 'recipient name', 'customer name', 'buyer name', 'name', 'ผู้รับ', 'ชื่อ']),
    phone: find(['phone', 'phone#', 'phone no', 'recipient phone', 'tel', 'mobile', 'เบอร์']),
    address: find(['address', 'shipping address', 'recipient address', 'ที่อยู่']),
    sku: find(['sku', 'seller sku', 'product sku']),
    product_name: find(['product name', 'item', 'product', 'สินค้า']),
    quantity: find(['quantity', 'qty']),
    amount: find(['order amount', 'amount', 'sub total', 'subtotal', 'total', 'ราคา']),
    ordered_at: find(['created time', 'order created', 'order time', 'paid time', 'วันที่สั่ง']),
  };
  const errors = [];
  if (map.order_id < 0) errors.push('Order ID');
  if (map.name < 0) errors.push('Recipient name');
  if (map.phone < 0) errors.push('Phone');
  return Object.assign(map, { errors: errors });
}

function _csv(row, idx) {
  if (idx < 0 || idx >= row.length) return '';
  return row[idx];
}

/* ===== Session rollback (admin section) ===== */

function rollbackSession(args) {
  if (!isOwner(args.lineUserId)) return { ok: false, error: 'forbidden' };
  const sessionId = args.sessionId;
  if (!sessionId) return { ok: false, error: 'no_session_id' };

  return withLock(function () {
    const sess = findOne('Sessions', 'session_id', sessionId);
    if (!sess) return { ok: false, error: 'not_found' };
    if (String(sess.status) === 'rolled_back') return { ok: false, error: 'already_rolled_back' };

    const winH = Number(getConfig().rollback_window_hours) || 24;
    const age = diffHours(new Date(), new Date(sess.created_at));
    if (age > winH) return { ok: false, error: 'rollback_expired' };

    const dOrders = deleteRowsWhere('Orders', function (o) { return String(o.session_id) === String(sessionId); });
    const dLeads = deleteRowsWhere('Leads', function (l) { return String(l.session_id) === String(sessionId); });

    updateRow('Sessions', sess._row, { status: 'rolled_back', rolled_back_at: nowBkk() });

    audit({
      actor: args.lineUserId, actorRole: 'owner',
      action: 'session.rolled_back',
      targetType: 'session', targetId: sessionId,
      before: { orders: dOrders, leads: dLeads },
      after: { status: 'rolled_back' },
    });

    return { ok: true, deletedOrders: dOrders, deletedLeads: dLeads };
  });
}

function getRecentSessions(args) {
  if (!isManager(args.lineUserId) && !isOwner(args.lineUserId)) return { ok: false, error: 'forbidden' };
  const winH = Number(getConfig().rollback_window_hours) || 24;
  const all = rows('Sessions').sort(function (a, b) {
    return String(b.created_at).localeCompare(String(a.created_at));
  }).slice(0, 30);

  return {
    ok: true,
    sessions: all.map(function (s) {
      const age = diffHours(new Date(), new Date(s.created_at));
      return {
        sessionId: s.session_id, filename: s.csv_filename,
        totalRows: s.total_rows, ordersCreated: s.orders_created,
        leadsCreated: s.leads_created, customersCreated: s.customers_created,
        status: s.status, createdAt: s.created_at,
        ageHours: age.toFixed(1),
        canRollback: String(s.status) === 'active' && age <= winH,
      };
    }),
  };
}

function searchCustomers(args) {
  if (!isLead(args.lineUserId) && !isManager(args.lineUserId) && !isOwner(args.lineUserId)) {
    return { ok: false, error: 'forbidden' };
  }
  const q = String(args.q || '').trim();
  if (!q || q.length < 2) return { ok: false, error: 'query_too_short' };
  const qN = normName(q);
  const qP = normPhone(q);
  return {
    ok: true,
    customers: rows('Customers').filter(function (c) {
      return (qN && String(c.name_normalized || '').indexOf(qN) >= 0) ||
             (qP && String(c.phone || '').indexOf(qP) >= 0);
    }).slice(0, 50),
  };
}

/**
 * mergeCustomers — รวมลูกค้าซ้ำหลาย row ให้เหลือ row เดียว (master)
 *   args: { masterId, mergeIds: ['CUST-002','CUST-003'], lineUserId }
 *   - ย้าย Orders / Leads / CallLogs ทั้งหมดของ mergeIds → masterId
 *   - master.last_order_at = max(...) / address: master ก่อน, fallback ของอันที่ merge ที่ไม่ว่าง
 *   - master.blacklist = true ถ้าใครคนใดเป็น blacklist
 *   - ลบ row ของ mergeIds ออกจาก Customers
 *   - audit
 */
function mergeCustomers(args) {
  if (!isOwner(args.lineUserId)) return { ok: false, error: 'forbidden' };
  const masterId = String(args.masterId || '').trim();
  const mergeIds = (Array.isArray(args.mergeIds) ? args.mergeIds : [])
    .map(function (s) { return String(s).trim(); })
    .filter(function (s) { return s && s !== masterId; });
  if (!masterId) return { ok: false, error: 'no_master' };
  if (mergeIds.length === 0) return { ok: false, error: 'no_merge_ids' };

  return withLock(function () {
    const master = findOne('Customers', 'customer_id', masterId);
    if (!master) return { ok: false, error: 'master_not_found' };

    const targets = [];
    for (let i = 0; i < mergeIds.length; i++) {
      const c = findOne('Customers', 'customer_id', mergeIds[i]);
      if (!c) return { ok: false, error: 'merge_not_found', id: mergeIds[i] };
      targets.push(c);
    }

    const idSet = new Set(mergeIds);
    let movedOrders = 0, movedLeads = 0, movedCalls = 0;

    rows('Orders').forEach(function (o) {
      if (idSet.has(String(o.customer_id))) {
        updateRow('Orders', o._row, { customer_id: masterId });
        movedOrders++;
      }
    });
    rows('Leads').forEach(function (l) {
      if (idSet.has(String(l.customer_id))) {
        updateRow('Leads', l._row, { customer_id: masterId });
        movedLeads++;
      }
    });
    rows('CallLogs').forEach(function (cl) {
      if (idSet.has(String(cl.customer_id))) {
        updateRow('CallLogs', cl._row, { customer_id: masterId });
        movedCalls++;
      }
    });

    // merge fields ของ master
    const masterRow = findRowIndex('Customers', 'customer_id', masterId);
    const upd = { updated_at: nowBkk() };
    const masterLast = master.last_order_at ? new Date(master.last_order_at).getTime() : 0;
    let bestLast = masterLast;
    targets.forEach(function (t) {
      const lt = t.last_order_at ? new Date(t.last_order_at).getTime() : 0;
      if (lt > bestLast) { bestLast = lt; upd.last_order_at = t.last_order_at; }
      if (!master.address && t.address) upd.address = t.address;
      if (isTruthy(t.blacklist) && !isTruthy(master.blacklist)) {
        upd.blacklist = true;
        upd.blacklist_reason = t.blacklist_reason || master.blacklist_reason || '';
      }
      if (!master.owner_employee_id && t.owner_employee_id) {
        upd.owner_employee_id = t.owner_employee_id;
      }
    });
    if (masterRow > 0) updateRow('Customers', masterRow, upd);

    // ลบ row mergeIds (ทำ reverse เพื่อไม่ให้ index เลื่อน)
    deleteRowsWhere('Customers', function (c) { return idSet.has(String(c.customer_id)); });

    audit({
      actor: args.lineUserId, actorRole: 'owner',
      action: 'customer.merged',
      targetType: 'customer', targetId: masterId,
      before: { merged_ids: mergeIds },
      after: { orders_moved: movedOrders, leads_moved: movedLeads, calls_moved: movedCalls },
    });

    return {
      ok: true, masterId: masterId,
      ordersMoved: movedOrders, leadsMoved: movedLeads, callsMoved: movedCalls,
      customersDeleted: mergeIds.length,
    };
  }, 30000);
}
