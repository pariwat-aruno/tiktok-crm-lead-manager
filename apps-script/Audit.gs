/**
 * Audit.gs — เขียน Sheet AuditLog ทุก mutation
 *
 * เรียกใช้:
 *   audit({
 *     actor: lineUserId,
 *     actorRole: 'manager',
 *     action: 'user.approve',
 *     targetType: 'pending_user',
 *     targetId: 'PEND-0001',
 *     before: { status: 'pending' },
 *     after: { status: 'approved', employee_id: 'EMP-0010' },
 *     note: 'optional',
 *   });
 */

function audit(args) {
  try {
    args = args || {};
    const actorUid = args.actor || args.actorLineUserId || '';
    const emp = actorUid ? findOne('Employees', 'line_user_id', actorUid) : null;
    const actorEmpId = (emp && emp.employee_id) || args.actorEmployeeId || 'SYSTEM';
    const actorRole = args.actorRole || (emp && emp.role) || 'unknown';

    const logId = nextRunning('AUD', 'AuditLog', 'log_id');
    appendRow('AuditLog', {
      log_id: logId,
      timestamp: nowBkk(),
      actor_employee_id: actorEmpId,
      actor_line_user_id: actorUid,
      actor_role: actorRole,
      action: args.action || 'unknown',
      target_type: args.targetType || '',
      target_id: args.targetId || '',
      before_value: _toStr(args.before).slice(0, 500),
      after_value: _toStr(args.after).slice(0, 500),
      note: String(args.note || '').slice(0, 500),
    });
  } catch (e) {
    logError('audit', e.message, args);
  }
}

function _toStr(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch (e) { return String(v); }
}

/**
 * Query audit log
 *   queryAudit({ action: 'user.*', actorEmployeeId: 'EMP-001', from: '2026-05-01', to: '2026-05-13', limit: 100 })
 */
function queryAudit(filter) {
  filter = filter || {};
  let all = rows('AuditLog');
  if (filter.actorEmployeeId) {
    all = all.filter(function (a) { return String(a.actor_employee_id) === String(filter.actorEmployeeId); });
  }
  if (filter.targetType) {
    all = all.filter(function (a) { return String(a.target_type) === String(filter.targetType); });
  }
  if (filter.targetId) {
    all = all.filter(function (a) { return String(a.target_id) === String(filter.targetId); });
  }
  if (filter.action) {
    if (filter.action.indexOf('*') >= 0) {
      const prefix = filter.action.replace('*', '');
      all = all.filter(function (a) { return String(a.action).indexOf(prefix) === 0; });
    } else {
      all = all.filter(function (a) { return String(a.action) === String(filter.action); });
    }
  }
  if (filter.from) {
    all = all.filter(function (a) { return String(a.timestamp).slice(0, 10) >= filter.from; });
  }
  if (filter.to) {
    all = all.filter(function (a) { return String(a.timestamp).slice(0, 10) <= filter.to; });
  }
  all.sort(function (a, b) { return String(b.timestamp).localeCompare(String(a.timestamp)); });
  return all.slice(0, filter.limit || 200);
}
