import { buildCaseFeedbackNoticeText } from "../app-api/line-message.mjs";

export const CASE_FEEDBACK_CALL_FORMAT = "case-feedback-reply-card-v1";

const CASE_TYPE_LABELS = Object.freeze({
  renewal: "續約",
  new: "新申請",
  industry: "轉換行業別",
});

function requiredText(value, message) {
  const text = String(value || "").trim();
  if (!text) throw new Error(message);
  return text;
}

export function normalizeFeedbackCallText(value) {
  return String(value || "").replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim();
}

export function buildFeedbackCallText({ feedbackUrl, ...noticeInput }) {
  const url = requiredText(feedbackUrl, "回饋網址尚未建立");
  const notice = buildCaseFeedbackNoticeText(noticeInput);
  return normalizeFeedbackCallText(`${notice}
------------------
請點以下連結填寫委員回饋，送出後會直接同步系統：
${url}`);
}

export function feedbackCallFingerprintSource(text) {
  return `${CASE_FEEDBACK_CALL_FORMAT}\n${normalizeFeedbackCallText(text)}`;
}

export function extractFeedbackCallToken(text) {
  const normalized = normalizeFeedbackCallText(text);
  const match = normalized.match(/(?:^|[?&])f=([A-Za-z0-9_-]{43})(?:$|[&#\s])/m)
    || normalized.match(/public-feedback\.html\?f=([A-Za-z0-9_-]{43})(?:$|[&#\s])/m);
  return match?.[1] || "";
}

export function extractFeedbackCallUrl(text) {
  const normalized = normalizeFeedbackCallText(text);
  const match = normalized.match(/https:\/\/[^\s<>]+\/public-feedback\.html\?f=[A-Za-z0-9_-]{43}(?:&[^\s<>]*)?/m)
    || normalized.match(/https:\/\/[^\s<>]+\?f=[A-Za-z0-9_-]{43}(?:&[^\s<>]*)?/m);
  return match?.[0] || "";
}

export function buildFeedbackCallReplyMessages({
  caseType,
  applicant,
  profession,
  feedbackUrl,
}) {
  const label = CASE_TYPE_LABELS[String(caseType || "")];
  if (!label) throw new Error("案件類型不適用回饋圖卡");
  const memberName = requiredText(applicant, "案件申請者姓名尚未填寫");
  const professionName = requiredText(profession, "案件專業別尚未填寫");
  const url = requiredText(feedbackUrl, "回饋網址尚未建立");
  const title = `${label}委員回饋`;
  return [
    {
      type: "textV2",
      text: `{all}\n委員回饋已開放：${memberName}`,
      substitution: {
        all: { type: "mention", mentionee: { type: "all" } },
      },
    },
    {
      type: "flex",
      altText: `${title}｜${memberName}`.slice(0, 400),
      contents: {
        type: "bubble",
        size: "kilo",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#9F171C",
          paddingAll: "18px",
          contents: [
            { type: "text", text: title, color: "#FFFFFF", weight: "bold", size: "xl" },
            { type: "text", text: "會員委員會", color: "#FFFFFFCC", size: "sm", margin: "sm" },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          contents: [
            { type: "text", text: memberName, weight: "bold", size: "xl", wrap: true },
            { type: "text", text: professionName, color: "#666666", size: "sm", wrap: true },
            { type: "separator", margin: "md" },
            { type: "text", text: "免登入填寫，送出後直接同步正式案件。", color: "#9F171C", weight: "bold", size: "sm", wrap: true },
            { type: "text", text: "打開頁面即可查看目前所有委員回饋。", color: "#777777", size: "xs", wrap: true },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          paddingAll: "14px",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#9F171C",
              height: "sm",
              action: { type: "uri", label: "填寫／查看回饋", uri: url },
            },
          ],
        },
      },
    },
  ];
}
