export const LINE_REMINDER_KEYS = ["weekly_meeting_alarm", "monthly_data_entry", "monthly_committee_meeting"];
export const OPPORTUNISTIC_REMINDER_KEYS = ["weekly_meeting_alarm", "monthly_data_entry"];

const OPPORTUNISTIC_KEYS = new Set(OPPORTUNISTIC_REMINDER_KEYS);
const REMINDER_LABELS = {
  weekly_meeting_alarm: "每週例會鬧鐘提醒",
  monthly_data_entry: "月底數據 Key in 提醒",
  monthly_committee_meeting: "每月會員委員會會議提醒",
};

const WEEKDAYS = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

export function taipeiDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
  return { ...parts, date, weekday, minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function lastIsoWeekdayOfMonth(year, month, isoWeekday) {
  const last = new Date(Date.UTC(Number(year), Number(month), 0));
  const current = last.getUTCDay() || 7;
  last.setUTCDate(last.getUTCDate() - ((current - Number(isoWeekday) + 7) % 7));
  return last.toISOString().slice(0, 10);
}

export function firstIsoWeekdayOfMonth(year, month, isoWeekday) {
  const first = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  const current = first.getUTCDay() || 7;
  first.setUTCDate(first.getUTCDate() + ((Number(isoWeekday) - current + 7) % 7));
  return first.toISOString().slice(0, 10);
}

export function addUtcDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

export function ruleDueDate(rule, now = new Date()) {
  const local = taipeiDateParts(now);
  if (rule.reminder_key === "weekly_meeting_alarm") {
    return local.weekday === Number(rule.send_weekday) ? local.date : null;
  }
  if (rule.reminder_key === "monthly_data_entry") {
    const lastMeeting = lastIsoWeekdayOfMonth(local.year, local.month, Number(rule.meeting_weekday));
    const due = addUtcDays(lastMeeting, -Number(rule.days_before));
    return due === local.date ? due : null;
  }
  if (rule.reminder_key === "monthly_committee_meeting") {
    const currentMonth = { year: Number(local.year), month: Number(local.month) };
    const next = currentMonth.month === 12
      ? { year: currentMonth.year + 1, month: 1 }
      : { year: currentMonth.year, month: currentMonth.month + 1 };
    for (const period of [currentMonth, next]) {
      const firstMeeting = firstIsoWeekdayOfMonth(period.year, period.month, Number(rule.meeting_weekday));
      const due = addUtcDays(firstMeeting, -Number(rule.days_before));
      if (due === local.date) return due;
    }
    return null;
  }
  return null;
}

export function isRuleDue(rule, now = new Date(), graceMinutes = 360) {
  if (!rule?.enabled || !ruleDueDate(rule, now)) return false;
  const local = taipeiDateParts(now);
  const [hour, minute] = String(rule.send_time || "").slice(0, 5).split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return false;
  const elapsed = local.minuteOfDay - (hour * 60 + minute);
  return elapsed >= 0 && elapsed <= graceMinutes;
}

export function weekdayLabel(isoWeekday) {
  return WEEKDAYS[Number(isoWeekday) % 7] || "—";
}

export function reminderRouteKey(reminderKey) {
  return reminderKey === "monthly_committee_meeting" ? "committee" : "exchange";
}

export function isOpportunisticReminder(reminderKey) {
  return OPPORTUNISTIC_KEYS.has(String(reminderKey || ""));
}

export function reminderDisplayName(reminderKey) {
  return REMINDER_LABELS[String(reminderKey || "")] || "交流群常態提醒";
}

function shiftedYearMonth(year, month, offset) {
  const zeroBased = Number(year) * 12 + Number(month) - 1 + Number(offset);
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

export function nextRuleOccurrence(rule, now = new Date()) {
  const sendTime = String(rule?.send_time || "").slice(0, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(sendTime)) return null;
  const local = taipeiDateParts(now);
  const nowLocal = `${local.date}T${local.hour}:${local.minute}`;
  const candidates = [];
  if (rule.reminder_key === "weekly_meeting_alarm") {
    const weekday = Number(rule.send_weekday);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return null;
    let due = addUtcDays(local.date, (weekday - Number(local.weekday) + 7) % 7);
    if (`${due}T${sendTime}` < nowLocal) due = addUtcDays(due, 7);
    candidates.push(due);
  } else if (["monthly_data_entry", "monthly_committee_meeting"].includes(rule.reminder_key)) {
    const weekday = Number(rule.meeting_weekday);
    const daysBefore = Number(rule.days_before);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !Number.isInteger(daysBefore)) return null;
    for (let offset = 0; offset <= 18; offset += 1) {
      const period = shiftedYearMonth(local.year, local.month, offset);
      const meeting = rule.reminder_key === "monthly_data_entry"
        ? lastIsoWeekdayOfMonth(period.year, period.month, weekday)
        : firstIsoWeekdayOfMonth(period.year, period.month, weekday);
      candidates.push(addUtcDays(meeting, -daysBefore));
    }
  } else {
    return null;
  }
  const date = [...new Set(candidates)].sort().find(candidate => `${candidate}T${sendTime}` >= nowLocal);
  if (!date) return null;
  return {
    date,
    time: sendTime,
    localDateTime: `${date}T${sendTime}`,
    timezone: "Asia/Taipei",
    weekday: new Date(`${date}T00:00:00Z`).getUTCDay() || 7,
  };
}

function taipeiLocalDateTime(value) {
  const normalized = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function opportunisticDeliveryWindow(rule, now = new Date(), windowMinutes = 720, graceMinutes = 360) {
  if (!rule?.enabled || !isOpportunisticReminder(rule.reminder_key)) return null;
  const duration = Number(windowMinutes);
  const grace = Number(graceMinutes);
  if (!Number.isInteger(duration) || duration < 5 || duration > 1440) return null;
  if (!Number.isInteger(grace) || grace < 0 || grace > 1440) return null;
  const sendTime = String(rule.send_time || "").slice(0, 5);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(sendTime)) return null;

  const dueToday = ruleDueDate(rule, now);
  const next = nextRuleOccurrence(rule, now);
  const localCandidates = [
    dueToday ? `${dueToday}T${sendTime}` : "",
    next?.localDateTime || "",
  ].filter(Boolean);
  const candidates = [...new Set(localCandidates)]
    .map(localDateTime => ({ localDateTime, deadline: taipeiLocalDateTime(localDateTime) }))
    .filter(item => item.deadline)
    .sort((left, right) => left.deadline.getTime() - right.deadline.getTime());
  const nowTime = now.getTime();
  const selected = candidates.find(({ deadline }) => {
    const end = deadline.getTime();
    return nowTime >= end - duration * 60_000 && nowTime <= end + grace * 60_000;
  });
  if (!selected) return null;
  const windowEnd = selected.deadline;
  const windowStart = new Date(windowEnd.getTime() - duration * 60_000);
  return {
    localDueDate: selected.localDateTime.slice(0, 10),
    deadlineLocal: selected.localDateTime,
    scheduledFor: windowEnd.toISOString(),
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    expired: nowTime > windowEnd.getTime(),
  };
}

export function formatTaipeiReminderDeadline(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "時間待確認";
  const local = taipeiDateParts(date);
  return `${local.year}/${local.month}/${local.day}（${weekdayLabel(local.weekday)}）${local.hour}:${local.minute}`;
}

export function buildReminderFallbackMessages({ reminderKey, scheduledFor, content, groupName = "富聯交流群", waitingHours = 12 } = {}) {
  const body = String(content || "").trim();
  if (!body) throw new Error("備援提醒內容不可為空");
  const target = String(groupName || "富聯交流群").trim().slice(0, 200) || "富聯交流群";
  const hours = Number.isFinite(Number(waitingHours)) ? Number(waitingHours) : 12;
  const instruction = [
    "🔔【交流群提醒尚未送達】",
    `副主席秘書 Bot 在 ${hours} 小時等待期間內，沒有遇到可用的交流群新訊息，因此尚未將提醒送到交流群。`,
    "",
    "請副主席或管理者：",
    "1. 長按並複製下一則訊息",
    `2. 貼到「${target}」`,
    "3. 送出前在群內手動標註 @所有人",
    "",
    `提醒項目：${reminderDisplayName(reminderKey)}`,
    `原訂最晚送達：${formatTaipeiReminderDeadline(scheduledFor)}`,
  ].join("\n");
  return [
    { type: "text", text: instruction },
    { type: "text", text: body },
  ];
}

export function validateReminderUpdate(input) {
  if (!input || !LINE_REMINDER_KEYS.includes(String(input.reminderKey))) throw new Error("提醒類型不正確");
  const sendTime = String(input.sendTime || "");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(sendTime)) throw new Error("發送時間格式不正確");
  const messageTemplate = String(input.messageTemplate || "").trim();
  if (!messageTemplate || [...messageTemplate].length > 4500) throw new Error("提醒文案必須為 1 至 4,500 字");
  const result = {
    reminder_key: String(input.reminderKey),
    enabled: Boolean(input.enabled),
    send_time: sendTime,
    message_template: messageTemplate,
    mention_all: input.mentionAll !== false,
  };
  if (result.reminder_key === "weekly_meeting_alarm") {
    const sendWeekday = Number(input.sendWeekday);
    if (!Number.isInteger(sendWeekday) || sendWeekday < 1 || sendWeekday > 7) throw new Error("每週發送日設定不正確");
    return { ...result, send_weekday: sendWeekday, meeting_weekday: null, days_before: null };
  }
  const meetingWeekday = Number(input.meetingWeekday);
  const daysBefore = result.reminder_key === "monthly_committee_meeting" ? 1 : Number(input.daysBefore);
  if (!Number.isInteger(meetingWeekday) || meetingWeekday < 1 || meetingWeekday > 7) throw new Error("例會星期設定不正確");
  if (!Number.isInteger(daysBefore) || daysBefore < 0 || daysBefore > 7) throw new Error("提前天數必須為 0 至 7 天");
  return { ...result, send_weekday: null, meeting_weekday: meetingWeekday, days_before: daysBefore };
}
