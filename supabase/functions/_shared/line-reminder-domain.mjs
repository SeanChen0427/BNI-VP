export const LINE_REMINDER_KEYS = ["weekly_meeting_alarm", "monthly_data_entry"];

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
  const daysBefore = Number(input.daysBefore);
  if (!Number.isInteger(meetingWeekday) || meetingWeekday < 1 || meetingWeekday > 7) throw new Error("例會星期設定不正確");
  if (!Number.isInteger(daysBefore) || daysBefore < 0 || daysBefore > 7) throw new Error("提前天數必須為 0 至 7 天");
  return { ...result, send_weekday: null, meeting_weekday: meetingWeekday, days_before: daysBefore };
}
