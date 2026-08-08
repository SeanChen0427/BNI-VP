export const LINE_ATTENDANCE_MESSAGE_FORMAT = "text-v2-mention-all-v1";
export const CASE_VOTE_NOTICE_FORMAT = "case-vote-text-v2-mention-all-v1";

const CASE_VOTE_LABELS = {
  new: "新申請",
  renewal: "續約",
  industry: "轉換行業別",
};

function escapeTextV2Placeholders(value) {
  return String(value).replaceAll("{", "{{").replaceAll("}", "}}");
}

export function lineAttendanceFingerprintSource(announcement) {
  return `${LINE_ATTENDANCE_MESSAGE_FORMAT}\n${String(announcement)}`;
}

export function buildLineMentionAllMessage(content) {
  const text = `{all}\n${escapeTextV2Placeholders(content)}`;
  if ([...text].length > 5000) {
    throw new Error("LINE 訊息加上 @所有人後超過 5,000 字，請先調整內容");
  }
  return {
    type: "textV2",
    text,
    substitution: {
      all: {
        type: "mention",
        mentionee: { type: "all" },
      },
    },
  };
}

export function buildLineAttendanceMessage(announcement) {
  try {
    return buildLineMentionAllMessage(announcement);
  } catch (error) {
    throw new Error(String(error?.message || error).replace("LINE 訊息", "LINE 公告"));
  }
}

function taipeiDateParts(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

function addIsoDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function spokenTime(hourValue, minuteValue) {
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const period = hour < 12 ? "上午" : hour === 12 ? "中午" : hour < 18 ? "下午" : "晚上";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${period}${displayHour}${minute ? `:${String(minute).padStart(2, "0")}` : "點"}`;
}

export function formatCaseVoteDeadline(deadlineAt, now = new Date()) {
  const deadline = new Date(deadlineAt);
  if (!Number.isFinite(deadline.getTime())) throw new Error("投票截止時間格式不正確");
  const target = taipeiDateParts(deadline);
  const current = taipeiDateParts(now);
  const targetDate = `${target.year}-${target.month}-${target.day}`;
  const currentDate = `${current.year}-${current.month}-${current.day}`;
  const time = spokenTime(target.hour, target.minute);
  if (targetDate === addIsoDays(currentDate, 1)) return `明天${time}`;
  if (targetDate === currentDate) return `今天${time}`;
  return `${Number(target.year)}/${Number(target.month)}/${Number(target.day)} ${time}`;
}

export function buildCaseVoteNoticeText({ caseType, applicant, profession, deadlineAt, now = new Date() }) {
  const label = CASE_VOTE_LABELS[String(caseType || "")];
  if (!label) throw new Error("案件類型不適用投票通知");
  const memberName = String(applicant || "").trim();
  const professionName = String(profession || "").trim();
  if (!memberName) throw new Error("案件申請者姓名尚未填寫");
  if (!professionName) throw new Error("案件專業別尚未填寫");
  return `【${label}投票】\n申請者：${memberName}\n專業別：${professionName}\n\n請各位委員針對表述回饋及相關文件，開始進行投票！\n截止至${formatCaseVoteDeadline(deadlineAt, now)}前\n會員委員及副主席擁有各一票投票權，董事顧問有最終裁量權。\n攸關團隊品質，請委員們參閱回饋務必投下這一票！\n***完成投票請 tag 回覆「已投」`;
}

export function caseVoteNoticeFingerprintSource(content) {
  return `${CASE_VOTE_NOTICE_FORMAT}\n${String(content)}`;
}

export function buildCaseVoteNoticeMessage(input) {
  return buildLineMentionAllMessage(buildCaseVoteNoticeText(input));
}
