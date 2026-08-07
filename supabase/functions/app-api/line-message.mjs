export const LINE_ATTENDANCE_MESSAGE_FORMAT = "text-v2-mention-all-v1";

function escapeTextV2Placeholders(value) {
  return String(value).replaceAll("{", "{{").replaceAll("}", "}}");
}

export function lineAttendanceFingerprintSource(announcement) {
  return `${LINE_ATTENDANCE_MESSAGE_FORMAT}\n${String(announcement)}`;
}

export function buildLineAttendanceMessage(announcement) {
  const text = `{all}\n${escapeTextV2Placeholders(announcement)}`;
  if ([...text].length > 5000) {
    throw new Error("LINE 公告加上 @所有人後超過 5,000 字，請先調整公告內容");
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
