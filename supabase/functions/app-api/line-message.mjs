export const LINE_ATTENDANCE_MESSAGE_FORMAT = "text-v2-mention-all-v1";

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
