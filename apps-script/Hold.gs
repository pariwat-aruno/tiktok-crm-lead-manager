/**
 * Hold.gs — LeadHolds CRUD helpers สำหรับ Tier 2 allocation
 *
 * Hold lifecycle:
 *   create(reason='clock_in_pending') ← 06:00 cron pick Tier 2
 *   release(reason='clock_in_ok')     ← clock-in สำเร็จ → confirm assignment
 *   release(reason='no_show')         ← 09:30 deadline ไม่ clock-in
 *   release(reason='eod')             ← 18:00 EOD ไม่โทร
 *   release(reason='redistribute_in') ← ส่งต่อให้คนอื่น
 *   release(reason='cancel')          ← Lead กดยกเลิก
 *   create(reason='restored')         ← Lead "คืนสิทธิ์"
 *   create(reason='redistributed')    ← ระบบ re-distribute
 */

function createHold_(leadId, empId, reason, heldUntilIso) {
  const holdId = nextDated('HOLD', 'LeadHolds', 'hold_id');
  appendRow('LeadHolds', {
    hold_id: holdId,
    lead_id: leadId,
    held_by_employee_id: empId,
    held_at: nowBkk(),
    held_until: heldUntilIso || '',
    reason: reason || 'temp',
    released_at: '',
    released_reason: '',
  });
  return holdId;
}

function releaseHold_(holdRow, releasedReason) {
  updateRow('LeadHolds', holdRow._row, {
    released_at: nowBkk(),
    released_reason: releasedReason || '',
  });
}

function getActiveHoldsBy_(empId) {
  return rows('LeadHolds').filter(function (h) {
    return String(h.held_by_employee_id) === String(empId) && !h.released_at;
  });
}

function getActiveHoldForLead_(leadId) {
  return rows('LeadHolds').find(function (h) {
    return String(h.lead_id) === String(leadId) && !h.released_at;
  });
}

function releaseAllHoldsBy_(empId, releasedReason) {
  const holds = getActiveHoldsBy_(empId);
  holds.forEach(function (h) { releaseHold_(h, releasedReason); });
  return holds.length;
}
