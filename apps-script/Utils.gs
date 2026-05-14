/**
 * Utils.gs — helpers ทั่ว project
 */

const TZ = 'Asia/Bangkok';

/* ===== Spreadsheet ===== */
function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('SHEET_ID ว่าง — รัน setupAll() ก่อน');
  return SpreadsheetApp.openById(id);
}

function tab_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('ไม่มี tab: ' + name);
  return sh;
}

function rows(name) {
  const sh = tab_(name);
  if (sh.getLastRow() < 2) return [];
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  return data.map(function (r, i) {
    const o = {};
    headers.forEach(function (h, j) { o[h] = r[j]; });
    o._row = i + 2;
    return o;
  });
}

function appendRow(name, obj) {
  const sh = tab_(name);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const row = headers.map(function (h) {
    return obj[h] !== undefined ? obj[h] : '';
  });
  sh.appendRow(row);
  return sh.getLastRow();
}

function updateRow(name, rowIndex, obj) {
  const sh = tab_(name);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  Object.keys(obj).forEach(function (k) {
    const idx = headers.indexOf(k);
    if (idx >= 0) sh.getRange(rowIndex, idx + 1).setValue(obj[k]);
  });
}

function findOne(name, col, value) {
  const all = rows(name);
  for (let i = 0; i < all.length; i++) {
    if (String(all[i][col]) === String(value)) return all[i];
  }
  return null;
}

function findRowIndex(sheetOrName, col, value) {
  const sh = typeof sheetOrName === 'string' ? tab_(sheetOrName) : sheetOrName;
  if (sh.getLastRow() < 2) return -1;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const idx = headers.indexOf(col);
  if (idx < 0) return -1;
  const data = sh.getRange(2, idx + 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(value)) return i + 2;
  }
  return -1;
}

function deleteRowsWhere(name, condition) {
  const sh = tab_(name);
  if (sh.getLastRow() < 2) return 0;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const toDel = [];
  data.forEach(function (r, i) {
    const o = {};
    headers.forEach(function (h, j) { o[h] = r[j]; });
    if (condition(o)) toDel.push(i + 2);
  });
  toDel.reverse().forEach(function (r) { sh.deleteRow(r); });
  return toDel.length;
}

/* ===== Config ===== */
function getConfig() {
  const cfg = {};
  rows('Config').forEach(function (r) { cfg[r.key] = r.value; });
  return cfg;
}

function setConfig(key, value) {
  const r = findRowIndex('Config', 'key', key);
  if (r > 0) tab_('Config').getRange(r, 2).setValue(value);
  else appendRow('Config', { key: key, value: value, note: '' });
}

/* ===== Datetime ===== */
function nowBkk() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}
function todayBkk() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}
function fmtThaiDateTime(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return Utilities.formatDate(dt, TZ, 'd MMM yyyy HH:mm');
}
function addHours(d, h) {
  const dt = d instanceof Date ? d : new Date(d);
  return new Date(dt.getTime() + h * 3600 * 1000);
}
function addDays(d, days) {
  const dt = d instanceof Date ? d : new Date(d);
  return new Date(dt.getTime() + days * 86400 * 1000);
}
function diffHours(a, b) {
  const t1 = (a instanceof Date ? a : new Date(a)).getTime();
  const t2 = (b instanceof Date ? b : new Date(b)).getTime();
  return (t1 - t2) / 3600 / 1000;
}
function diffDays(a, b) { return diffHours(a, b) / 24; }

/* ===== IDs ===== */
function nextRunning(prefix, sheetName, colName) {
  const all = rows(sheetName);
  let max = 0;
  all.forEach(function (r) {
    const id = String(r[colName] || '');
    const parts = id.split('-');
    const n = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return prefix + '-' + String(max + 1).padStart(4, '0');
}

function nextDated(prefix, sheetName, colName) {
  const today = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd');
  const tp = prefix + '-' + today + '-';
  const all = rows(sheetName);
  let max = 0;
  all.forEach(function (r) {
    const id = String(r[colName] || '');
    if (id.indexOf(tp) === 0) {
      const n = parseInt(id.substring(tp.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  });
  return tp + String(max + 1).padStart(4, '0');
}

function newSessionId() {
  return 'SES-' + Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmmss');
}

/* ===== Normalize ===== */
function normName(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, '');
}
function normPhone(s) {
  let p = String(s || '').replace(/[^\d]/g, '');
  if (p.startsWith('66') && p.length >= 11) p = '0' + p.substring(2);
  return p;
}

/* ===== Lock ===== */
function withLock(fn, ms) {
  const lock = LockService.getScriptLock();
  const ok = lock.tryLock(ms || 5000);
  if (!ok) throw new Error('ระบบกำลังใช้งาน ลองอีกครั้ง');
  try { return fn(); }
  finally { lock.releaseLock(); }
}

/* ===== Misc ===== */
function isTruthy(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

function safeJson(s, fallback) {
  try { return JSON.parse(s); } catch (e) { return fallback === undefined ? null : fallback; }
}
