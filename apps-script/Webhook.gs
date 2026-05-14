/**
 * Webhook.gs — รับ webhook event จาก LINE OA
 *
 * Event ที่ handle:
 *   - follow      → user add OA → reply welcome + ลิงก์ register
 *   - message     → user พิมพ์ใน chat → reply ตามคำสั่ง
 *   - unfollow    → noop (log อย่างเดียว)
 *   - postback    → handle ปุ่มที่ user กด (ถ้ามี)
 *
 * Webhook URL ที่ตั้งใน LINE Developers Console:
 *   <Web App URL> (เช่น https://script.google.com/macros/s/.../exec)
 *
 * ห้ามลืม: ใน LINE Developers Console
 *   - Messaging API → Webhook URL = Web App URL
 *   - Webhook usage = Enabled
 *   - Auto-reply messages = Disabled (ไม่งั้นจะตอบ default แทนเรา)
 *   - Greeting messages = Disabled
 */

function _isLineWebhook(body) {
  return body && Array.isArray(body.events);
}

function handleLineWebhook(body) {
  (body.events || []).forEach(function (event) {
    try {
      if (event.type === 'follow') _onFollow(event);
      else if (event.type === 'message' && event.message && event.message.type === 'text') _onMessage(event);
      else if (event.type === 'unfollow') _onUnfollow(event);
      else if (event.type === 'postback') _onPostback(event);
    } catch (e) {
      logError('webhook.' + event.type, e.message);
    }
  });
  return { ok: true };
}

function _onFollow(event) {
  const uid = event.source && event.source.userId;
  if (!uid) return;
  const liffId = PropertiesService.getScriptProperties().getProperty('LIFF_ID');
  const liffBase = liffId ? 'https://liff.line.me/' + liffId : '';

  // ตรวจสถานะ user
  let status;
  try { status = getMyRole(uid); } catch (e) { status = { ok: false }; }

  if (status.ok) {
    // มี user แล้ว — welcome กลับ + ลิงก์เปิดระบบ
    _reply(event.replyToken, [{
      type: 'text',
      text: 'ยินดีต้อนรับกลับ คุณ' + (status.displayName || '') + ' 👋\n' +
            'เปิดระบบ: ' + liffBase + '/app',
    }]);
  } else if (status.error === 'pending_review') {
    _reply(event.replyToken, [{
      type: 'text',
      text: 'คำขอลงทะเบียนของคุณกำลังรอ admin อนุมัติ\n' +
            'เมื่อ approve แล้วระบบจะส่ง LINE แจ้งคุณ',
    }]);
  } else if (status.error === 'banned') {
    _reply(event.replyToken, [{
      type: 'text',
      text: 'บัญชีของคุณถูกระงับ\nเหตุผล: ' + (status.reason || '-') + '\nติดต่อ admin',
    }]);
  } else {
    // user ใหม่ → ส่งลิงก์ register
    _reply(event.replyToken, [{
      type: 'text',
      text: 'ยินดีต้อนรับสู่ระบบ CRM 🎉\n\n' +
            'ลงทะเบียนพนักงานใหม่:\n' + liffBase + '/reg\n\n' +
            'หรือพิมพ์:\n' +
            '  • help — ดูเมนู\n' +
            '  • id — ดู LINE User ID',
    }]);
  }
  logInfo('webhook.follow', uid);
}

function _onUnfollow(event) {
  logInfo('webhook.unfollow', (event.source && event.source.userId) || '');
}

function _onMessage(event) {
  const uid = event.source && event.source.userId;
  if (!uid) return;
  const text = String(event.message.text || '').trim().toLowerCase();
  const liffId = PropertiesService.getScriptProperties().getProperty('LIFF_ID');
  const liffBase = liffId ? 'https://liff.line.me/' + liffId : '';

  // คำสั่ง
  if (text === 'id' || text === '/id' || text === 'myid') {
    _reply(event.replyToken, [{
      type: 'text',
      text: 'LINE User ID ของคุณ:\n' + uid + '\n\n' +
            '(ส่ง ID นี้ให้ admin ถ้าระบบขอ)',
    }]);
    return;
  }
  if (text === 'help' || text === '/help' || text === 'เมนู' || text === 'menu') {
    _reply(event.replyToken, [{
      type: 'text',
      text: '📋 คำสั่ง\n' +
            '• เปิดระบบ: ' + liffBase + '/app\n' +
            '• ลงทะเบียน: ' + liffBase + '/reg\n' +
            '• ขอลา: ' + liffBase + '/leave\n' +
            '• ดู ID: ' + liffBase + '/id\n\n' +
            'หรือพิมพ์: help / id / register / ลา',
    }]);
    return;
  }
  if (text === 'register' || text === 'ลงทะเบียน' || text === 'สมัคร') {
    _reply(event.replyToken, [{
      type: 'text',
      text: 'ลงทะเบียนพนักงานใหม่:\n' + liffBase + '/reg',
    }]);
    return;
  }
  if (text === 'leave' || text === 'ลา' || text === 'ลางาน' || text === 'ขอลา') {
    _reply(event.replyToken, [{
      type: 'text',
      text: 'ขอลางาน:\n' + liffBase + '/leave',
    }]);
    return;
  }

  // default
  _reply(event.replyToken, [{
    type: 'text',
    text: 'พิมพ์ "help" เพื่อดูคำสั่ง\nหรือกดที่ rich menu ด้านล่าง',
  }]);
}

function _onPostback(event) {
  // reserved สำหรับอนาคต (ถ้าใช้ postback action ใน flex)
  logInfo('webhook.postback', (event.postback && event.postback.data) || '');
}

function _reply(replyToken, messages) {
  if (!replyToken) return;
  const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) { logWarn('webhook.reply', 'no token'); return; }
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ replyToken: replyToken, messages: messages }),
      muteHttpExceptions: true,
    });
  } catch (e) { logError('webhook.reply', e.message); }
}
