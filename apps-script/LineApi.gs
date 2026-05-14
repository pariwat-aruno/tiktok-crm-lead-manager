/**
 * LineApi.gs — push LINE message with retry
 */

function _lineToken_() {
  return PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
}

function pushText(userId, text) {
  return _push_(userId, [{ type: 'text', text: text }]);
}

function pushFlex(userId, flex) {
  if (!flex || !flex.contents) {
    logWarn('pushFlex', 'invalid flex', flex);
    return false;
  }
  return _push_(userId, [flex]);
}

function _push_(userId, messages) {
  const token = _lineToken_();
  if (!token) { logWarn('push', 'no token'); return false; }
  if (!userId) return false;

  for (let i = 1; i <= 3; i++) {
    try {
      const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify({ to: userId, messages: messages }),
        muteHttpExceptions: true,
      });
      const code = res.getResponseCode();
      if (code >= 200 && code < 300) return true;
      if (code < 500 && code !== 429) {
        logWarn('push', 'http ' + code, res.getContentText().slice(0, 200));
        return false;
      }
    } catch (e) {
      logWarn('push', 'attempt ' + i + ': ' + e.message);
    }
    Utilities.sleep(Math.pow(2, i) * 500);
  }
  return false;
}

function _pushDistinct_(messageOrFlex, uids) {
  const msg = messageOrFlex && messageOrFlex.contents
    ? messageOrFlex
    : { type: 'text', text: String(messageOrFlex) };
  let sent = 0;
  const seen = new Set();
  uids.forEach(function (uid) {
    if (!uid) return;
    const k = String(uid);
    if (seen.has(k)) return;
    seen.add(k);
    if (_push_(k, [msg])) sent++;
  });
  return sent;
}

function pushToAllOwners(messageOrFlex) {
  return _pushDistinct_(messageOrFlex,
    rows('Owners').map(function (o) { return o.line_user_id; }));
}

function pushToManagers(messageOrFlex) {
  return _pushDistinct_(messageOrFlex,
    rows('Employees').filter(function (e) {
      return String(e.role) === 'manager' && isActive(e);
    }).map(function (e) { return e.line_user_id; }));
}

function pushToLeads(messageOrFlex) {
  return _pushDistinct_(messageOrFlex,
    rows('Employees').filter(function (e) {
      return ['lead', 'manager'].indexOf(String(e.role)) >= 0 && isActive(e);
    }).map(function (e) { return e.line_user_id; }));
}

/**
 * push ไปทั้ง managers + owners แบบ dedup — ใช้ใน dailyReport / anomaly
 */
function pushToManagersAndOwners(messageOrFlex) {
  const uids = [];
  rows('Owners').forEach(function (o) { uids.push(o.line_user_id); });
  rows('Employees').forEach(function (e) {
    if (String(e.role) === 'manager' && isActive(e)) uids.push(e.line_user_id);
  });
  return _pushDistinct_(messageOrFlex, uids);
}
