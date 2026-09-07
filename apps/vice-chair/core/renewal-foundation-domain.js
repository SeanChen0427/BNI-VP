(function (root, factory) {
  const api = factory(root.FulianCalendarDomain || (typeof require === "function" ? require("./calendar-domain.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FulianRenewalFoundationDomain = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (calendar) {
  const labels = { tracking: "持續追蹤", reported: "回報達成・待確認", achieved: "已確認達成", unmet: "未達成・待人工處理", cancelled: "已停止追蹤" };
  const resolved = value => ["achieved", "cancelled"].includes(value.status);
  const manager = context => ["admin", "vp"].includes(context.role);
  const assigned = (value, context) => value.leadId === context.personId || (value.companionIds || []).includes(context.personId);
  const canReadDetail = (value, context) => manager(context) || assigned(value, context);
  function required(value, label, max = 2000) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(`請填寫${label}（最多 ${max} 字）`);
    return value.trim();
  }
  function day(value, label) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "") || calendar.dateInput(value) !== value) throw new Error(`${label}日期無效`);
    return value;
  }
  function optional(value, label, max) {
    if (value == null || value === "") return "";
    if (typeof value !== "string" || value.trim().length > max) throw new Error(`${label}最多 ${max} 字`);
    return value.trim();
  }
  function suggestedText(input) {
    if (input.kind === "flexible") {
      const metric = metricInfo(input), period = input.cadence === "recurring" ? `每 ${input.intervalMonths} 個月` : "期間內累計";
      const title = input.metric === "ceu" ? `${period}培訓積分 ${input.target || "指定"} 分` : `${period} ${input.target || "指定"} ${metric.unit}${metric.name}`;
      return { title, criterion: `${title}${input.cadence === "recurring" ? "，各期分開計算" : ""}${input.metric === "workshop" ? "，由副主席依參加證據確認" : ""}` };
    }
    const count = Number.isInteger(Number(input.target)) && Number(input.target) > 0 ? Number(input.target) : "指定人數";
    if (input.kind === "monthly_visitors") return { title: `每月 ${count} 位來賓`, criterion: `每月 ${count} 位來賓，各月分開計算` };
    if (input.kind === "quarterly_workshop") return { title: "每 3 個月 1 場工作坊", criterion: "從地基起算日起，每 3 個月參加 1 場工作坊，由副主席逐期確認" };
    if (input.kind === "visitors") return { title: `續約前累計 ${count} 位來賓`, criterion: `在地基適用期間內累計 ${count} 位來賓` };
    return { title: "其他地基", criterion: "" };
  }
  function definition(input) {
    const kind = input.kind || "manual";
    if (!["manual", "visitors", "monthly_visitors", "quarterly_workshop", "flexible"].includes(kind)) throw new Error("地基類型無效");
    const result = {
      title: optional(input.title, "改善項目", 160),
      criterion: kind === "manual" ? required(input.criterion, "完成標準", 2000) : optional(input.criterion, "完成標準", 2000),
      source: optional(input.source, "議定依據與確認紀錄", 3000),
      dueOn: day(input.dueOn, "條件期限"),
      nextCheckOn: kind === "manual" ? day(input.nextCheckOn, "下次追蹤") : day(input.startOn, "地基適用開始"),
      leadId: required(input.leadId, "主要追蹤人", 100),
      companionIds: [...new Set(Array.isArray(input.companionIds) ? input.companionIds : [])],
      kind,
    };
    if (kind !== "manual") {
      result.startOn = day(input.startOn, "地基適用開始");
      if (result.startOn >= result.dueOn || result.dueOn > calendar.shiftDateMonths(result.startOn, 36)) throw new Error("地基適用期間須為開始日至 3 年內的期限");
      result.target = kind === "quarterly_workshop" ? 1 : Number(input.target);
      if (kind === "flexible") {
        if (!["visitors", "ceu", "workshop"].includes(input.metric)) throw new Error("地基指標無效");
        if (!["cumulative", "recurring"].includes(input.cadence)) throw new Error("地基追蹤方式無效");
        Object.assign(result, { metric: input.metric, cadence: input.cadence, intervalMonths: input.cadence === "recurring" ? Number(input.intervalMonths) : 0, leadMonths: Number(input.leadMonths || 0) });
        if (result.cadence === "recurring" && (!Number.isInteger(result.intervalMonths) || result.intervalMonths < 1 || result.intervalMonths > 36)) throw new Error("每期月數須為 1 至 36 個月");
        if (![0, 1, 3, 6].includes(result.leadMonths) || (result.cadence === "recurring" && result.leadMonths)) throw new Error("追蹤啟動時間無效");
        if (!Number.isFinite(result.target) || result.target <= 0 || result.target > 10000 || (result.metric !== "ceu" && !Number.isInteger(result.target)) || Math.abs(result.target * 100 - Math.round(result.target * 100)) > 1e-8) throw new Error("目標須為正數；人數與場次須為整數，培訓積分最多兩位小數");
      } else if (!Number.isInteger(result.target) || result.target < 1 || result.target > 10000) throw new Error("來賓目標須為正整數");
      result.nextCheckOn = kind === "visitors" ? [result.startOn, calendar.shiftDateMonths(result.dueOn, -6)].sort().pop() : result.startOn;
      if (kind === "flexible") result.nextCheckOn = trackingStartsOn(result);
    }
    const suggested = suggestedText(result);
    result.titleGenerated = !result.title;
    result.criterionGenerated = !result.criterion;
    result.title ||= suggested.title;
    result.criterion ||= suggested.criterion;
    if (result.companionIds.length > 2 || result.companionIds.includes(result.leadId) || result.companionIds.some(id => typeof id !== "string" || !id)) throw new Error("陪同追蹤最多 2 位，且不可與主責重複");
    return result;
  }
  function cycles(value, now = new Date()) {
    if (value.kind === "flexible") {
      const today = calendar.dateInput(now), list = [];
      for (let index = 0; index < 36; index += 1) {
        const start = calendar.shiftDateMonths(value.startOn, index * (value.intervalMonths || 0));
        if (!start || start >= value.dueOn || start > today) break;
        const endExclusive = value.cadence === "recurring" ? [calendar.shiftDateMonths(value.startOn, (index + 1) * value.intervalMonths), value.dueOn].sort()[0] : value.dueOn;
        const end = calendar.shiftDayKey(endExclusive, -1);
        list.push({ key: start, start, end, label: `${value.cadence === "recurring" ? `第 ${index + 1} 期` : "累計期間"}（${start}～${end}）`, result: value.periodResults?.[start] || null, measurement: value.cadence === "recurring" ? value.periodMeasurements?.[start] || null : value.measurement || null });
        if (value.cadence !== "recurring") break;
      }
      return list;
    }
    if (!["quarterly_workshop", "monthly_visitors"].includes(value.kind)) return [];
    const today = calendar.dateInput(now), list = [], months = value.kind === "quarterly_workshop" ? 3 : 1;
    for (let index = 0; index < 36; index += 1) {
      const start = calendar.shiftDateMonths(value.startOn, index * months);
      if (!start || start >= value.dueOn || start > today) break;
      const nextStart = calendar.shiftDateMonths(value.startOn, (index + 1) * months);
      const end = calendar.shiftDayKey([nextStart, value.dueOn].sort()[0], -1);
      list.push({ key: start, start, end, label: `第 ${index + 1} ${months === 3 ? "季" : "月"}（${start}～${end}）`, result: value.periodResults?.[start] || null, measurement: value.periodMeasurements?.[start] || null });
    }
    return list;
  }
  function trackingStartsOn(value) {
    if (value.kind === "flexible") return value.cadence === "cumulative" && value.leadMonths ? [value.startOn, calendar.shiftDateMonths(value.dueOn, -value.leadMonths)].sort().pop() : value.startOn;
    return value.kind === "visitors" ? [value.startOn, calendar.shiftDateMonths(value.dueOn, -6)].sort().pop() : value.startOn || value.nextCheckOn;
  }
  function attention(value, now = new Date()) {
    const today = calendar.dateInput(now);
    if (resolved(value)) return { key: "resolved", label: labels[value.status], rank: 9 };
    if (value.kind !== "manual" && value.kind && trackingStartsOn(value) > today) return { key: "scheduled", label: `${trackingStartsOn(value)} 開始追蹤`, rank: 8 };
    if (value.handoverPending) return { key: "handover", label: "追蹤人已卸任・待改派", rank: 0 };
    if (value.kind === "flexible") {
      if (value.status === "unmet") return { key: "unmet", label: labels.unmet, rank: 0 };
      const periods = cycles(value, now), pending = periods.filter(cycle => !cycleReached(value, cycle));
      if (!pending.length && !isRecurring(value) && !isWorkshop(value)) return { key: "cumulative_reached", label: "累計數據達標・待確認", rank: 2 };
      if (!pending.length) return { key: "period_reached", label: isWorkshop(value) ? "各期已確認" : "各期數據已達標", rank: 4 };
      return { key: "period_pending", label: `${pending.length} 期・${isWorkshop(value) ? "待確認" : "待達標／補資料"}`, rank: pending.some(cycle => cycle.end < today) ? 0 : 1 };
    }
    if (value.kind === "monthly_visitors") {
      const pending = cycles(value, now).filter(cycle => cycle.measurement?.current == null || cycle.measurement.current < value.target);
      if (!pending.length) return { key: "month_reached", label: "各月來賓已達標・下月接續", rank: 4 };
      return { key: "month_pending", label: `${pending[0].label}來賓${pending[0].measurement?.current == null ? "待補資料" : "未達標"}${pending.length > 1 ? `・共 ${pending.length} 月待跟進` : ""}`, rank: pending[0].end < today ? 0 : 1 };
    }
    if (value.kind === "quarterly_workshop") {
      const pending = cycles(value, now).filter(cycle => cycle.result?.status !== "achieved");
      if (!pending.length) return { key: "quarter_confirmed", label: today > value.dueOn ? "各季已確認完成" : "本季已確認・下季接續", rank: 4 };
      return { key: "quarter_pending", label: `${pending[0].label}工作坊待確認${pending.length > 1 ? `・共 ${pending.length} 季` : ""}`, rank: pending[0].end < today ? 0 : 1 };
    }
    if (value.status === "unmet") return { key: "unmet", label: labels.unmet, rank: 0 };
    if (value.dueOn < today) return { key: "overdue", label: "期限已過・待檢視", rank: 0 };
    if (value.status === "reported") return { key: "reported", label: labels.reported, rank: 1 };
    if (value.kind === "visitors") return { key: "visitor_tracking", label: value.measurement?.current >= value.target ? "來賓數據達標・待確認" : "續約前半年・持續追蹤來賓", rank: 2 };
    if (value.nextCheckOn <= today) return { key: "check", label: "追蹤日已到", rank: 1 };
    if (value.dueOn <= calendar.shiftDayKey(today, 7)) return { key: "soon", label: "7 日內到期", rank: 2 };
    return { key: "tracking", label: labels.tracking, rank: 3 };
  }
  // Progress is recorded by people; this module never computes BNI scores or membership outcomes.
  function transition(current, input, context, now = new Date()) {
    const isManager = manager(context), isLead = current.leadId === context.personId;
    if (!canReadDetail(current, context)) throw Object.assign(new Error("只有副主席與受指派人員可更新追蹤"), { status: 403 });
    if (resolved(current) && input.action !== "reopen") throw new Error("已停止或達成的追蹤須先由副主席填寫原因重新開啟");
    const next = { ...current };
    const detail = { note: required(input.note, "本次紀錄／原因", 4000) };
    if (["amend", "resolve", "reopen", "confirm-quarter"].includes(input.action) && !isManager) throw Object.assign(new Error("此操作僅限副主席或 Admin"), { status: 403 });
    if (input.action === "amend") {
      const updated = definition(input);
      if (current.kind !== updated.kind || (current.startOn && current.startOn !== updated.startOn)) throw new Error("地基類型與起算日不可事後改寫；請停止原項目並新增正確條件");
      if (current.kind === "flexible" && ["metric", "cadence", "intervalMonths"].some(key => current[key] !== updated[key])) throw new Error("已建立地基的指標與週期不可改寫，請停止原項目並新增");
      Object.assign(next, updated);
    } else if (input.action === "confirm-quarter") {
      if (!isWorkshop(current)) throw new Error("此項目不是工作坊地基");
      const cycle = cycles(current, now).find(value => value.key === input.periodKey);
      if (!cycle) throw new Error("只能確認已開始的適用期間");
      if (!["achieved", "unmet"].includes(input.status)) throw new Error("本期確認結果無效");
      detail.periodKey = cycle.key;
      if (input.status === "achieved") {
        detail.attendedOn = day(input.attendedOn, "實際參加");
        if (detail.attendedOn < cycle.start || detail.attendedOn > cycle.end || detail.attendedOn > calendar.dateInput(now)) throw new Error("參加日期必須在該期適用期間內，且不可在未來");
      }
      const count = input.status === "achieved" ? Number(input.completedCount ?? 1) : 0;
      if (!Number.isInteger(count) || count < 0 || count > 10000 || (input.status === "achieved" && count < (current.target || 1))) throw new Error("確認完成場次須達到本期地基目標");
      detail.completedCount = count;
      next.periodResults = { ...(current.periodResults || {}), [cycle.key]: { status: input.status, count, attendedOn: detail.attendedOn || null, confirmedBy: context.name, confirmedAt: new Date(now).toISOString() } };
    } else if (["note", "reminder", "progress"].includes(input.action)) {
      if (input.action === "progress" && !isManager && !isLead) throw Object.assign(new Error("只有主責可回報整體進度"), { status: 403 });
      if (input.action === "reminder") {
        detail.contactedOn = day(input.contactedOn, "實際提醒");
        if (detail.contactedOn > calendar.dateInput(now)) throw new Error("實際提醒日期不可在未來");
        detail.channel = required(input.channel, "提醒方式", 80);
        detail.response = required(input.response, "會員回覆（尚未回覆請註明）", 2000);
        next.lastRemindedOn = [current.lastRemindedOn || "", detail.contactedOn].sort().pop();
        next.reminderCount = (current.reminderCount || 0) + 1;
      }
      if (input.action === "progress") {
        if (isRecurring(current) || isWorkshop(current)) throw new Error("週期地基須逐期追蹤，不能用整項進度替代");
        if (!["tracking", "reported"].includes(input.status)) throw new Error("回報狀態無效");
        if (current.status === "unmet") throw new Error("未達成項目須由副主席重新開啟後再回報");
        next.status = input.status;
      }
      if (input.nextCheckOn) {
        if (current.kind && current.kind !== "manual") throw new Error("此地基由續約起算日自動安排週期");
        if (!isManager && !isLead) throw Object.assign(new Error("只有主責可調整下次追蹤日"), { status: 403 });
        next.nextCheckOn = day(input.nextCheckOn, "下次追蹤");
      }
    } else if (input.action === "resolve") {
      if ((isRecurring(current) || isWorkshop(current)) && input.status !== "cancelled") throw new Error("週期地基須逐期追蹤，不能一次完成整年");
      if (!["achieved", "unmet", "cancelled"].includes(input.status)) throw new Error("確認結果無效");
      next.status = input.status;
    } else if (input.action === "reopen") {
      if (!resolved(current) && current.status !== "unmet") throw new Error("此項目仍在追蹤中");
      next.status = "tracking";
      next.nextCheckOn = current.kind && current.kind !== "manual" ? trackingStartsOn(current) : day(input.nextCheckOn, "下次追蹤");
    } else throw new Error("不支援的追蹤操作");
    return { next, detail };
  }
  function reminderText(value) {
    return `${value.memberName} 你好，關心一下這次續約約定的地基進度：\n\n改善項目：${value.title}\n完成標準：${value.criterion}\n約定期限：${displayDeadline(value)}\n\n請回覆目前進度，並提供可確認的完成資料；如有困難，也請提早告訴我們，方便委員協助與安排後續追蹤。謝謝。`;
  }
  function progressText(value, now = new Date()) {
    if (value.kind === "flexible") return cycles(value, now).map(cycle => `${cycle.label}：${cycleProgress(value, cycle)}`).join("；") || "適用期間尚未開始";
    if (value.kind === "visitors") {
      const measurement = value.measurement;
      const count = measurement?.current;
      return count === null || count === undefined
        ? `來賓：資料待補／目標 ${value.target} 位${measurement?.reason ? `・${measurement.reason}` : ""}`
        : `目前 ${count}／地基 ${value.target} 位來賓・尚差 ${Math.max(0, value.target - count)} 位（${measurement.periodStart}～${measurement.periodEnd} PALMS）`;
    }
    if (value.kind === "monthly_visitors") return cycles(value, now).map(cycle => `${cycle.label}：${cycle.measurement?.current == null ? "資料待補" : `${cycle.measurement.current}／${value.target} 位${cycle.measurement.current >= value.target ? "・已達標" : "・未達標"}`}（${cycle.measurement?.periodEnd ? `資料至 ${cycle.measurement.periodEnd}` : "尚無可核對 PALMS"}）`).join("；") || "適用月份尚未開始";
    if (value.kind === "quarterly_workshop") return cycles(value, now).map(cycle => `${cycle.label}：${cycle.result?.status === "achieved" ? `已確認參加（${cycle.result.attendedOn}）` : "0／1 堂・待副主席確認"}`).join("；") || "適用季度尚未開始";
    return labels[value.status];
  }
  function summaryText(items, now = new Date()) {
    return groupByMember(items).map(group => `${group.memberName}｜${group.items.length} 項地基\n` + group.items.map(value => `${value.title}\n約定：${value.criterion || "詳見受保護的續約訪談"}\n${progressText(value, now)}\n期限 ${displayDeadline(value)}｜${attention(value, now).label}｜主責 ${value.leadName}`).join("\n\n")).join("\n\n") || "目前沒有續約地基紀錄";
  }
  function displayDeadline(value) { return value.kind === "flexible" ? calendar.shiftDayKey(value.dueOn, -1) : value.dueOn; }
  function isWorkshop(value) { return value.kind === "quarterly_workshop" || (value.kind === "flexible" && value.metric === "workshop"); }
  function isRecurring(value) { return ["quarterly_workshop", "monthly_visitors"].includes(value.kind) || (value.kind === "flexible" && value.cadence === "recurring"); }
  function metricInfo(value) { return value.metric === "ceu" ? { name: "培訓積分", unit: "分" } : isWorkshop(value) || value.metric === "workshop" ? { name: "工作坊", unit: "場" } : { name: "來賓", unit: "位" }; }
  function cycleReached(value, cycle) { return isWorkshop(value) ? cycle.result?.status === "achieved" && (cycle.result.count ?? 1) >= (value.target || 1) : cycle.measurement?.current != null && cycle.measurement.current >= value.target; }
  function cycleProgress(value, cycle) {
    const metric = metricInfo(value);
    if (isWorkshop(value)) return `${cycle.result?.count ?? (cycle.result?.status === "achieved" ? 1 : 0)}／${value.target || 1} 場・${cycleReached(value, cycle) ? "已確認" : "待副主席確認"}`;
    return `${cycle.measurement?.current == null ? "資料待補" : cycle.measurement.current}／${value.target} ${metric.unit}・${cycleReached(value, cycle) ? "已達標" : "待跟進"}${cycle.measurement?.periodEnd ? `（資料至 ${cycle.measurement.periodEnd}）` : ""}`;
  }
  function compactProgress(value, now = new Date()) {
    const list = cycles(value, now);
    if (!list.length) return progressText(value, now);
    const pending = list.slice(0, -1).filter(cycle => !cycleReached(value, cycle));
    return `${list.at(-1).label}：${cycleProgress(value, list.at(-1))}${pending.length ? `；另有 ${pending.length} 期未完成／待補` : ""}`;
  }
  function groupByMember(items) {
    const groups = new Map();
    for (const item of items) {
      const key = item.memberId || item.memberName;
      if (!groups.has(key)) groups.set(key, { key, memberId: item.memberId || "", memberName: item.memberName, items: [] });
      groups.get(key).items.push(item);
    }
    return [...groups.values()];
  }
  return { labels, resolved, manager, assigned, canReadDetail, required, day, definition, suggestedText, attention, transition, reminderText, cycles, trackingStartsOn, progressText, summaryText, isWorkshop, isRecurring, metricInfo, cycleReached, compactProgress, groupByMember, displayDeadline };
});
