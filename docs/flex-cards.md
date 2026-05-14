# Flex Card Specs

> ทุกการสื่อสารเป็น Flex Bubble — ห้าม push text เปลือย ๆ

## Brand
- Header bg: `<brand_color>` (default `#c8102e`)
- Header text: `#fff`
- Body text: `#1a1a1a`
- Muted: `#6b7280`
- Success: `#16a34a`
- Danger: `#dc2626`
- Warn: `#d97706`

## Common Components

### `_header(title, subtitle?)`
```js
{
  type: 'box', layout: 'vertical',
  backgroundColor: brandColor, paddingAll: '12px',
  contents: [
    { type: 'text', text: brandName, size: 'xs', color: '#fff', weight: 'bold' },
    { type: 'text', text: title, size: 'lg', color: '#fff', weight: 'bold', wrap: true },
    subtitle ? { type: 'text', text: subtitle, size: 'xs', color: '#fff', wrap: true } : null,
  ].filter(Boolean),
}
```

### `_button(label, uri, style?)`
```js
{
  type: 'button', style: style || 'primary', color: brandColor, height: 'sm',
  action: { type: 'uri', label: label, uri: uri },
}
```

### `_kv(key, value)`
```js
{ type: 'box', layout: 'baseline', spacing: 'sm', contents: [
  { type: 'text', text: key, size: 'sm', color: '#6b7280', flex: 2 },
  { type: 'text', text: String(value), size: 'sm', color: '#1a1a1a', flex: 3, wrap: true },
]}
```

---

## Cards

### 1. `cardNewUserPending(pending)` → push to owner+manager

```
┌─────────────────────────┐
│ BRAND_NAME              │
│ พนักงานใหม่ลงทะเบียน    │
├─────────────────────────┤
│ ชื่อ:  {full_name}        │
│ เล่น:  {nick_name}        │
│ เบอร์: {phone}            │
│ เวลา: {requested_at}      │
├─────────────────────────┤
│ [  ดูรายละเอียด  ]       │ → ?page=owner&tab=pending&id={pendingId}
└─────────────────────────┘
```

### 2. `cardUserApproved(employee)` → push to user

```
┌─────────────────────────┐
│ ยินดีต้อนรับ! ✓          │
├─────────────────────────┤
│ คุณ {nick_name}           │
│ ลงทะเบียนสำเร็จแล้ว        │
│ Role: {role}              │
│ ทีม:  {team}              │
│ SKU ดูแล: {sku list}      │
├─────────────────────────┤
│ [   เปิดระบบ   ]          │ → ?page=app
└─────────────────────────┘
```

### 3. `cardUserRejected(pending, reason)` → push to user

```
ขออภัย — คำขอลงทะเบียนไม่ผ่าน
เหตุผล: {reason}
ติดต่อ admin หากต้องการสอบถาม
```

### 4. `cardMorningQueue(staff, count)` → push to staff 09:00

```
┌─────────────────────────┐
│ คิวลูกค้าวันนี้          │
├─────────────────────────┤
│ สวัสดี คุณ {nickname}     │
│ วันนี้มี {count} ราย      │
├─────────────────────────┤
│ [   เปิดคิว   ]           │ → ?page=staff
└─────────────────────────┘
```

### 5. `cardSlaWarning(staff, count)` → push to staff

```
⚠️ งานค้าง
มี {count} รายค้างเกิน {sla_hours} ชม.
รีบโทรก่อนระบบ re-assign
[เปิดคิว] → ?page=staff
```

### 6. `cardBlacklistRequest(lead, customer, requester)` → push to lead

```
⚠️ คำขอ Blacklist
ลูกค้า: {name}
เบอร์: {phone}
ส่งโดย: {requester.display_name}
เหตุผล: "{note}"
[ดูคำขอ] → ?page=lead&tab=blacklist&id={leadId}
```

### 7. `cardLeaveRequest(leave, employee)` → push to approver

```
📋 ขอลางาน
{employee.display_name}
ลา: {start_date} ถึง {end_date}
ประเภท: {leave_type}
เหตุผล: "{reason}"
[ดูคำขอ] → ?page=lead&tab=leaves (หรือ manager/owner)
```

### 8. `cardLeaveApproved(leave)` / `cardLeaveRejected(leave, reason)` → push to user

```
✓ อนุมัติลาแล้ว
{start_date} ถึง {end_date}
ระบบจะไม่ assign งานช่วงนี้

หรือ:

✗ ไม่อนุมัติลา
เหตุผล: {reason}
```

### 9. `cardDailyReport(stats)` → push to manager + owner 18:00

```
📊 รายงานประจำวัน
{date}

โทร:       {todayCalls} ราย
ปิดได้:    {todayBought} ราย
ยอดขาย:   ฿{revenue}

Pending:   {pendingLeads}
Overdue:   {overdueLeads}
BL pending: {blacklistReq}

[เปิด dashboard] → ?page=owner หรือ ?page=manager
```

### 10. `cardAnomalyAlert(anomalies)` → push to owner

```
🚨 พบความผิดปกติ
{count} คนคัดลอกเบอร์เยอะแต่ไม่มี call_log:

• {name}: copy {n}, call {m}
• {name}: copy {n}, call {m}

[ดู audit] → ?page=owner&tab=audit&filter=copy
```

### 11. `cardBanned(employee, reason)` → push to user

```
⚠️ บัญชีถูกระงับ
{reason}
ติดต่อ owner หากมีข้อสงสัย
```

### 12. `cardLeadAssigned(lead, customer)` → push to staff ตอนได้ lead ใหม่ (option)

```
📞 ได้รับ lead ใหม่
ลูกค้า: {name}
เบอร์: {phone}
SKU: {sku}
SLA ภายใน {sla_hours} ชม.

[เปิด lead] → ?page=staff&lead={leadId}
```

---

## Test Card

ทุก card ต้องมี:
- `altText` < 400 chars
- `contents.type` = 'bubble' (ไม่ใช้ carousel ในเฟสแรก)
- ปุ่มลิงก์ใช้ `?page=...` ของ WebApp URL จริง (อ่านจาก `ScriptApp.getService().getUrl()`)

```js
// FlexCard.gs
function _baseUrl() {
  return ScriptApp.getService().getUrl();
}
function _pageUrl(page, params) {
  let q = '?page=' + page;
  if (params) Object.keys(params).forEach(function (k) {
    q += '&' + k + '=' + encodeURIComponent(params[k]);
  });
  return _baseUrl() + q;
}
```
