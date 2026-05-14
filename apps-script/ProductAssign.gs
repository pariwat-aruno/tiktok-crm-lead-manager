/**
 * ProductAssign.gs — สร้าง product + assign ให้พนักงาน
 */

function createProduct(args) {
  if (!isOwner(args.lineUserId)) return { ok: false, error: 'forbidden' };
  const sku = String(args.sku || '').trim();
  if (!sku) return { ok: false, error: 'no_sku' };
  if (findOne('Products', 'sku', sku)) return { ok: false, error: 'sku_exists' };

  appendRow('Products', {
    sku: sku,
    product_name: args.productName || '',
    script_text: args.scriptText || '',
    rebuy_days: Number(args.rebuyDays || 30),
    is_active: true,
    created_at: nowBkk(),
  });

  audit({
    actor: args.lineUserId, actorRole: 'owner',
    action: 'product.created',
    targetType: 'product', targetId: sku,
    before: null,
    after: { sku: sku, name: args.productName },
  });
  return { ok: true, sku: sku };
}

/**
 * ลบ product (soft delete — is_active=false) + ปลด assignment ทั้งหมดของ SKU นี้ — owner only
 */
function deleteProduct(args) {
  if (!isOwner(args.lineUserId)) return { ok: false, error: 'forbidden' };
  const sku = String(args.sku || '').trim();
  if (!sku) return { ok: false, error: 'no_sku' };
  const prod = findOne('Products', 'sku', sku);
  if (!prod) return { ok: false, error: 'sku_not_found' };

  return withLock(function () {
    updateRow('Products', prod._row, { is_active: false });
    let unassigned = 0;
    rows('ProductAssignments').forEach(function (a) {
      if (String(a.sku) === String(sku) && isTruthy(a.is_active)) {
        updateRow('ProductAssignments', a._row, { is_active: false });
        unassigned++;
      }
    });
    audit({
      actor: args.lineUserId, actorRole: 'owner',
      action: 'product.deleted',
      targetType: 'product', targetId: sku,
      before: { is_active: true },
      after: { is_active: false, assignments_removed: unassigned },
    });
    return { ok: true, sku: sku, assignmentsRemoved: unassigned };
  });
}

function assignProduct(args) {
  const uid = args.lineUserId;
  if (!isManager(uid) && !isOwner(uid)) return { ok: false, error: 'forbidden' };
  const empId = args.employeeId, sku = args.sku;
  if (!empId || !sku) return { ok: false, error: 'missing_params' };

  const target = findOne('Employees', 'employee_id', empId);
  if (!target) return { ok: false, error: 'employee_not_found' };
  if (!findOne('Products', 'sku', sku)) return { ok: false, error: 'sku_not_found' };

  // scope (manager → chain ตน)
  if (!isOwner(uid)) {
    const me = findEmployee(uid);
    if (!isInMyChain(me, target)) return { ok: false, error: 'out_of_scope' };
  }

  // ห้ามซ้ำ
  const existing = rows('ProductAssignments').filter(function (a) {
    return String(a.employee_id) === String(empId) &&
           String(a.sku) === String(sku) &&
           isTruthy(a.is_active);
  });
  if (existing.length > 0) return { ok: false, error: 'already_assigned' };

  appendRow('ProductAssignments', {
    assignment_id: nextRunning('PA', 'ProductAssignments', 'assignment_id'),
    employee_id: empId, sku: sku,
    assigned_at: nowBkk(),
    assigned_by: (findEmployee(uid) || {}).employee_id || 'OWNER',
    is_active: true,
  });

  audit({
    actor: uid, actorRole: (findEmployee(uid) || {}).role || 'owner',
    action: 'product.assigned',
    targetType: 'product_assignment', targetId: empId + ':' + sku,
    before: null, after: { employee_id: empId, sku: sku },
  });

  return { ok: true };
}

function unassignProduct(args) {
  const uid = args.lineUserId;
  if (!isManager(uid) && !isOwner(uid)) return { ok: false, error: 'forbidden' };
  const empId = args.employeeId, sku = args.sku;

  const existing = rows('ProductAssignments').filter(function (a) {
    return String(a.employee_id) === String(empId) &&
           String(a.sku) === String(sku) &&
           isTruthy(a.is_active);
  });
  if (existing.length === 0) return { ok: false, error: 'not_assigned' };

  existing.forEach(function (a) {
    updateRow('ProductAssignments', a._row, { is_active: false });
  });

  audit({
    actor: uid, actorRole: (findEmployee(uid) || {}).role || 'owner',
    action: 'product.unassigned',
    targetType: 'product_assignment', targetId: empId + ':' + sku,
    before: { employee_id: empId, sku: sku, active: true },
    after: { active: false },
  });
  return { ok: true };
}

function getMyProducts(args) {
  const uid = args.lineUserId;
  if (!isStaff(uid)) return { ok: false, error: 'forbidden' };
  const emp = findEmployee(uid);
  if (!emp) return { ok: false, error: 'no_employee' };

  const skus = rows('ProductAssignments').filter(function (a) {
    return String(a.employee_id) === String(emp.employee_id) && isTruthy(a.is_active);
  }).map(function (a) { return a.sku; });

  const productMap = {};
  rows('Products').forEach(function (p) { productMap[p.sku] = p; });

  return {
    ok: true,
    products: skus.map(function (sku) {
      const p = productMap[sku] || { sku: sku };
      return {
        sku: sku,
        productName: p.product_name || '',
        rebuyDays: p.rebuy_days || 30,
      };
    }),
  };
}

function getProductTeam(args) {
  const uid = args.lineUserId;
  if (!isLead(uid) && !isManager(uid) && !isOwner(uid)) return { ok: false, error: 'forbidden' };

  const sku = args.sku;
  if (!sku) {
    // list เฉพาะ product ที่ยัง active
    return { ok: true, products: rows('Products').filter(function (p) { return isTruthy(p.is_active); }) };
  }

  const team = rows('ProductAssignments').filter(function (a) {
    return String(a.sku) === String(sku) && isTruthy(a.is_active);
  });
  const empMap = {};
  rows('Employees').forEach(function (e) { empMap[e.employee_id] = e; });

  return {
    ok: true,
    sku: sku,
    team: team.map(function (a) {
      const e = empMap[a.employee_id] || {};
      return {
        employeeId: a.employee_id,
        displayName: e.display_name || a.employee_id,
        team: e.team || '',
        isActive: isActive(e),
        onLeave: isOnLeaveToday(a.employee_id),
      };
    }),
  };
}
