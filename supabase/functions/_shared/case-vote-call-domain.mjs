export const CASE_VOTE_CALL_FORMAT = "case-vote-reply-card-v1";

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

function taipeiParts(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("投票截止時間格式不正確");
  return Object.fromEntries(new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).map(part => [part.type, part.value]));
}

export function formatVoteCallDeadline(value) {
  const parts = taipeiParts(value);
  return `${Number(parts.year)}/${Number(parts.month)}/${Number(parts.day)} ${parts.hour}:${parts.minute}`;
}

export function normalizeVoteCallText(value) {
  return String(value || "").replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim();
}

export function buildVoteCallText({
  caseType,
  applicant,
  profession,
  deadlineAt,
  ballotUrl,
  isTest = false,
}) {
  const label = CASE_TYPE_LABELS[String(caseType || "")];
  if (!label) throw new Error("案件類型不適用投票呼喚");
  const memberName = requiredText(applicant, "案件申請者姓名尚未填寫");
  const professionName = requiredText(profession, "案件專業別尚未填寫");
  const url = requiredText(ballotUrl, "投票網址尚未建立");
  const title = isTest
    ? `@All 【測試${label}投票｜不列入正式紀錄】`
    : `@All 【${label}投票】`;
  const testNotice = isTest
    ? "\n⚠️ 這是功能測試，不建立正式案件、不列入正式票數。"
    : "";
  return normalizeVoteCallText(`${title}
申請者：${memberName}
專業別：${professionName}
${url}
${testNotice}
請各位委員針對表述回饋及相關文件，開始進行投票！
投票截止：${formatVoteCallDeadline(deadlineAt)}
會員委員及副主席擁有各一票投票權，董事顧問有最終裁量權。
攸關團隊品質，請委員們參閱回饋務必投下這一票！
***完成投票請 tag 回覆「已投」`);
}

export function voteCallFingerprintSource(text) {
  return `${CASE_VOTE_CALL_FORMAT}\n${normalizeVoteCallText(text)}`;
}

export function extractVoteCallToken(text) {
  const normalized = normalizeVoteCallText(text);
  const match = normalized.match(/(?:^|[?&])t=([A-Za-z0-9_-]{43})(?:$|[&#\s])/m)
    || normalized.match(/public-vote\.html\?t=([A-Za-z0-9_-]{43})(?:$|[&#\s])/m);
  return match?.[1] || "";
}

export function extractVoteCallUrl(text) {
  const normalized = normalizeVoteCallText(text);
  const match = normalized.match(/https:\/\/[^\s<>]+\/public-vote\.html\?t=[A-Za-z0-9_-]{43}(?:&[^\s<>]*)?/m)
    || normalized.match(/https:\/\/[^\s<>]+\?t=[A-Za-z0-9_-]{43}(?:&[^\s<>]*)?/m);
  return match?.[0] || "";
}

export function buildVoteCallReplyMessages({
  caseType,
  applicant,
  profession,
  deadlineAt,
  ballotUrl,
  isTest = false,
}) {
  const label = CASE_TYPE_LABELS[String(caseType || "")];
  if (!label) throw new Error("案件類型不適用投票圖卡");
  const memberName = requiredText(applicant, "案件申請者姓名尚未填寫");
  const professionName = requiredText(profession, "案件專業別尚未填寫");
  const url = requiredText(ballotUrl, "投票網址尚未建立");
  const headline = isTest ? "測試投票圖卡已建立" : "委員投票已開放";
  const title = isTest ? `測試${label}投票` : `${label}投票`;
  const notice = isTest ? "本票只供功能測試，不列入正式紀錄。" : "請選擇自己的姓名後完成投票。";
  return [
    {
      type: "textV2",
      text: `{all}\n${headline}：${memberName}`,
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
          backgroundColor: isTest ? "#5B6472" : "#9F171C",
          paddingAll: "18px",
          contents: [
            { type: "text", text: title, color: "#FFFFFF", weight: "bold", size: "xl" },
            { type: "text", text: isTest ? "不列入正式紀錄" : "會員委員會", color: "#FFFFFFCC", size: "sm", margin: "sm" },
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
            { type: "text", text: `截止：${formatVoteCallDeadline(deadlineAt)}`, color: "#9F171C", weight: "bold", size: "sm", wrap: true },
            { type: "text", text: notice, color: "#777777", size: "xs", wrap: true },
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
              color: isTest ? "#5B6472" : "#9F171C",
              height: "sm",
              action: { type: "uri", label: "前往投票", uri: url },
            },
          ],
        },
      },
    },
  ];
}
