# CONTEXT.md — TikTok CRM Lead Manager

> **อ่านก่อนทำงานทุกครั้ง — คำศัพท์ใน project นี้**

## 1. Project Identity

- **ชื่อ:** TikTok CRM Lead Manager
- **Type:** Single Apps Script Web App (no GitHub Pages)
- **Stack:** Apps Script + Google Sheet + LINE LIFF + Drive (สำหรับเก็บรูป)
- **ทีม:** 15-25 คน
- **ภาษา UI:** ไทย

## 2. Glossary

| คำใช้ | คำเทคนิค (ห้ามใช้) | ความหมาย |
|---|---|---|
| ลูกค้า | customer | คนที่ซื้อจาก TikTok |
| ออเดอร์ | order | รายการซื้อ 1 ครั้ง |
| คิว / lead | task / queue | งานพนักงานต้องโทร |
| สินค้า / SKU | product | สินค้าที่ขาย (1 SKU = 1 product code) |
| พนักงาน / staff | agent | คนโทร CRM |
| หัวหน้าทีม / lead | supervisor | คุม 1 ทีม |
| ผู้จัดการ / manager | mgr | คุมหลายทีม |
| เจ้าของระบบ / owner | admin | สิทธิ์สูงสุด |
| Owner ลูกค้า | customer.owner | พนักงานที่ผูกกับลูกค้าคนนั้น |
| รอบโทรซ้ำ | rebuy cycle | จำนวนวันหลังลูกค้าซื้อ → lead ใหม่ |
| ผลโทร | call result | 1 ใน 6: ซื้อ / ไม่ซื้อ / ไม่รับสาย / เลื่อนนัด / ปฏิเสธ / blacklist |
| Session | import batch | 1 ครั้ง upload CSV (rollback ได้ 24 ชม.) |
| SLA | deadline | ภายในกี่ ชม. ต้องโทร (default 48) |
| ระยะลูกค้า | stage | NEW / ACTIVE / DORMANT / CHURNED |
| Blacklist | do not call | ลูกค้าห้ามโทร (ต้อง lead approve) |
| ลางาน | leave | พนักงานขอลา → ไม่รับงานวันนั้น |
| Pending User | applicant | ผู้สมัครรอ approve |
| Audit | trace | ประวัติทุก action |

## 3. Roles & Permissions

| Role | จำนวน | สิทธิ์ |
|---|---|---|
| **owner** | 1-2 | สร้าง SKU / approve user / ban / assign manager / ดูทุก audit |
| **manager** | 2-3 | approve user สายงานตน / assign lead+staff / ดู report ทีมของตน |
| **lead** | 2-3 | approve blacklist / audit copy / ดู dashboard 1 ทีม |
| **staff** | 15+ | โทร / กดผลโทร / ขอลา / ขอ blacklist |

**Lookup:** ผ่าน LINE User ID เท่านั้น (ไม่มี password)
Role เก็บใน `Employees.role`

## 4. Data Model — 15 Sheets

### Sheet: `Owners` (config)
| column | type | note |
|---|---|---|
| `line_user_id` | string | LINE User ID ของ owner |
| `display_name` | string | |
| `added_at` | datetime | |
| `note` | string | |

### Sheet: `Employees`
| column | type | note |
|---|---|---|
| `employee_id` | string | `EMP-0001` |
| `line_user_id` | string | unique |
| `display_name` | string | ชื่อเล่น |
| `full_name` | string | ชื่อ-สกุล |
| `phone` | string | |
| `email` | string | |
| `role` | enum | staff / lead / manager / owner |
| `team` | string | ทีม (e.g. "ทีม A") |
| `report_to` | string | employee_id ของหัวหน้า (chain) |
| `selfie_url` | string | Drive URL |
| `id_card_url` | string | Drive URL |
| `is_active` | bool | |
| `is_banned` | bool | |
| `ban_reason` | string | |
| `joined_at` | datetime | |
| `approved_by` | string | employee_id |
| `approved_at` | datetime | |
| `inactivated_at` | datetime | |
| `banned_at` | datetime | |

### Sheet: `PendingUsers`
| column | type | note |
|---|---|---|
| `pending_id` | string | `PEND-XXXX` |
| `line_user_id` | string | |
| `line_display_name` | string | จาก LIFF profile |
| `full_name` | string | กรอก |
| `nick_name` | string | |
| `phone` | string | |
| `email` | string | |
| `selfie_url` | string | Drive |
| `id_card_url` | string | Drive |
| `requested_at` | datetime | |
| `status` | enum | pending / approved / rejected |
| `reviewed_by` | string | employee_id |
| `reviewed_at` | datetime | |
| `rejection_reason` | string | |

### Sheet: `Products`
| column | type | note |
|---|---|---|
| `sku` | string | primary |
| `product_name` | string | |
| `script_text` | string | บทพูด (มี {name}, {product}, {last_order_date}) |
| `rebuy_days` | number | default 30 |
| `is_active` | bool | |
| `created_at` | datetime | |

### Sheet: `ProductAssignments`
| column | type | note |
|---|---|---|
| `assignment_id` | string | |
| `employee_id` | string | |
| `sku` | string | |
| `assigned_at` | datetime | |
| `assigned_by` | string | |
| `is_active` | bool | |

ตาราง many-to-many: 1 พนักงานดูแลหลาย SKU, 1 SKU มีหลายพนักงาน

### Sheet: `Customers`
| column | type | note |
|---|---|---|
| `customer_id` | string | `CUST-XXXX` |
| `name` | string | |
| `name_normalized` | string | สำหรับ match |
| `phone` | string | normalized |
| `address` | string | |
| `owner_employee_id` | string | nullable ถ้าลาออก |
| `stage` | enum | NEW / ACTIVE / DORMANT / CHURNED |
| `blacklist` | bool | |
| `blacklist_reason` | string | |
| `created_at` | datetime | |
| `last_order_at` | datetime | |
| `updated_at` | datetime | |

### Sheet: `Orders`
| column | type |
|---|---|
| `order_id` | string |
| `customer_id` | string |
| `session_id` | string |
| `sku` | string |
| `product_name` | string |
| `quantity` | number |
| `amount` | number |
| `ordered_at` | datetime |
| `imported_at` | datetime |
| `csv_raw` | json |

### Sheet: `Leads`
| column | type | note |
|---|---|---|
| `lead_id` | string | `LEAD-YYYYMMDD-XXXX` |
| `customer_id` | string | |
| `order_ids` | string | comma-separated |
| `primary_sku` | string | sku หลักของ lead → ใช้ assign |
| `assigned_to` | string | employee_id |
| `assigned_at` | datetime | |
| `assignment_reason` | enum | product_match / round_robin / reassign_inactive / reassign_sla / reassign_leave / reassign_banned / dormant_wake |
| `status` | enum | pending / no_answer / postponed / blacklist_req / closed |
| `due_date` | datetime | |
| `next_action_at` | datetime | |
| `closed_at` | datetime | |
| `result` | enum | bought / not_bought / no_answer / postponed / rejected / blacklist_req |
| `reject_reason` | enum | (สำหรับ not_bought) |
| `note` | string | |
| `session_id` | string | |

### Sheet: `CallLogs`
| column | type |
|---|---|
| `log_id` | string |
| `lead_id` | string |
| `customer_id` | string |
| `employee_id` | string |
| `action` | enum: view / copy_phone / call_result |
| `result` | enum |
| `reject_reason` | enum |
| `note` | string |
| `next_action_at` | datetime |
| `created_at` | datetime |

### Sheet: `Leaves`
| column | type | note |
|---|---|---|
| `leave_id` | string | `LEAVE-XXXX` |
| `employee_id` | string | |
| `start_date` | date | |
| `end_date` | date | |
| `leave_type` | enum | sick / personal / vacation / other |
| `reason` | string | |
| `status` | enum | pending / approved / rejected / cancelled |
| `requested_at` | datetime | |
| `reviewed_by` | string | |
| `reviewed_at` | datetime | |
| `rejection_reason` | string | |

### Sheet: `Sessions`
| column | type |
|---|---|
| `session_id` | string |
| `imported_by` | string |
| `csv_filename` | string |
| `total_rows` | number |
| `orders_created` | number |
| `leads_created` | number |
| `customers_created` | number |
| `status` | enum: active / rolled_back |
| `created_at` | datetime |
| `rolled_back_at` | datetime |

### Sheet: `Stats`
| column |
|---|
| date / employee_id / leads_assigned / leads_contacted / leads_bought / revenue / contact_rate / conversion_rate |

### Sheet: `AuditLog` (สำคัญสุด)
| column | type | note |
|---|---|---|
| `log_id` | string | |
| `timestamp` | datetime | |
| `actor_employee_id` | string | คนทำ |
| `actor_line_user_id` | string | |
| `actor_role` | string | |
| `action` | string | dot-notation (user.approve, lead.reassigned, ...) |
| `target_type` | string | user / lead / customer / product / session / leave |
| `target_id` | string | |
| `before_value` | string | JSON |
| `after_value` | string | JSON |
| `note` | string | |

### Sheet: `Config`
ดู `Setup.gs` — มี 20+ keys

### Sheet: `Logs`
system log (technical) แยกจาก AuditLog (business)

## 5. Assignment Logic (สำคัญ)

```
input: customer + primary_sku
1) หา candidates = active staff ที่ดูแล primary_sku ผ่าน ProductAssignments
2) filter:
   - is_active = TRUE
   - is_banned = FALSE
   - ไม่ลาในวันนี้ (เช็ค Leaves)
3) ถ้า customer.owner_employee_id อยู่ใน candidates → ใช้ owner เดิม
4) ถ้าไม่ → round-robin ใน candidates
5) ถ้า candidates ว่าง (ทุกคนลา/ลาออก) → fallback:
   - หา manager คนแรกที่ active+ไม่ลา
   - ถ้าไม่มี manager → assign ให้ owner คนแรก
   - assignment_reason = 'fallback_no_candidate'
```

## 6. Conventions

- TZ: Asia/Bangkok, ISO 8601 +07:00
- ทุก mutation → AuditLog
- Phone normalize: `[\D]` → "", `66...` → "0..."
- Name normalize: trim, lowercase, ลบ whitespace
- Lock ทุก function ที่ mutate counter (round-robin, IDs)

## 7. Brand

- ชื่อแบรนด์ + สี อยู่ใน `Config` sheet (เปลี่ยนได้ตลอด)
- Default: cherry red `#c8102e`
