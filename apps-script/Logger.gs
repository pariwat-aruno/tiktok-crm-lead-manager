/**
 * Logger.gs — system log → Sheet Logs (technical)
 */

function log_(level, fn, msg, payload) {
  try {
    const p = payload === undefined ? '' :
      (typeof payload === 'string' ? payload : JSON.stringify(payload));
    tab_('Logs').appendRow([nowBkk(), level, fn, msg, p.toString().slice(0, 500)]);
  } catch (e) {
    Logger.log('[log fail] ' + e.message);
  }
}

function logInfo(fn, msg, payload) { log_('INFO', fn, msg, payload); }
function logWarn(fn, msg, payload) { log_('WARN', fn, msg, payload); }
function logError(fn, msg, payload) {
  log_('ERROR', fn, msg, payload);
  Logger.log('[ERROR] ' + fn + ': ' + msg);
}
