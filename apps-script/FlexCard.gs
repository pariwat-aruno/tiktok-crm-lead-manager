/**
 * FlexCard.gs — flex bubble builders ทุก card
 *
 * ดู docs/flex-cards.md
 */

function _baseUrl_() {
  try {
    return ScriptApp.getService().getUrl().replace(/\/a\/[^\/]+\/macros\//, '/macros/');
  } catch (e) { return ''; }
}

/**
 * ลิงก์ใน flex card → ใช้ liff.line.me/<LIFF_ID>/<page> เพื่อเปิดใน LIFF context
 * (ถ้าเปิด Worker/Apps Script URL ตรงๆ จะไม่มี LIFF context → liff.init ค้าง)
 */
function _pageUrl_(page, params) {
  const liffId = PropertiesService.getScriptProperties().getProperty('LIFF_ID');
  if (liffId) {
    let url = 'https://liff.line.me/' + liffId + '/' + page;
    if (params) {
      const q = Object.keys(params).map(function (k) {
        return k + '=' + encodeURIComponent(params[k]);
      }).join('&');
      if (q) url += '?' + q;
    }
    return url;
  }
  // fallback ถ้ายังไม่มี LIFF_ID
  let q = '?page=' + page;
  if (params) Object.keys(params).forEach(function (k) {
    q += '&' + k + '=' + encodeURIComponent(params[k]);
  });
  return _baseUrl_() + q;
}

function _brandColor_() {
  return getConfig().brand_color || '#c8102e';
}

function _brandName_() {
  return getConfig().brand_name || 'TikTok CRM';
}

function _header_(title, subtitle) {
  const contents = [
    { type: 'text', text: _brandName_(), size: 'xs', color: '#ffffff', weight: 'bold' },
    { type: 'text', text: title, size: 'lg', color: '#ffffff', weight: 'bold', wrap: true },
  ];
  if (subtitle) contents.push({ type: 'text', text: subtitle, size: 'xs', color: '#ffffff', wrap: true });
  return { type: 'box', layout: 'vertical', backgroundColor: _brandColor_(), paddingAll: '12px', contents: contents };
}

function _kv_(key, value) {
  return {
    type: 'box', layout: 'baseline', spacing: 'sm',
    contents: [
      { type: 'text', text: String(key), size: 'sm', color: '#6b7280', flex: 2 },
      { type: 'text', text: String(value), size: 'sm', color: '#1a1a1a', flex: 4, wrap: true },
    ],
  };
}

function _btn_(label, uri, style) {
  return {
    type: 'button',
    style: style || 'primary',
    color: style === 'primary' ? _brandColor_() : undefined,
    height: 'sm',
    action: { type: 'uri', label: label, uri: uri },
  };
}

function _wrap_(altText, body, footer) {
  return {
    type: 'flex',
    altText: String(altText).slice(0, 400),
    contents: {
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', paddingAll: '0px', contents: body },
      footer: footer ? { type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'sm', contents: footer } : undefined,
    },
  };
}

/* ========== Cards ========== */

function cardNewUserPending(pending) {
  const url = _pageUrl_('owner', { tab: 'pending', id: pending.pending_id });
  return _wrap_(
    'พนักงานใหม่ลงทะเบียน: ' + pending.full_name,
    [
      _header_('พนักงานใหม่ลงทะเบียน'),
      { type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'md', contents: [
        _kv_('ชื่อ', pending.full_name),
        _kv_('ชื่อเล่น', pending.nick_name),
        _kv_('เบอร์', pending.phone),
        _kv_('เวลา', fmtThaiDateTime(pending.requested_at)),
      ]},
    ],
    [_btn_('ดูรายละเอียด', url, 'primary')]
  );
}

function cardUserApproved(employee, skus) {
  const url = _pageUrl_('app');
  const skuLine = (skus && skus.length) ? skus.join(', ') : '-';
  return _wrap_(
    'ยินดีต้อนรับ! ลงทะเบียนสำเร็จ',
    [
      _header_('ยินดีต้อนรับ ✓'),
      { type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'md', contents: [
        { type: 'text', text: 'คุณ ' + employee.display_name, weight: 'bold', size: 'md' },
        { type: 'text', text: 'ลงทะเบียนเรียบร้อยแล้ว', size: 'sm', color: '#6b7280' },
        _kv_('Role', employee.role),
        _kv_('ทีม', employee.team || '-'),
        _kv_('SKU ดูแล', skuLine),
      ]},
    ],
    [_btn_('เปิดระบบ', url, 'primary')]
  );
}

function cardUserRejected(pending, reason) {
  return _wrap_(
    'คำขอลงทะเบียนไม่ผ่าน',
    [
      _header_('คำขอไม่ผ่าน'),
      { type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'md', contents: [
        { type: 'text', text: 'ขออภัย — คำขอลงทะเบียนไม่ผ่าน', size: 'sm', wrap: true },
        { type: 'text', text: 'เหตุผล: ' + (reason || '-'), size: 'sm', color: '#6b7280', wrap: true },
      ]},
    ]
  );
}

function cardMorningQueue(staffName, count) {
  const url = _pageUrl_('staff');
  return _wrap_(
    'คิวลูกค้าวันนี้ ' + count + ' ราย',
    [
      _header_('คิวลูกค้าวันนี้'),
      { type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'md', contents: [
        { type: 'text', text: 'สวัสดี คุณ' + staffName, size: 'md', weight: 'bold' },
        { type: 'text', text: 'วันนี้มี ' + count + ' รายในคิว', size: 'sm', color: '#6b7280' },
      ]},
    ],
    [_btn_('เปิดคิว', url, 'primary')]
  );
}

function cardSlaWarning(staffName, count) {
  const url = _pageUrl_('staff');
  return _wrap_(
    'งานค้างเกิน SLA ' + count + ' ราย',
    [
      _header_('⚠️ งานค้าง'),
      { type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'md', contents: [
        { type: 'text', text: 'มี ' + count + ' รายค้างเกินกำหนด', size: 'md', wrap: true },
        { type: 'text', text: 'รีบโทรก่อนระบบ re-assign', size: 'sm', color: '#6b7280', wrap: true },
      ]},
    ],
    [_btn_('เปิดคิว', url, 'primary')]
  );
}

function cardBlacklistRequest(lead, customer, requester) {
  const url = _pageUrl_('lead', { tab: 'blacklist', id: lead.lead_id });
  return _wrap_(
    'คำขอ Blacklist: ' + (customer.name || ''),
    [
      _header_('⚠️ คำขอ Blacklist'),
      { type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'md', contents: [
        _kv_('ลูกค้า', customer.name || '-'),
        _kv_('เบอร์', customer.phone || '-'),
        _kv_('ส่งโดย', requester.display_name || '-'),
        { type: 'box', layout: 'vertical', backgroundColor: '#fef9e7', paddingAll: '8px', cornerRadius: '6px',
          contents: [{ type: 'text', text: '"' + (lead.note || '') + '"', size: 'sm', wrap: true }] },
      ]},
    ],
    [_btn_('ดูคำขอ', url, 'primary')]
  );
}

function cardLeaveRequest(leave, employee) {
  // approver กดดูใน page ที่เหมาะกับ role ของเขา → fallback ไป page=app
  const url = _pageUrl_('app');
  const days = (diffDays(new Date(leave.end_date), new Date(leave.start_date)) + 1).toFixed(0);
  return _wrap_(
    'ขอลางาน: ' + (employee.display_name || '') + ' ' + days + ' วัน',
    [
      _header_('📋 ขอลางาน'),
      { type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'md', contents: [
        _kv_('พนักงาน', employee.display_name || '-'),
        _kv_('ลา', leave.start_date + ' ถึง ' + leave.end_date),
        _kv_('ประเภท', leave.leave_type || '-'),
        _kv_('เหตุผล', leave.reason || '-'),
      ]},
    ],
    [_btn_('ดูคำขอ', url, 'primary')]
  );
}

function cardLeaveApproved(leave) {
  return _wrap_(
    'อนุมัติลาแล้ว ' + leave.start_date + ' - ' + leave.end_date,
    [
      _header_('✓ อนุมัติลาแล้ว'),
      { type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'md', contents: [
        { type: 'text', text: leave.start_date + ' ถึง ' + leave.end_date, size: 'md', weight: 'bold' },
        { type: 'text', text: 'ระบบจะไม่ assign งานช่วงนี้', size: 'sm', color: '#6b7280', wrap: true },
      ]},
    ]
  );
}

function cardLeaveRejected(leave, reason) {
  return _wrap_(
    'ไม่อนุมัติลา',
    [
      _header_('✗ ไม่อนุมัติลา'),
      { type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'md', contents: [
        { type: 'text', text: leave.start_date + ' ถึง ' + leave.end_date, size: 'sm' },
        { type: 'text', text: 'เหตุผล: ' + (reason || '-'), size: 'sm', color: '#6b7280', wrap: true },
      ]},
    ]
  );
}

function cardDailyReport(stats) {
  const url = _pageUrl_('owner');
  return _wrap_(
    'รายงานประจำวัน',
    [
      _header_('📊 รายงานประจำวัน', stats.date),
      { type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'md', contents: [
        _kv_('โทร', stats.todayCalls + ' ราย'),
        _kv_('ปิดได้', (stats.todayBought || 0) + ' ราย'),
        _kv_('ยอดขาย', '฿' + (stats.revenue || 0).toLocaleString()),
        { type: 'separator' },
        _kv_('Pending', stats.pendingLeads),
        _kv_('Overdue', stats.overdueLeads),
        _kv_('BL pending', stats.blacklistReq),
      ]},
    ],
    [_btn_('เปิด Dashboard', url, 'primary')]
  );
}

function cardAnomalyAlert(anomalies) {
  const url = _pageUrl_('owner', { tab: 'audit' });
  const lines = anomalies.slice(0, 5).map(function (a) {
    return '• ' + a.displayName + ': copy ' + a.copy + ', call ' + (a.call || 0);
  });
  return _wrap_(
    'พบความผิดปกติ ' + anomalies.length + ' คน',
    [
      _header_('🚨 พบความผิดปกติ'),
      { type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'sm', contents: [
        { type: 'text', text: 'คัดลอกเบอร์เยอะแต่ไม่มี call:', size: 'sm', weight: 'bold' },
        { type: 'text', text: lines.join('\n'), size: 'sm', wrap: true, color: '#6b7280' },
      ]},
    ],
    [_btn_('ดู Audit', url, 'primary')]
  );
}

function cardBanned(employee, reason) {
  return _wrap_(
    'บัญชีถูกระงับ',
    [
      _header_('⚠️ บัญชีถูกระงับ'),
      { type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'md', contents: [
        { type: 'text', text: 'บัญชีของคุณถูกระงับการใช้งาน', size: 'md', weight: 'bold', wrap: true },
        { type: 'text', text: 'เหตุผล: ' + (reason || '-'), size: 'sm', color: '#6b7280', wrap: true },
        { type: 'text', text: 'ติดต่อ owner หากมีข้อสงสัย', size: 'sm', color: '#6b7280' },
      ]},
    ]
  );
}

function cardLeadAssigned(lead, customer) {
  const url = _pageUrl_('staff');
  return _wrap_(
    'ได้รับ lead ใหม่: ' + (customer.name || ''),
    [
      _header_('📞 ได้รับ lead ใหม่'),
      { type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'md', contents: [
        _kv_('ลูกค้า', customer.name || '-'),
        _kv_('เบอร์', customer.phone || '-'),
        _kv_('SKU', lead.primary_sku || '-'),
      ]},
    ],
    [_btn_('เปิด lead', url, 'primary')]
  );
}
