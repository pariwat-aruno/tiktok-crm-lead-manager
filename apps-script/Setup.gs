/**
 * Setup.gs — รันครั้งเดียวจบ
 *
 * ★ ขั้นตอนพี่ปุ้ย ★
 *   1) เปิด Apps Script → เลือก function `setupAll` → Run
 *   2) อนุญาต permissions
 *   3) ดู Execution log จะเห็น Sheet URL และคำสั่งถัดไป
 *   4) Deploy → Web app → Anyone → ได้ URL
 *   5) สร้าง LINE LIFF (Endpoint = URL?page=app) → ได้ LIFF ID
 *   6) รัน:
 *        setLiffId('xxx')
 *        setLineAccessToken('xxx')
 *        addOwner('YOUR_LINE_USER_ID')   ← ไปเปิด ?page=myid เพื่อหา ID
 *   7) Run `runAllTests()` ตรวจ
 *   8) เสร็จ — ส่ง LIFF URL ให้พนักงาน
 */

const SHEET_HEADERS = {
  Owners: ['line_user_id', 'display_name', 'added_at', 'note'],

  Employees: [
    'employee_id', 'line_user_id', 'display_name', 'full_name',
    'phone', 'email', 'role', 'team', 'report_to',
    'selfie_url', 'id_card_url',
    'is_active', 'is_banned', 'ban_reason',
    'joined_at', 'approved_by', 'approved_at',
    'inactivated_at', 'banned_at',
  ],

  PendingUsers: [
    'pending_id', 'line_user_id', 'line_display_name',
    'full_name', 'nick_name', 'phone', 'email',
    'selfie_url', 'id_card_url',
    'requested_at', 'status',
    'reviewed_by', 'reviewed_at', 'rejection_reason',
  ],

  Products: [
    'sku', 'product_name', 'script_text', 'rebuy_days',
    'is_active', 'created_at',
  ],

  ProductAssignments: [
    'assignment_id', 'employee_id', 'sku',
    'assigned_at', 'assigned_by', 'is_active',
  ],

  Customers: [
    'customer_id', 'name', 'name_normalized', 'phone',
    'address', 'owner_employee_id', 'stage',
    'blacklist', 'blacklist_reason',
    'created_at', 'last_order_at', 'updated_at',
  ],

  Orders: [
    'order_id', 'customer_id', 'session_id',
    'sku', 'product_name', 'quantity', 'amount',
    'ordered_at', 'imported_at', 'csv_raw',
  ],

  Leads: [
    'lead_id', 'customer_id', 'order_ids', 'primary_sku',
    'assigned_to', 'assigned_at', 'assignment_reason',
    'status', 'due_date', 'next_action_at', 'closed_at',
    'result', 'reject_reason', 'note', 'session_id',
  ],

  CallLogs: [
    'log_id', 'lead_id', 'customer_id', 'employee_id',
    'action', 'result', 'reject_reason', 'note',
    'next_action_at', 'created_at',
  ],

  Leaves: [
    'leave_id', 'employee_id',
    'start_date', 'end_date',
    'leave_type', 'reason',
    'status', 'requested_at',
    'reviewed_by', 'reviewed_at', 'rejection_reason',
  ],

  Sessions: [
    'session_id', 'imported_by', 'csv_filename',
    'total_rows', 'orders_created', 'leads_created', 'customers_created',
    'status', 'created_at', 'rolled_back_at',
  ],

  Stats: [
    'date', 'employee_id', 'leads_assigned', 'leads_contacted',
    'leads_bought', 'revenue', 'contact_rate', 'conversion_rate',
  ],

  AuditLog: [
    'log_id', 'timestamp',
    'actor_employee_id', 'actor_line_user_id', 'actor_role',
    'action', 'target_type', 'target_id',
    'before_value', 'after_value', 'note',
  ],

  Config: ['key', 'value', 'note'],

  Logs: ['timestamp', 'level', 'function', 'message', 'payload'],
};

const DEFAULT_CONFIG = [
  ['brand_name', 'TikTok CRM', 'ชื่อแบรนด์ในหน้า UI'],
  ['brand_color', '#c8102e', 'สีหลัก'],
  ['liff_id', '', 'LIFF ID'],
  ['sla_hours', '48', 'ภายในกี่ชม. ต้องโทร'],
  ['reassign_hours', '72', 'เกินกี่ชม. ระบบ reassign'],
  ['rebuy_default_days', '30', 'รอบโทรซ้ำ default'],
  ['dormant_days', '90', 'ไม่ซื้อกี่วัน = DORMANT'],
  ['churn_days', '180', 'ไม่ซื้อกี่วัน = CHURNED'],
  ['rr_pointer', '0', 'round-robin pointer'],
  ['copy_anomaly_threshold', '20', 'copy/วัน ก่อนแจ้ง'],
  ['rollback_window_hours', '24', 'rollback ได้ใน ชม.'],
  ['leave_min_advance_days', '0', 'ลาล่วงหน้าขั้นต่ำ'],
  ['leave_max_days', '14', 'ลาได้สูงสุด/ครั้ง'],
  ['drive_folder_id', '', 'Drive folder for uploads'],
];

/**
 * ★ MAIN — รันฟังก์ชันนี้ตัวเดียวจบ
 */
function setupAll() {
  const p = function (msg) { Logger.log(msg); };
  p('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  p('  TIKTOK CRM — Setup');
  p('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1) Spreadsheet
  const props = PropertiesService.getScriptProperties();
  let sheetId = props.getProperty('SHEET_ID');
  let ss;
  if (sheetId) {
    try {
      ss = SpreadsheetApp.openById(sheetId);
      p('✓ ใช้ Sheet เดิม: ' + ss.getName());
    } catch (e) {
      sheetId = null;
    }
  }
  if (!sheetId) {
    ss = SpreadsheetApp.create('TikTok CRM Database');
    sheetId = ss.getId();
    props.setProperty('SHEET_ID', sheetId);
    p('✓ สร้าง Sheet ใหม่');
  }
  p('   URL: ' + ss.getUrl());
  p('');

  // 2) Sheets
  p('━━━ สร้าง 15 Sheet tabs ━━━');
  Object.keys(SHEET_HEADERS).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      p('  + ' + name);
    } else {
      p('  · ' + name + ' (มีอยู่แล้ว)');
    }
    const headers = SHEET_HEADERS[name];
    if (sh.getLastColumn() < headers.length) {
      sh.getRange(1, 1, 1, headers.length)
        .setValues([headers])
        .setFontWeight('bold')
        .setBackground('#fff5f5')
        .setFontColor('#9a0c24');
      sh.setFrozenRows(1);
      try { sh.autoResizeColumns(1, headers.length); } catch (e) {}
    }
  });
  const def = ss.getSheetByName('Sheet1');
  if (def && !SHEET_HEADERS.Sheet1) { ss.deleteSheet(def); p('  - ลบ Sheet1'); }
  p('');

  // 3) Config
  p('━━━ Seed Config ━━━');
  const cfgSheet = ss.getSheetByName('Config');
  const existing = cfgSheet.getLastRow() > 1
    ? cfgSheet.getRange(2, 1, cfgSheet.getLastRow() - 1, 1).getValues().map(function (r) { return r[0]; })
    : [];
  DEFAULT_CONFIG.forEach(function (row) {
    if (existing.indexOf(row[0]) < 0) {
      cfgSheet.appendRow(row);
      p('  + ' + row[0] + ' = ' + row[1]);
    }
  });
  p('');

  // 4) Drive folder
  p('━━━ Drive folder สำหรับเก็บรูป ━━━');
  let folderId = props.getProperty('DRIVE_FOLDER_ID');
  if (!folderId) {
    const folder = DriveApp.createFolder('TikTok CRM - Uploads');
    folderId = folder.getId();
    props.setProperty('DRIVE_FOLDER_ID', folderId);
    p('  + สร้าง folder: ' + folder.getName());
  } else {
    try {
      const f = DriveApp.getFolderById(folderId);
      p('  · folder เดิม: ' + f.getName());
    } catch (e) {
      const folder = DriveApp.createFolder('TikTok CRM - Uploads');
      folderId = folder.getId();
      props.setProperty('DRIVE_FOLDER_ID', folderId);
      p('  + สร้าง folder ใหม่ (เดิมหายไป)');
    }
  }
  p('');

  // 5) Default Script Properties
  p('━━━ Script Properties ━━━');
  ['LIFF_ID', 'LINE_CHANNEL_ACCESS_TOKEN'].forEach(function (k) {
    if (props.getProperty(k) === null) {
      props.setProperty(k, '');
      p('  + ' + k + ' = (ว่าง — ต้อง set ทีหลัง)');
    } else {
      p('  · ' + k + ' = ' + (props.getProperty(k) ? '[ตั้งแล้ว]' : '(ว่าง)'));
    }
  });
  p('');

  // 6) Triggers (ตอนนี้ติดตั้งเปล่า — function จริงอยู่ใน Reminder.gs)
  p('━━━ Cron triggers ━━━');
  try {
    setupTriggers();
    p('  ✓ ติดตั้ง 4 cron jobs');
  } catch (e) {
    p('  ⚠ Reminder.gs ยังไม่มี — Claude Code จะเขียนทีหลัง');
  }
  p('');

  // 7) สรุป
  const webAppUrl = (function () {
    try { return ScriptApp.getService().getUrl(); } catch (e) { return null; }
  })();

  p('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  p('  ✅ SETUP เสร็จ');
  p('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  p('');
  p('📋 ขั้นตอนต่อไป:');
  p('');
  p('  1) เปิด Sheet ที่สร้าง:');
  p('     ' + ss.getUrl());
  p('');
  if (!webAppUrl) {
    p('  2) Deploy → New deployment → Web app');
    p('     - Execute as: Me');
    p('     - Who has access: Anyone');
    p('     จะได้ Web App URL → ใช้ใน LIFF Endpoint');
  } else {
    p('  2) Web App URL ปัจจุบัน:');
    p('     ' + webAppUrl);
  }
  p('');
  p('  3) ไป LINE Developers Console:');
  p('     - สร้าง LIFF app 1 ตัว');
  p('     - Endpoint = <Web App URL>?page=app');
  p('     - Size = Full');
  p('     - Scope = profile, openid');
  p('     - Bot link = (เลือก LINE OA ของคุณ)');
  p('');
  p('  4) กลับมา Apps Script Editor รัน:');
  p('     setLiffId("YOUR_LIFF_ID")');
  p('     setLineAccessToken("YOUR_TOKEN")');
  p('     addOwner("YOUR_LINE_USER_ID")');
  p('');
  p('     (วิธีหา User ID: เปิด LIFF URL บนมือถือ → ?page=myid)');
  p('');
  p('  5) Run runAllTests() ตรวจสอบ');
  p('');

  return { ok: true, sheetUrl: ss.getUrl(), sheetId: sheetId };
}

/**
 * ตั้ง LIFF ID หลังสร้าง LIFF app
 */
function setLiffId(liffId) {
  if (!liffId) throw new Error('liffId required');
  PropertiesService.getScriptProperties().setProperty('LIFF_ID', liffId);
  const cfg = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID')).getSheetByName('Config');
  const headers = cfg.getRange(1, 1, 1, cfg.getLastColumn()).getValues()[0];
  const keyIdx = headers.indexOf('key');
  const valIdx = headers.indexOf('value');
  const data = cfg.getRange(2, 1, cfg.getLastRow() - 1, cfg.getLastColumn()).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][keyIdx]) === 'liff_id') {
      cfg.getRange(i + 2, valIdx + 1).setValue(liffId);
      break;
    }
  }
  Logger.log('✓ LIFF_ID set: ' + liffId);
}

function setLineAccessToken(token) {
  if (!token) throw new Error('token required');
  PropertiesService.getScriptProperties().setProperty('LINE_CHANNEL_ACCESS_TOKEN', token);
  Logger.log('✓ LINE_CHANNEL_ACCESS_TOKEN set');
}

/**
 * Legacy: เคยใช้ Cloudflare Worker proxy
 * ตอนนี้ระบบกลับมาเป็น Apps Script-only แล้ว จึงไม่ใช้ค่านี้ใน WebApp.gs
 */
function setWorkerUrl(url) {
  if (!url) throw new Error('url required');
  url = String(url).replace(/\/+$/, '');
  PropertiesService.getScriptProperties().setProperty('WORKER_URL', url);
  Logger.log('⚠ WORKER_URL ถูกตั้งไว้ แต่ WebApp.gs เวอร์ชัน Apps Script-only จะไม่ใช้ค่านี้แล้ว: ' + url);
}

function _setWorker() {
  Logger.log('⚠ ยกเลิกแล้ว: โปรเจกต์นี้ไม่ใช้ Cloudflare Worker');
  clearWorkerUrl();
}

function clearWorkerUrl() {
  PropertiesService.getScriptProperties().deleteProperty('WORKER_URL');
  Logger.log('✓ ลบ WORKER_URL แล้ว — ใช้ Apps Script-only');
}

function setupAppsScriptOnlyMode() {
  clearWorkerUrl();
  const url = ScriptApp.getService().getUrl().replace(/\/a\/[^\/]+\/macros\//, '/macros/');
  Logger.log('━━━ Apps Script-only mode ━━━');
  Logger.log('Web App URL: ' + url);
  Logger.log('LINE LIFF Endpoint URL ให้ตั้งเป็น:');
  Logger.log(url + '?page=app');
  Logger.log('');
  Logger.log('ถ้า LIFF ยัง timeout ระบบจะ fallback เป็นหน้าใส่ LINE User ID เอง');
  Logger.log('ผู้ใช้หา ID ได้โดยพิมพ์ "id" ใน LINE OA');
  return { ok: true, webAppUrl: url, liffEndpoint: url + '?page=app' };
}

/**
 * เพิ่ม Owner คนแรก (manual — จาก Apps Script Editor)
 */
function addOwner(lineUserId, displayName) {
  if (!lineUserId) throw new Error('lineUserId required');
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  const sh = ss.getSheetByName('Owners');

  // check duplicate
  if (sh.getLastRow() > 1) {
    const existing = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < existing.length; i++) {
      if (String(existing[i][0]) === String(lineUserId)) {
        Logger.log('· Owner มีอยู่แล้ว: ' + lineUserId);
        return;
      }
    }
  }
  sh.appendRow([lineUserId, displayName || 'Owner', new Date().toISOString(), 'added via addOwner()']);
  Logger.log('✓ Owner เพิ่มแล้ว: ' + lineUserId);
}

/**
 * แสดงข้อมูลระบบ — debug
 */
function showInfo() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('SHEET_ID');
  if (!sheetId) { Logger.log('⚠ ยังไม่ได้รัน setupAll()'); return; }
  const ss = SpreadsheetApp.openById(sheetId);
  let webAppUrl;
  try { webAppUrl = ScriptApp.getService().getUrl(); } catch (e) { webAppUrl = '(ยังไม่ deploy)'; }

  Logger.log('━━━ ระบบ TikTok CRM ━━━');
  Logger.log('Sheet: ' + ss.getUrl());
  Logger.log('Web App: ' + webAppUrl);
  Logger.log('LIFF_ID: ' + (props.getProperty('LIFF_ID') || '(ว่าง)'));
  Logger.log('WORKER_URL: ' + (props.getProperty('WORKER_URL') || '(ไม่ใช้ — Apps Script-only)'));
  Logger.log('LINE Token: ' + (props.getProperty('LINE_CHANNEL_ACCESS_TOKEN') ? '[set]' : '(ว่าง)'));
  Logger.log('Drive folder: ' + (props.getProperty('DRIVE_FOLDER_ID') || '(ว่าง)'));
  Logger.log('');
  Logger.log('Counts:');
  Object.keys(SHEET_HEADERS).forEach(function (n) {
    const sh = ss.getSheetByName(n);
    if (sh) Logger.log('  ' + n + ': ' + Math.max(0, sh.getLastRow() - 1));
  });

  if (webAppUrl !== '(ยังไม่ deploy)') {
    Logger.log('');
    Logger.log('Pages:');
    Logger.log('  Landing: ' + webAppUrl + '?page=index');
    Logger.log('  Auto:    ' + webAppUrl + '?page=app');
    Logger.log('  My ID:   ' + webAppUrl + '?page=myid');
    Logger.log('  Register:' + webAppUrl + '?page=register');
  }
}

/**
 * One-shot: เพิ่มพี่ปุ้ย (LINE userId hardcoded) เป็น owner คนแรก
 * รันครั้งเดียวจบ — หลังรันเสร็จลบ function นี้ทิ้งก็ได้
 */
function _addPrimaryOwner() {
  addOwner('Ub47d6b519be013dbe6e83c4fbd079c56', 'พี่ปุ้ย');
  Logger.log('ตอนนี้ Owners มี: ' + rows('Owners').length + ' คน');
}

/**
 * Reset data (ระวัง — ลบทั้งหมด ยกเว้น Config, Owners, Products, ProductAssignments, Employees)
 */
function resetTestData() {
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  ['Customers', 'Orders', 'Leads', 'CallLogs', 'Leaves', 'Sessions',
   'Stats', 'AuditLog', 'Logs', 'PendingUsers'].forEach(function (name) {
    const sh = ss.getSheetByName(name);
    if (sh && sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
    }
  });
  Logger.log('✓ Reset test data');
}
