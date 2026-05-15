/**
 * WebApp.gs — GET serve HTML / POST JSON API
 */

// ตัวแปร template ที่ doGet ตั้งไว้ — include() จะหยิบไปใส่ child template (_app, _styles)
// Apps Script รันแต่ละ request เป็น execution แยก → global นี้ถูก reset ทุก request → ปลอดภัย
var _TEMPLATE_VARS = {};

function doGet(e) {
  // รองรับ 3 รูปแบบ url:
  //   1) ?page=xxx                       — query string ตรงๆ
  //   2) /xxx (pathInfo)                 — LIFF deep link เช่น liff.line.me/<id>/id
  //   3) ?liff.state=%3Fpage%3Dxxx       — LIFF wraps query string เดิม
  const PATH_MAP = {
    'id': 'myid', 'myid': 'myid',
    'reg': 'register', 'register': 'register',
    'app': 'app',
    'staff': 'staff', 'lead': 'lead', 'manager': 'manager', 'owner': 'owner',
    'leave': 'leave', 'index': 'index',
    'genmenu': 'genmenu', 'menu': 'genmenu',
  };
  const param = (e && e.parameter) || {};
  let page = 'index';
  if (e && e.pathInfo) {
    page = PATH_MAP[String(e.pathInfo).toLowerCase()] || e.pathInfo;
  } else if (param.page) {
    page = PATH_MAP[String(param.page).toLowerCase()] || param.page;
  } else if (param['liff.state']) {
    const m = String(param['liff.state']).match(/[?&]page=([a-z]+)/i);
    if (m) page = PATH_MAP[m[1].toLowerCase()] || m[1];
  }
  const cfg = getConfig();
  const brand = cfg.brand_name || 'TikTok CRM';
  const color = cfg.brand_color || '#c8102e';
  const liffId = PropertiesService.getScriptProperties().getProperty('LIFF_ID') || cfg.liff_id || '';
  // Apps Script-only: ใช้ Web App URL เป็น base สำหรับ page links
  // API calls จาก HTML จะใช้ google.script.run.apiRoute() เพื่อเลี่ยง POST redirect/CORS
  const apiUrl = ScriptApp.getService().getUrl().replace(/\/a\/[^\/]+\/macros\//, '/macros/');

  const pages = {
    index: 'page-index',
    myid: 'page-myid',
    register: 'page-register',
    app: 'page-app',
    staff: 'page-staff',
    lead: 'page-lead',
    manager: 'page-manager',
    owner: 'page-owner',
    leave: 'page-leave',
    genmenu: 'page-genmenu',
  };
  const tmplName = pages[page] || pages.index;

  // เก็บตัวแปรไว้ให้ include() ใช้กับ child template (_app, _styles)
  _TEMPLATE_VARS = {
    brand: brand,
    color: color,
    liffId: liffId,
    apiUrl: apiUrl,
    page: page,
    params: (e && e.parameter) || {},
  };

  const t = HtmlService.createTemplateFromFile(tmplName);
  Object.keys(_TEMPLATE_VARS).forEach(function (k) { t[k] = _TEMPLATE_VARS[k]; });

  return t.evaluate()
    .setTitle(brand)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, user-scalable=no');
}

/**
 * include — evaluate child template (_app, _styles) + ส่งตัวแปรจาก doGet ให้
 * ⚠ ต้องใช้ createTemplateFromFile().evaluate() ไม่ใช่ createHtmlOutputFromFile()
 *   เพราะ _app.html / _styles.html มี scriptlet <?= ?> ที่ต้อง evaluate
 */
function include(name) {
  const t = HtmlService.createTemplateFromFile(name);
  Object.keys(_TEMPLATE_VARS).forEach(function (k) { t[k] = _TEMPLATE_VARS[k]; });
  return t.evaluate().getContent();
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return _json({ ok: false, error: 'invalid_json' });
  }

  // LINE webhook (มี events array)
  if (_isLineWebhook(body)) {
    try {
      return _json(handleLineWebhook(body));
    } catch (err) {
      logError('doPost.webhook', err.message);
      return _json({ ok: false, error: 'webhook_error', detail: err.message });
    }
  }

  // JSON API ของ frontend (มี action)
  const action = body.action || '';
  try {
    return _json(route_(action, body));
  } catch (err) {
    logError('doPost', action + ': ' + err.message);
    return _json({ ok: false, error: 'server_error', detail: err.message });
  }
}

/**
 * Public wrapper for google.script.run from HtmlService pages.
 * This keeps all frontend API calls inside Apps Script and avoids Web App POST redirects.
 */
function apiRoute(action, args) {
  try {
    return route_(action, args || {});
  } catch (err) {
    logError('apiRoute', action + ': ' + err.message);
    return { ok: false, error: 'server_error', detail: err.message };
  }
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function route_(action, args) {
  args = args || {};
  switch (action) {
    case 'ping': return { ok: true, time: nowBkk() };
    case 'getMyRole': return getMyRole(args.lineUserId);

    // Onboarding
    case 'registerUser':       return registerUser(args);
    case 'getPendingUsers':    return getPendingUsers(args);
    case 'approvePendingUser': return approvePendingUser(args);

    // Staff
    case 'getMyQueue':       return getMyQueue(args);
    case 'getLeadDetail':    return getLeadDetail(args);
    case 'logCopyPhone':     return logCopyPhone(args);
    case 'recordCallResult': return recordCallResult(args);

    // Attendance (clock-in/out)
    case 'clockIn':          return clockIn(args);
    case 'clockOut':         return clockOut(args);
    case 'getAttendance':    return getAttendance(args);

    // Allocation (Lead actions on no-show)
    case 'restoreSlot':      return restoreSlot(args);
    case 'cancelSlot':       return cancelSlot(args);
    case 'runPrepareMorningQueue': return runPrepareMorningQueue(args);

    // Leave
    case 'requestLeave':     return requestLeave(args);
    case 'approveLeave':     return approveLeave(args);
    case 'cancelLeave':      return cancelLeave(args);
    case 'getMyLeaves':      return getMyLeaves(args);
    case 'getPendingLeaves': return getPendingLeaves(args);

    // Lead (team head)
    case 'getTeamDashboard':     return getTeamDashboard(args);
    case 'getBlacklistRequests': return getBlacklistRequests(args);
    case 'approveBlacklist':     return approveBlacklist(args);
    case 'getAuditCopy':         return getAuditCopy(args);

    // Manager
    case 'getManagerDashboard': return getManagerDashboard(args);
    case 'getMyTeamMembers':    return getMyTeamMembers(args);
    case 'getTeamPerformance':  return getTeamPerformance(args);

    // Owner
    case 'createProduct':     return createProduct(args);
    case 'deleteProduct':     return deleteProduct(args);
    case 'assignProduct':     return assignProduct(args);
    case 'unassignProduct':   return unassignProduct(args);
    case 'getMyProducts':     return getMyProducts(args);
    case 'getProductTeam':    return getProductTeam(args);
    case 'getAllEmployees':   return getAllEmployees(args);
    case 'banEmployee':       return banEmployee(args);
    case 'unbanEmployee':     return unbanEmployee(args);
    case 'getOwnerDashboard': return getOwnerDashboard(args);
    case 'getFullAuditLog':   return getFullAuditLog(args);
    case 'getQueueSnapshot':  return getQueueSnapshot(args);
    case 'getAllLeads':       return getAllLeads(args);
    case 'getLeadFullDetail': return getLeadFullDetail(args);
    case 'importCsv':         return importCsv(args);
    case 'rollbackSession':   return rollbackSession(args);
    case 'getRecentSessions': return getRecentSessions(args);
    case 'searchCustomers':   return searchCustomers(args);
    case 'mergeCustomers':    return mergeCustomers(args);

    // Rich menu
    case 'setupRichMenuFromBase64': return setupRichMenuFromBase64(args);

    default: return { ok: false, error: 'unknown_action', action: action };
  }
}
