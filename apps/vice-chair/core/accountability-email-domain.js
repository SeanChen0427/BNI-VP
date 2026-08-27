(function exposeAccountabilityEmailDomain(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FulianAccountabilityEmailDomain = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createAccountabilityEmailDomain() {
  const TEMPLATE_VERSION = "fulian-accountability-v1-2026-08-27";
  const STATUSES = Object.freeze({
    PENDING_DATA: "pending_data",
    PENDING_SEND: "pending_send",
    SENT: "sent",
    HELD: "held",
    NOT_APPLICABLE: "not_applicable",
  });

  const rules = Object.freeze([
    Object.freeze({ reason: "absence", occurrence: 2, templateKey: "absence-2", title: "缺席第 2 次當責信", risk: "notice" }),
    Object.freeze({ reason: "absence", occurrence: 3, templateKey: "absence-3", title: "缺席第 3 次當責信", risk: "warning" }),
    Object.freeze({ reason: "absence", occurrence: 4, templateKey: "absence-4-open-category", title: "缺席第 4 次－開放行業別（專業類別）當責信", risk: "open_category" }),
    Object.freeze({ reason: "proxy", occurrence: 6, templateKey: "proxy-6", title: "代理第 6 次當責信", risk: "notice" }),
    Object.freeze({ reason: "proxy", occurrence: 7, templateKey: "proxy-7", title: "代理第 7 次當責信", risk: "warning" }),
    Object.freeze({ reason: "proxy", occurrence: 8, templateKey: "proxy-8", title: "代理第 8 次當責信", risk: "final_warning" }),
    Object.freeze({ reason: "proxy", occurrence: 9, templateKey: "proxy-9-open-category", title: "代理第 9 次－開放行業別（專業類別）當責信", risk: "open_category" }),
  ]);
  const ruleByKey = new Map(rules.map(rule => [`${rule.reason}:${rule.occurrence}`, rule]));

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function isoDate(value) {
    const normalized = text(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
  }

  function dateLabel(value) {
    const normalized = isoDate(value);
    if (!normalized) return "日期待補";
    const [year, month, day] = normalized.split("-");
    return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
  }

  function periodLabel(start, end) {
    const from = isoDate(start);
    const through = isoDate(end);
    return from && through ? `${from} 至 ${through}` : "滾動六個月期間待補";
  }

  function ruleFor(reason, occurrence) {
    return ruleByKey.get(`${reason}:${Number(occurrence)}`) || null;
  }

  function thresholds(reason) {
    return rules.filter(rule => rule.reason === reason).map(rule => rule.occurrence);
  }

  function effectiveAbsence(totals = {}) {
    const absence = Math.max(0, Number(totals.absence) || 0);
    const late = Math.max(0, Number(totals.late) || 0);
    return absence + Math.floor(late / 3);
  }

  function countFor(reason, totals = {}) {
    return reason === "absence"
      ? effectiveAbsence(totals)
      : reason === "proxy" ? Math.max(0, Number(totals.proxy) || 0) : 0;
  }

  function crossings(before = {}, after = {}) {
    const reached = [];
    for (const reason of ["absence", "proxy"]) {
      const previous = countFor(reason, before);
      const current = countFor(reason, after);
      for (const occurrence of thresholds(reason)) {
        if (previous < occurrence && current >= occurrence) reached.push(ruleFor(reason, occurrence));
      }
    }
    return reached.filter(Boolean);
  }

  function exactCurrentRules(totals = {}) {
    return ["absence", "proxy"]
      .map(reason => ruleFor(reason, countFor(reason, totals)))
      .filter(Boolean);
  }

  function subjectFor(rule, memberName) {
    const name = text(memberName) || "會員";
    if (rule.risk === "open_category") {
      return `【BNI 富聯分會】${name}－${rule.reason === "absence" ? "缺席" : "代理"}第 ${rule.occurrence} 次開放行業別（專業類別）當責通知`;
    }
    return `【BNI 富聯分會】${name}－${rule.reason === "absence" ? "缺席" : "代理"}第 ${rule.occurrence} 次當責通知`;
  }

  function reasonParagraph(rule, period) {
    if (rule.reason === "absence") {
      if (rule.occurrence === 4) {
        return `依富聯分會會員委員會已核對的出席紀錄，您於 ${period} 累計缺席第 4 次，已達開放行業別（專業類別）的通知門檻。`;
      }
      return `依富聯分會會員委員會已核對的出席紀錄，您於 ${period} 累計缺席第 ${rule.occurrence} 次，特此寄送本次當責通知。`;
    }
    if (rule.occurrence === 9) {
      return `依富聯分會會員委員會已核對的出席紀錄，您於 ${period} 累計代理第 9 次，已達開放行業別（專業類別）的通知門檻。`;
    }
    return `依富聯分會會員委員會已核對的出席紀錄，您於 ${period} 累計代理第 ${rule.occurrence} 次，特此寄送本次當責通知。`;
  }

  function guidanceParagraph(rule) {
    if (rule.reason === "proxy" && rule.occurrence === 8) {
      return "本次為代理第 8 次，已達現行代理次數上限；若於同一滾動六個月期間出現第 9 次代理，將進入開放行業別（專業類別）通知門檻。";
    }
    if (rule.risk === "open_category") {
      return "本信為開放行業別（專業類別）當責通知。若您對出席紀錄、計算期間或適用情形有疑問，請儘速與會員委員會聯繫，以便核對相關資料。";
    }
    if (rule.reason === "proxy") {
      return "為維持穩定的分會參與及商務合作品質，敬請留意後續例會出席安排；若有需要協助之處，請與會員委員會聯繫。";
    }
    return "為維持穩定的分會參與及商務合作品質，敬請留意後續例會出席；若對紀錄有疑問或需要協助，請與會員委員會聯繫。";
  }

  function renderDraft(input = {}) {
    const rule = ruleFor(input.reason, input.occurrence);
    if (!rule) return { complete: false, missing: ["信件級別"], subject: "", body: "", templateVersion: TEMPLATE_VERSION };
    const memberName = text(input.memberName);
    const periodStart = isoDate(input.periodStart);
    const periodEnd = isoDate(input.periodEnd);
    const triggerDate = isoDate(input.triggerDate);
    const missing = [];
    if (!memberName) missing.push("會員姓名");
    if (!periodStart || !periodEnd) missing.push("滾動六個月期間");
    if (!triggerDate) missing.push("觸發例會／統計截止日");
    const period = periodLabel(periodStart, periodEnd);
    const body = `${dateLabel(input.noticeDate || triggerDate)}\n\n${memberName || "【會員姓名】"}您好：\n\n${reasonParagraph(rule, period)}\n\n${guidanceParagraph(rule)}\n\n本信由系統依已核對的出席資料產生草稿，實際寄送前仍請確認會員姓名、次數、期間、收件人及副本資料。\n\n祝 商安\n\n會員委員會\nBNI® 富聯分會`;
    return {
      complete: missing.length === 0,
      missing,
      subject: subjectFor(rule, memberName),
      body,
      title: rule.title,
      risk: rule.risk,
      templateKey: rule.templateKey,
      templateVersion: TEMPLATE_VERSION,
    };
  }

  function copyBundle(input = {}) {
    const recipient = text(input.recipientEmail) || "【請在正式信箱選擇會員收件地址】";
    const cc = Array.isArray(input.cc) ? input.cc.map(text).filter(Boolean).join("、") : text(input.cc);
    return `收件人：${recipient}\n副本：${cc || "【請依現行規範選擇副本對象】"}\n主旨：${text(input.subject)}\n\n${text(input.body)}`;
  }

  function taskIdentity(input = {}) {
    const memberId = text(input.memberId);
    const reason = text(input.reason);
    const occurrence = Number(input.occurrence) || 0;
    const triggerDate = isoDate(input.triggerDate);
    return [memberId, reason, occurrence, triggerDate].join(":");
  }

  return Object.freeze({
    TEMPLATE_VERSION,
    STATUSES,
    rules,
    ruleFor,
    thresholds,
    effectiveAbsence,
    countFor,
    crossings,
    exactCurrentRules,
    renderDraft,
    copyBundle,
    taskIdentity,
    dateLabel,
    periodLabel,
  });
});
