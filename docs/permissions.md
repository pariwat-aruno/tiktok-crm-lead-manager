# Permissions Matrix

> ทุก endpoint backend ตรวจสิทธิ์ก่อน return

## Role Hierarchy

```
owner > manager > lead > staff
```

- owner ทำได้ทุกอย่าง
- manager ทำได้ใน "สายงาน" ตัวเอง (เช็คผ่าน `Employees.report_to`)
- lead ทำได้ใน "ทีม" ตัวเอง (เช็คผ่าน `Employees.team`)
- staff ทำได้กับ "ของตัวเอง"

## Action Matrix

| Action | staff | lead | manager | owner |
|---|---|---|---|---|
| getMyRole | ✓ | ✓ | ✓ | ✓ |
| getMyQueue | ✓ (ของตน) | ✓ (ของตน) | ✓ | ✓ |
| getLeadDetail | ✓ (ของตน) | ✓ (ในทีม) | ✓ (ในสายงาน) | ✓ |
| recordCallResult | ✓ (ของตน) | ✓ (ในทีม) | ✓ | ✓ |
| logCopyPhone | ✓ (ของตน) | ✓ | ✓ | ✓ |
| requestLeave | ✓ (ของตน) | ✓ (ของตน) | ✓ (ของตน) | ✓ (ของตน) |
| cancelLeave | ✓ (ของตน) | ✓ (ของตน) | ✓ (ของตน) | ✓ (ของตน) |
| approveLeave | — | ✓ (ในทีม) | ✓ (ในสายงาน) | ✓ |
| getMyLeaves | ✓ (ของตน) | ✓ | ✓ | ✓ |
| getPendingLeaves | — | ✓ (ในทีม) | ✓ (ในสายงาน) | ✓ |
| getTeamDashboard | — | ✓ (ในทีม) | ✓ (ในสายงาน) | ✓ |
| getBlacklistRequests | — | ✓ (ในทีม) | ✓ (ในสายงาน) | ✓ |
| approveBlacklist | — | ✓ | ✓ | ✓ |
| getAuditCopy | — | ✓ (ในทีม) | ✓ | ✓ |
| getManagerDashboard | — | — | ✓ (ในสายงาน) | ✓ |
| getMyTeamMembers | — | ✓ (ในทีม) | ✓ (ในสายงาน) | ✓ |
| getPendingUsers | — | — | ✓ (ในสายงาน) | ✓ |
| approvePendingUser | — | — | ✓ (ในสายงาน) | ✓ |
| createProduct | — | — | — | ✓ |
| assignProduct | — | — | ✓ (ในสายงาน) | ✓ |
| unassignProduct | — | — | ✓ (ในสายงาน) | ✓ |
| importCsv | — | — | — | ✓ |
| rollbackSession | — | — | — | ✓ |
| getRecentSessions | — | — | ✓ | ✓ |
| getAllEmployees | — | — | ✓ (ในสายงาน) | ✓ |
| banEmployee | — | — | ✓ (ในสายงาน, ห้าม ban manager+) | ✓ |
| unbanEmployee | — | — | ✓ (ในสายงาน) | ✓ |
| searchCustomers | — | ✓ | ✓ | ✓ |
| mergeCustomers | — | — | — | ✓ |
| getOwnerDashboard | — | — | — | ✓ |
| getFullAuditLog | — | — | ✓ (ในสายงาน) | ✓ |

## Implementation Pattern

```js
function actionExample(args) {
  const uid = args.lineUserId;

  // 1. ตรวจ role
  if (!isManager(uid) && !isOwner(uid)) {
    return { ok: false, error: 'forbidden' };
  }

  // 2. ตรวจ scope (manager → สายงานตัวเอง)
  if (isManager(uid) && !isOwner(uid)) {
    const me = findEmployee(uid);
    const target = findEmployee(args.targetId);
    if (!isInMyChain(me, target)) {
      return { ok: false, error: 'out_of_scope' };
    }
  }

  // 3. ทำงาน
  // ...

  // 4. audit
  audit({
    actor: uid,
    action: 'something.done',
    targetType: 'employee',
    targetId: args.targetId,
    before: { ... },
    after: { ... },
  });

  return { ok: true, ... };
}
```

## "ในทีม" / "ในสายงาน"

```js
// "ในทีม" — lead เช็ค staff ในทีมเดียวกัน
function isInMyTeam(leadEmp, targetEmp) {
  return leadEmp.team === targetEmp.team;
}

// "ในสายงาน" — recursive ตาม report_to chain
function isInMyChain(mgrEmp, targetEmp) {
  let cur = targetEmp;
  let depth = 0;
  while (cur && depth < 10) {
    if (String(cur.report_to) === String(mgrEmp.employee_id)) return true;
    if (!cur.report_to) return false;
    cur = findOne('Employees', 'employee_id', cur.report_to);
    depth++;
  }
  return false;
}
```
