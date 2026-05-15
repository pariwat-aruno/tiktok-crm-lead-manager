/**
 * Reminder.gs — 4 cron jobs
 */

function setupTriggers() {
  const handled = ['morningPush', 'tickSLA', 'dormantCycle', 'dailyReport',
                   'prepareMorningQueue', 'checkClockInDeadline', 'endOfDayCleanup'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handled.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });

  // Tier 1+2 allocation
  ScriptApp.newTrigger('prepareMorningQueue').timeBased().atHour(6).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('checkClockInDeadline').timeBased().atHour(9).nearMinute(30).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('endOfDayCleanup').timeBased().atHour(18).everyDays(1).inTimezone(TZ).create();

  // เดิม
  ScriptApp.newTrigger('morningPush').timeBased().atHour(9).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('tickSLA').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('dormantCycle').timeBased().atHour(2).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('dailyReport').timeBased().atHour(18).everyDays(1).inTimezone(TZ).create();

  Logger.log('✓ ติดตั้ง 7 cron triggers (3 tier1+2 + 4 เดิม)');
}

function morningPush() {
  try {
    const staff = rows('Employees').filter(function (e) {
      return String(e.role) === 'staff' && isActive(e) && e.line_user_id &&
             !isOnLeaveToday(e.employee_id);
    });
    const leads = rows('Leads');
    staff.forEach(function (e) {
      const myLeads = leads.filter(function (l) {
        return String(l.assigned_to) === String(e.employee_id) &&
               ['pending', 'no_answer', 'postponed'].indexOf(String(l.status)) >= 0;
      });
      if (myLeads.length === 0) return;
      try { pushFlex(e.line_user_id, cardMorningQueue(e.display_name || 'พนักงาน', myLeads.length)); }
      catch (err) {}
    });
    logInfo('morningPush', 'staff_count=' + staff.length);
  } catch (e) { logError('morningPush', e.message); }
}

function tickSLA() {
  try {
    const cfg = getConfig();
    const slaH = Number(cfg.sla_hours) || 48;
    const rsH = Number(cfg.reassign_hours) || 72;
    const now = new Date();
    const allLeads = rows('Leads');

    let woken = 0, reassigned = 0;
    const warnByEmp = {};

    // 1) wake postponed/no_answer ที่ next_action_at ถึง
    allLeads.forEach(function (l) {
      if (['no_answer', 'postponed'].indexOf(String(l.status)) < 0) return;
      if (!l.next_action_at) return;
      if (new Date(l.next_action_at).getTime() <= now.getTime()) {
        updateRow('Leads', l._row, { status: 'pending', next_action_at: '' });
        woken++;
      }
    });

    // 2) reassign คนที่ลาเริ่มวันนี้
    rows('Leaves').forEach(function (lv) {
      if (String(lv.status) !== 'approved') return;
      const start = String(lv.start_date).slice(0, 10);
      if (start === todayBkk()) {
        try { _reassignLeadsOf(lv.employee_id); } catch (e) {}
      }
    });

    // 3) SLA warn + reassign over rsH
    rows('Leads').forEach(function (l) {
      if (String(l.status) !== 'pending') return;
      const age = diffHours(now, new Date(l.assigned_at));
      if (age >= rsH) {
        try {
          const customer = findOne('Customers', 'customer_id', l.customer_id);
          if (!customer) return;
          const owner = resolveOwner({
            customer: customer,
            primarySku: l.primary_sku || '',
            excludeEmployeeIds: [l.assigned_to],
          });
          updateRow('Leads', l._row, {
            assigned_to: owner.employeeId,
            assigned_at: nowBkk(),
            assignment_reason: 'reassign_sla',
          });
          audit({
            actor: 'SYSTEM', actorRole: 'system',
            action: 'lead.reassigned',
            targetType: 'lead', targetId: l.lead_id,
            before: { assigned_to: l.assigned_to },
            after: { assigned_to: owner.employeeId, reason: 'sla' },
          });
          reassigned++;
        } catch (e) { logError('tickSLA.reassign', e.message); }
      } else if (age >= slaH) {
        warnByEmp[l.assigned_to] = (warnByEmp[l.assigned_to] || 0) + 1;
      }
    });

    // push warn
    const empMap = {};
    rows('Employees').forEach(function (e) { empMap[e.employee_id] = e; });
    Object.keys(warnByEmp).forEach(function (id) {
      const e = empMap[id];
      if (e && e.line_user_id && !isOnLeaveToday(id)) {
        try { pushFlex(e.line_user_id, cardSlaWarning(e.display_name, warnByEmp[id])); }
        catch (err) {}
      }
    });

    if (woken + reassigned + Object.keys(warnByEmp).length > 0) {
      logInfo('tickSLA', 'woken=' + woken + ' warned=' + Object.keys(warnByEmp).length + ' reassigned=' + reassigned);
    }
  } catch (e) { logError('tickSLA', e.message); }
}

function dormantCycle() {
  try {
    const cfg = getConfig();
    const dDays = Number(cfg.dormant_days) || 90;
    const cDays = Number(cfg.churn_days) || 180;
    const now = new Date();

    let toDormant = 0, toChurned = 0;
    rows('Customers').forEach(function (c) {
      if (isTruthy(c.blacklist) || !c.last_order_at) return;
      const age = diffDays(now, new Date(c.last_order_at));
      if (age >= cDays && String(c.stage) !== 'CHURNED') {
        updateRow('Customers', c._row, { stage: 'CHURNED', updated_at: nowBkk() });
        toChurned++;
      } else if (age >= dDays && age < cDays && String(c.stage) !== 'DORMANT') {
        updateRow('Customers', c._row, { stage: 'DORMANT', updated_at: nowBkk() });
        toDormant++;
      }
    });
    logInfo('dormantCycle', 'dormant=' + toDormant + ' churned=' + toChurned);
  } catch (e) { logError('dormantCycle', e.message); }
}

function dailyReport() {
  try {
    const today = todayBkk();
    const customers = rows('Customers');
    const leads = rows('Leads');
    const calls = rows('CallLogs');

    const stages = { NEW: 0, ACTIVE: 0, DORMANT: 0, CHURNED: 0 };
    customers.forEach(function (c) { if (stages[c.stage] !== undefined) stages[c.stage]++; });

    const pending = leads.filter(function (l) {
      return ['pending', 'no_answer', 'postponed'].indexOf(String(l.status)) >= 0;
    });
    const overdue = pending.filter(function (l) {
      return l.due_date && new Date(l.due_date).getTime() < Date.now();
    });
    const todayCalls = calls.filter(function (cl) {
      return String(cl.created_at || '').indexOf(today) === 0 && cl.action === 'call_result';
    });
    const todayBought = todayCalls.filter(function (cl) { return cl.result === 'bought'; });

    // คำนวณ revenue ของวันนี้: รวม amount ของ Orders ที่ ordered_at ตรงกับวันนี้
    let revenue = 0;
    rows('Orders').forEach(function (o) {
      if (String(o.ordered_at || '').indexOf(today) === 0) {
        revenue += Number(o.amount || 0);
      }
    });

    const stats = {
      date: today,
      todayCalls: todayCalls.length,
      todayBought: todayBought.length,
      pendingLeads: pending.length,
      overdueLeads: overdue.length,
      blacklistReq: leads.filter(function (l) { return String(l.status) === 'blacklist_req'; }).length,
      revenue: revenue,
      stages: stages,
    };

    const card = cardDailyReport(stats);
    pushToManagersAndOwners(card);

    // anomaly
    const threshold = Number(getConfig().copy_anomaly_threshold) || 20;
    const byEmp = {};
    calls.filter(function (cl) {
      return String(cl.created_at || '').indexOf(today) === 0;
    }).forEach(function (cl) {
      const id = String(cl.employee_id);
      if (!byEmp[id]) byEmp[id] = { copy: 0, call: 0 };
      if (cl.action === 'copy_phone') byEmp[id].copy++;
      else if (cl.action === 'call_result') byEmp[id].call++;
    });
    const empMap = {};
    rows('Employees').forEach(function (e) { empMap[e.employee_id] = e; });
    const anomalies = [];
    Object.keys(byEmp).forEach(function (id) {
      const s = byEmp[id];
      if (s.copy >= threshold && s.call === 0) {
        anomalies.push({
          employeeId: id,
          displayName: (empMap[id] || {}).display_name || id,
          copy: s.copy, call: s.call,
        });
      }
    });
    if (anomalies.length > 0) pushToAllOwners(cardAnomalyAlert(anomalies));

    logInfo('dailyReport', 'done', { anomalies: anomalies.length });
  } catch (e) { logError('dailyReport', e.message); }
}
