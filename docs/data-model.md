# Data Model — Full Schema

> ใช้ใน `Setup.gs.SHEET_HEADERS`

## 15 Sheets

```js
const SHEET_HEADERS = {
  Owners: [
    'line_user_id', 'display_name', 'added_at', 'note',
  ],

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
```

## Default Config (seed ตอน setupAll)

```js
const DEFAULT_CONFIG = [
  ['brand_name', 'TikTok CRM', 'ชื่อแบรนด์ในหน้า UI'],
  ['brand_color', '#c8102e', 'สีหลัก'],
  ['liff_id', '', 'LIFF ID — ตั้งหลัง deploy'],
  ['sla_hours', '48', 'ภายในกี่ชม. ต้องโทร'],
  ['reassign_hours', '72', 'เกินกี่ชม. ระบบ reassign'],
  ['rebuy_default_days', '30', 'รอบโทรซ้ำ default'],
  ['dormant_days', '90', 'ไม่ซื้อกี่วัน = DORMANT'],
  ['churn_days', '180', 'ไม่ซื้อกี่วัน = CHURNED'],
  ['rr_pointer', '0', 'round-robin pointer'],
  ['copy_anomaly_threshold', '20', 'copy/วัน ก่อนแจ้ง'],
  ['rollback_window_hours', '24', 'rollback session ได้ใน ชม.'],
  ['leave_min_advance_days', '0', 'ลาล่วงหน้าขั้นต่ำ (วัน)'],
  ['leave_max_days', '14', 'ลาได้สูงสุด/ครั้ง'],
  ['drive_folder_id', '', 'Drive folder สำหรับเก็บรูป'],
];
```

## Script Properties

| key | note |
|---|---|
| `SHEET_ID` | auto-set by setupAll |
| `LIFF_ID` | set ผ่าน `setLiffId()` |
| `LINE_CHANNEL_ACCESS_TOKEN` | set ผ่าน `setLineAccessToken()` |
| `DRIVE_FOLDER_ID` | auto-create ตอน upload ครั้งแรก |

## Indexes (in-memory)

Apps Script ไม่มี index จริง — ใช้ filter linear ทุกครั้ง สำหรับ project ขนาด ≤25 user / ≤50k row = OK
ถ้า scale ใหญ่ขึ้น → ย้าย CallLogs/AuditLog ไป BigQuery (Phase 13+)

## Constraints

- `Employees.line_user_id` unique (เช็คตอน approve)
- `Products.sku` unique (เช็คตอน createProduct)
- `Orders.order_id` unique (skip ถ้ามีอยู่)
- `ProductAssignments(employee_id, sku, is_active=TRUE)` unique
- `Leaves` overlap ห้ามมี 2 row pending/approved ทับช่วงกัน
