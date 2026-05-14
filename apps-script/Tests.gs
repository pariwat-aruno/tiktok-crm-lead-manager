/**
 * Tests.gs — ทดสอบระบบ
 *
 * วิธีใช้:
 *   1) ต้องรัน setupAll() เสร็จก่อน
 *   2) Run runAllTests() → ดู log
 *
 * ⚠️ Tests จะใช้ Sheet จริง — ใส่ test data เข้าไปแล้ว resetTestData() จบ
 */

const TEST_OWNER_UID = 'U_test_owner';
const TEST_MGR_UID = 'U_test_manager';
const TEST_STAFF_UID_1 = 'U_test_staff_1';
const TEST_STAFF_UID_2 = 'U_test_staff_2';
const TEST_NEW_USER_UID = 'U_test_new_user';

let _testResults = [];

function runAllTests() {
  _testResults = [];
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('  TikTok CRM — runAllTests()');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try { _setupTestEnv(); }
  catch (e) { Logger.log('❌ setupTestEnv FAIL: ' + e.message); return; }

  _runTest('test_setupAll', test_setupAll);
  _runTest('test_registerUser', test_registerUser);
  _runTest('test_approveUser_creates_employee', test_approveUser_creates_employee);
  _runTest('test_assignProduct', test_assignProduct);
  _runTest('test_importCsv_product_based_assignment', test_importCsv_product_based_assignment);
  _runTest('test_recordCallResult_bought', test_recordCallResult_bought);
  _runTest('test_blacklistRequest_approve', test_blacklistRequest_approve);
  _runTest('test_requestLeave_then_skip_assign', test_requestLeave_then_skip_assign);
  _runTest('test_banEmployee_reassigns_leads', test_banEmployee_reassigns_leads);
  _runTest('test_rollbackSession', test_rollbackSession);
  _runTest('test_auditLog_every_action', test_auditLog_every_action);

  Logger.log('');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const passed = _testResults.filter(function (r) { return r.pass; }).length;
  const failed = _testResults.length - passed;
  Logger.log('  สรุป: ' + passed + ' PASS, ' + failed + ' FAIL จาก ' + _testResults.length);
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  _testResults.forEach(function (r) {
    Logger.log((r.pass ? '✓' : '✗') + ' ' + r.name + (r.error ? ' — ' + r.error : ''));
  });
}

function _runTest(name, fn) {
  try {
    fn();
    _testResults.push({ name: name, pass: true });
    Logger.log('✓ ' + name);
  } catch (e) {
    _testResults.push({ name: name, pass: false, error: e.message });
    Logger.log('✗ ' + name + ' — ' + e.message);
  }
}

function _assertEq(actual, expected, msg) {
  if (String(actual) !== String(expected)) {
    throw new Error((msg || 'assertEq') + ': expected ' + expected + ', got ' + actual);
  }
}

function _assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

function _setupTestEnv() {
  // เช็คว่ามี Sheet
  ss_();
  resetTestData();

  // เพิ่ม Owner สำหรับ test
  const ownerExisting = findOne('Owners', 'line_user_id', TEST_OWNER_UID);
  if (!ownerExisting) {
    appendRow('Owners', {
      line_user_id: TEST_OWNER_UID, display_name: 'Test Owner',
      added_at: nowBkk(), note: 'test',
    });
  }
  // ลบ Employees test เก่า
  deleteRowsWhere('Employees', function (e) {
    return String(e.line_user_id).indexOf('U_test_') === 0;
  });
  // ลบ ProductAssignments เก่า
  deleteRowsWhere('ProductAssignments', function (a) {
    return String(a.assigned_by).indexOf('OWNER') >= 0 || String(a.employee_id).indexOf('EMP-') === 0;
  });
  // ลบ Products test
  deleteRowsWhere('Products', function (p) { return String(p.sku).indexOf('TEST-') === 0; });
  // ลบ PendingUsers ของ TEST_NEW_USER
  deleteRowsWhere('PendingUsers', function (p) { return String(p.line_user_id) === TEST_NEW_USER_UID; });
}

/* ===== Tests ===== */

function test_setupAll() {
  const cfg = getConfig();
  _assert(cfg.brand_name, 'brand_name should exist');
  _assert(cfg.sla_hours, 'sla_hours should exist');
  // ตรวจ tabs
  ['Owners', 'Employees', 'PendingUsers', 'Products', 'ProductAssignments',
   'Customers', 'Orders', 'Leads', 'CallLogs', 'Leaves', 'Sessions',
   'Stats', 'AuditLog', 'Config', 'Logs'].forEach(function (n) {
    _assert(ss_().getSheetByName(n), 'missing tab: ' + n);
  });
}

function test_registerUser() {
  // call directly (skip Drive upload by injecting tiny base64)
  const tinyB64 = Utilities.base64Encode('test');
  const r = registerUser({
    lineUserId: TEST_NEW_USER_UID,
    lineDisplayName: 'Test New User',
    fullName: 'ทดสอบ ระบบ',
    nickName: 'เทส',
    phone: '0812345678',
    email: 'test@example.com',
    selfieBase64: tinyB64,
    idCardBase64: tinyB64,
  });
  _assert(r.ok, 'registerUser should ok: ' + JSON.stringify(r));
  _assert(r.pendingId, 'should return pendingId');
  const pending = findOne('PendingUsers', 'pending_id', r.pendingId);
  _assert(pending, 'pending row should exist');
  _assertEq(pending.status, 'pending');
  _assertEq(pending.full_name, 'ทดสอบ ระบบ');
}

function test_approveUser_creates_employee() {
  // หา pending จาก test ก่อนหน้า
  const pending = rows('PendingUsers').filter(function (p) {
    return String(p.line_user_id) === TEST_NEW_USER_UID && String(p.status) === 'pending';
  })[0];
  _assert(pending, 'need pending from previous test');

  // สร้าง product ก่อน
  const cp = createProduct({
    lineUserId: TEST_OWNER_UID, sku: 'TEST-001',
    productName: 'สินค้าทดสอบ', scriptText: 'สวัสดี {name}', rebuyDays: 30,
  });
  _assert(cp.ok, 'createProduct: ' + JSON.stringify(cp));

  // approve
  const r = approvePendingUser({
    lineUserId: TEST_OWNER_UID,
    pendingId: pending.pending_id,
    decision: 'approve',
    role: 'staff',
    team: 'ทีมทดสอบ',
    productSkus: ['TEST-001'],
  });
  _assert(r.ok, 'approve: ' + JSON.stringify(r));
  _assertEq(r.decision, 'approved');
  _assert(r.employeeId, 'should return employeeId');

  // เช็ค Employees
  const emp = findOne('Employees', 'employee_id', r.employeeId);
  _assert(emp, 'employee should exist');
  _assertEq(emp.role, 'staff');
  _assertEq(emp.team, 'ทีมทดสอบ');
  _assert(isTruthy(emp.is_active));

  // เช็ค ProductAssignments
  const pa = rows('ProductAssignments').filter(function (a) {
    return String(a.employee_id) === String(r.employeeId) && String(a.sku) === 'TEST-001';
  });
  _assertEq(pa.length, 1);

  // อัพเดต line_user_id เพื่อ test ถัดไป (ให้เป็น TEST_STAFF_UID_1)
  updateRow('Employees', emp._row, { line_user_id: TEST_STAFF_UID_1 });
}

function test_assignProduct() {
  // สร้าง employee อีกคน + product อีกตัว
  const empId2 = nextRunning('EMP', 'Employees', 'employee_id');
  appendRow('Employees', {
    employee_id: empId2, line_user_id: TEST_STAFF_UID_2,
    display_name: 'Test Staff 2', full_name: 'staff 2', phone: '0800000002',
    role: 'staff', team: 'ทีมทดสอบ', report_to: '',
    is_active: true, is_banned: false, joined_at: nowBkk(),
  });
  createProduct({
    lineUserId: TEST_OWNER_UID, sku: 'TEST-002',
    productName: 'สินค้า 2', rebuyDays: 30,
  });
  const r = assignProduct({
    lineUserId: TEST_OWNER_UID,
    employeeId: empId2, sku: 'TEST-002',
  });
  _assert(r.ok, 'assignProduct: ' + JSON.stringify(r));
  const pa = rows('ProductAssignments').filter(function (a) {
    return String(a.employee_id) === empId2 && String(a.sku) === 'TEST-002' && isTruthy(a.is_active);
  });
  _assertEq(pa.length, 1);
}

function test_importCsv_product_based_assignment() {
  // CSV: 2 orders, ทั้งสอง SKU มี TEST-001 ทั้งคู่ → ควรไป staff_1 (คนที่ดูแล TEST-001)
  const csv =
    'Order ID,Recipient,Phone,SKU,Product Name,Quantity,Amount,Created Time\n' +
    'TEST-ORD-001,ลูกค้าทดสอบ 1,0899999991,TEST-001,สินค้าทดสอบ,1,500,2026-05-13\n' +
    'TEST-ORD-002,ลูกค้าทดสอบ 2,0899999992,TEST-002,สินค้า 2,1,800,2026-05-13\n';
  const b64 = Utilities.base64Encode(csv);
  const r = importCsv({ lineUserId: TEST_OWNER_UID, csvBase64: b64, filename: 'test.csv' });
  _assert(r.ok, 'importCsv: ' + JSON.stringify(r));
  _assertEq(r.summary.ordersCreated, 2);

  // เช็ค lead ของลูกค้า 1 → assigned ไปคนที่ดูแล TEST-001
  const cust1 = findOne('Customers', 'phone', '0899999991');
  _assert(cust1, 'cust1 exist');
  const lead1 = rows('Leads').filter(function (l) {
    return String(l.customer_id) === String(cust1.customer_id);
  })[0];
  _assert(lead1, 'lead1 exist');

  const emp1 = findEmployee(TEST_STAFF_UID_1);
  _assertEq(lead1.assigned_to, emp1.employee_id, 'lead1 should go to staff_1 (TEST-001 owner)');
  _assertEq(lead1.primary_sku, 'TEST-001');

  // ลูกค้า 2 → assigned ไปคนที่ดูแล TEST-002
  const cust2 = findOne('Customers', 'phone', '0899999992');
  const lead2 = rows('Leads').filter(function (l) {
    return String(l.customer_id) === String(cust2.customer_id);
  })[0];
  _assert(lead2, 'lead2 exist');
  const emp2 = findEmployee(TEST_STAFF_UID_2);
  _assertEq(lead2.assigned_to, emp2.employee_id, 'lead2 should go to staff_2 (TEST-002 owner)');
}

function test_recordCallResult_bought() {
  // หา lead 1 ที่ assigned ให้ staff_1
  const cust1 = findOne('Customers', 'phone', '0899999991');
  const lead1 = rows('Leads').filter(function (l) {
    return String(l.customer_id) === String(cust1.customer_id);
  })[0];

  const r = recordCallResult({
    lineUserId: TEST_STAFF_UID_1,
    leadId: lead1.lead_id,
    result: 'bought',
  });
  _assert(r.ok, 'recordCallResult: ' + JSON.stringify(r));
  _assertEq(r.newStatus, 'closed');

  // เช็ค customer.stage = ACTIVE
  const updated = findOne('Customers', 'customer_id', cust1.customer_id);
  _assertEq(updated.stage, 'ACTIVE');

  // เช็ค Lead.next_action_at +30 days
  const updatedLead = findOne('Leads', 'lead_id', lead1.lead_id);
  _assert(updatedLead.next_action_at, 'should have next_action_at');
  const days = diffDays(new Date(updatedLead.next_action_at), new Date());
  _assert(days > 28 && days < 31, 'next_action_at should be ~30 days from now, got ' + days);
}

function test_blacklistRequest_approve() {
  // ใช้ lead2 ที่ยังไม่ได้ปิด
  const cust2 = findOne('Customers', 'phone', '0899999992');
  const lead2 = rows('Leads').filter(function (l) {
    return String(l.customer_id) === String(cust2.customer_id) && String(l.status) === 'pending';
  })[0];
  _assert(lead2, 'need open lead2');

  // staff ขอ blacklist
  const r1 = recordCallResult({
    lineUserId: TEST_STAFF_UID_2,
    leadId: lead2.lead_id,
    result: 'blacklist_req',
    note: 'ลูกค้าด่าทุกครั้งที่โทร ทดสอบ',
  });
  _assert(r1.ok, 'request bl: ' + JSON.stringify(r1));
  _assertEq(r1.newStatus, 'blacklist_req');

  // owner approve
  const r2 = approveBlacklist({
    lineUserId: TEST_OWNER_UID,
    leadId: lead2.lead_id,
    approve: true,
  });
  _assert(r2.ok, 'approve bl: ' + JSON.stringify(r2));
  const updated = findOne('Customers', 'customer_id', cust2.customer_id);
  _assert(isTruthy(updated.blacklist), 'customer should be blacklisted');
}

function test_requestLeave_then_skip_assign() {
  // staff_1 ขอลาวันนี้
  const today = todayBkk();
  const r1 = requestLeave({
    lineUserId: TEST_STAFF_UID_1,
    startDate: today, endDate: today,
    leaveType: 'sick', reason: 'ทดสอบ',
  });
  _assert(r1.ok, 'requestLeave: ' + JSON.stringify(r1));

  // owner approve
  const r2 = approveLeave({
    lineUserId: TEST_OWNER_UID,
    leaveId: r1.leaveId,
    approve: true,
  });
  _assert(r2.ok, 'approveLeave: ' + JSON.stringify(r2));

  // เช็ค isOnLeaveToday
  const emp1 = findEmployee(TEST_STAFF_UID_1);
  _assert(isOnLeaveToday(emp1.employee_id), 'should be on leave');

  // import order TEST-001 → ไม่ควร assign ให้ staff_1 (กำลังลา)
  const csv =
    'Order ID,Recipient,Phone,SKU,Product Name,Quantity,Amount,Created Time\n' +
    'TEST-ORD-LEAVE,ลูกค้าระหว่างลา,0899999993,TEST-001,สินค้าทดสอบ,1,500,2026-05-13\n';
  const r3 = importCsv({ lineUserId: TEST_OWNER_UID, csvBase64: Utilities.base64Encode(csv), filename: 'leave.csv' });
  _assert(r3.ok, 'import: ' + JSON.stringify(r3));

  const cust3 = findOne('Customers', 'phone', '0899999993');
  const lead3 = rows('Leads').filter(function (l) {
    return String(l.customer_id) === String(cust3.customer_id);
  })[0];
  _assert(lead3, 'lead3 exist');
  _assert(String(lead3.assigned_to) !== String(emp1.employee_id),
    'lead3 should NOT go to staff_1 (on leave), but got ' + lead3.assigned_to);
}

function test_banEmployee_reassigns_leads() {
  // เพิ่ม pending lead ให้ staff_2 ก่อน
  const emp2 = findEmployee(TEST_STAFF_UID_2);
  const cust = findOne('Customers', 'phone', '0899999991'); // มีอยู่แล้ว
  const leadId = nextDated('LEAD', 'Leads', 'lead_id');
  appendRow('Leads', {
    lead_id: leadId, customer_id: cust.customer_id, order_ids: '',
    primary_sku: 'TEST-002',
    assigned_to: emp2.employee_id, assigned_at: nowBkk(),
    assignment_reason: 'test',
    status: 'pending', due_date: nowBkk(),
    next_action_at: '', closed_at: '',
    result: '', reject_reason: '', note: '', session_id: '',
  });

  // ban staff_2
  const r = banEmployee({
    lineUserId: TEST_OWNER_UID,
    employeeId: emp2.employee_id,
    reason: 'test ban',
  });
  _assert(r.ok, 'ban: ' + JSON.stringify(r));
  _assert(r.leadsReassigned > 0, 'should reassign at least 1 lead, got ' + r.leadsReassigned);
  _assert(r.productsUnassigned > 0, 'should unassign products');

  // เช็ค lead ถูก reassign แล้ว
  const updated = findOne('Leads', 'lead_id', leadId);
  _assert(String(updated.assigned_to) !== String(emp2.employee_id),
    'lead should not be on banned emp anymore');
}

function test_rollbackSession() {
  // หา session ที่เพิ่ง import test_importCsv_product_based_assignment
  const sessions = rows('Sessions').filter(function (s) {
    return String(s.csv_filename) === 'test.csv' && String(s.status) === 'active';
  });
  _assert(sessions.length > 0, 'need test session');
  const sid = sessions[sessions.length - 1].session_id;

  const r = rollbackSession({
    lineUserId: TEST_OWNER_UID,
    sessionId: sid,
  });
  _assert(r.ok, 'rollback: ' + JSON.stringify(r));
  _assert(r.deletedOrders >= 0, 'should report deleted');

  const sess = findOne('Sessions', 'session_id', sid);
  _assertEq(sess.status, 'rolled_back');
}

function test_auditLog_every_action() {
  // ตรวจว่ามี audit log ของ actions ที่ test รัน
  const wanted = ['user.register', 'user.approve', 'product.created', 'product.assigned',
                  'lead.assigned', 'call.result_recorded', 'blacklist.approved',
                  'leave.requested', 'leave.approved', 'user.ban', 'session.rolled_back'];
  const all = rows('AuditLog');
  wanted.forEach(function (a) {
    const found = all.some(function (l) { return String(l.action) === a; });
    _assert(found, 'missing audit for action: ' + a);
  });
}
