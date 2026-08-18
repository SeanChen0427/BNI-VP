export const LINE_ATTENDANCE_MESSAGE_FORMAT = "text-v2-mention-all-v1";
export const CASE_FEEDBACK_NOTICE_FORMAT = "case-feedback-text-v2-mention-all-v1";
export const CASE_VOTE_NOTICE_FORMAT = "case-vote-text-v2-mention-all-v1";
export const CASE_RESULT_ANNOUNCEMENT_FORMAT = "case-result-plain-text-v1";

const CASE_VOTE_LABELS = {
  new: "新申請",
  renewal: "續約",
  industry: "轉換行業別",
};

const CASE_FEEDBACK_LABELS = {
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

export function buildCaseFeedbackNoticeText({
  caseType,
  applicant,
  profession,
  interviewDate,
  leadInterviewer,
  companionInterviewer,
  eligibleMembers,
}) {
  const label = CASE_FEEDBACK_LABELS[String(caseType || "")];
  if (!label) throw new Error("案件類型不適用委員回饋通知");
  const memberName = String(applicant || "").trim();
  const professionName = String(profession || "").trim();
  const date = String(interviewDate || "").trim();
  const lead = String(leadInterviewer || "").trim();
  const companion = String(companionInterviewer || "").trim() || "無";
  const members = [...new Set((Array.isArray(eligibleMembers) ? eligibleMembers : [])
    .map(name => String(name || "").trim())
    .filter(Boolean))];
  if (!memberName) throw new Error("案件申請者姓名尚未填寫");
  if (!professionName) throw new Error("案件專業別尚未填寫");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("請先設定有效的訪談日期");
  if (!lead) throw new Error("請先指定主訪委員");
  if (!members.length) throw new Error("目前沒有可通知的在任投票委員");
  const feedbackLines = members.map(name => `■ ${name} -`).join("\n");
  return `【 ${label}商訪表述&回饋 】\n請主、陪訪回饋與表述,並請委員們參照相簿中「訪談表」及「相關資料」回饋表述。各位為分會重要的守門員,請儘量給予回饋建議!\n------------------\n${date.replaceAll("-", "/")}\n地點: ZOOM\n申請者: ${memberName}\n專業別: ${professionName}\n主訪：${lead} 陪訪：${companion}\n------------------\n${feedbackLines}`;
}

export function caseFeedbackNoticeFingerprintSource(content) {
  return `${CASE_FEEDBACK_NOTICE_FORMAT}\n${String(content)}`;
}

export function buildCaseFeedbackNoticeMessage(input) {
  return buildLineMentionAllMessage(buildCaseFeedbackNoticeText(input));
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

export function formatCaseResultDate(value = new Date()) {
  const parts = taipeiDateParts(value);
  return `${Number(parts.year)}.${Number(parts.month)}.${Number(parts.day)}`;
}

export function buildCaseResultAnnouncementText({
  caseType,
  applicant,
  profession,
  referrerName,
  currentProfession,
  newProfession,
  announcedAt = new Date(),
}) {
  const type = String(caseType || "");
  const memberName = String(applicant || "").trim();
  if (!memberName) throw new Error("案件申請者姓名尚未填寫");
  const date = formatCaseResultDate(announcedAt);
  if (type === "new") {
    const professionName = String(profession || "").trim();
    const referrer = String(referrerName || "").trim();
    if (!professionName) throw new Error("新會員專業別尚未填寫");
    if (!referrer) throw new Error("請先從既有會員中選擇引薦人");
    return `【 ${date} 新會員入會投票結果 】\n\n申請者：${memberName}\n專業別：${professionName}\n推薦人：${referrer}\n\n商業訪談投票結果：通過\n----------------------\n以上經董事顧問確認後，特此公告，\n感謝邀請人、會員委員的付出協助！\n\n（只讀不回）`;
  }
  if (type === "renewal") {
    const professionName = String(profession || "").trim();
    if (!professionName) throw new Error("續約會員專業別尚未填寫");
    return `【 ${date} 續約會員投票結果 】\n\n申請者：${memberName}\n專業別：${professionName}\n\n商業訪談投票結果：通過\n----------------------\n以上經董事顧問確認後，特此公告，\n感謝會員委員的付出協助！\n\n（只讀不回）`;
  }
  if (type === "industry") {
    const oldProfession = String(currentProfession || "").trim();
    const desiredProfession = String(newProfession || "").trim();
    if (!oldProfession) throw new Error("原專業別尚未保存");
    if (!desiredProfession) throw new Error("欲轉專業別尚未填寫");
    if (oldProfession === desiredProfession) throw new Error("原專業別與欲轉專業別不可相同");
    return `【 ${date} 轉換專業別投票結果 】\n\n申請者：${memberName}\n原專業別：${oldProfession}\n欲轉專業別：${desiredProfession}\n\n商訪專業別轉換投票結果：通過。\n\n「${oldProfession}」已開放專業別，歡迎夥伴邀約。\n----------------------\n\n以上經董事顧問確認後，特此公告。\n\n（只讀不回）`;
  }
  throw new Error("案件類型不適用正式結果公告");
}

export function caseResultAnnouncementFingerprintSource(content) {
  return `${CASE_RESULT_ANNOUNCEMENT_FORMAT}\n${String(content)}`;
}

export function buildCaseResultAnnouncementMessage(input) {
  const text = buildCaseResultAnnouncementText(input);
  if ([...text].length > 5000) throw new Error("LINE 正式結果公告超過 5,000 字");
  return { type: "text", text };
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
