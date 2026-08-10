const REPORT_TYPES = new Set(["halfYear", "annual", "monthly", "audit", "renewal"]);
const MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function rawReportObjectPath({ month, type, index, createdAt, sha256 }) {
  const normalizedMonth = String(month || "");
  const normalizedType = String(type || "");
  const normalizedHash = String(sha256 || "").toLowerCase();
  const normalizedIndex = Number(index);
  const normalizedCreatedAt = Number(createdAt);

  if (!MONTH_PATTERN.test(normalizedMonth)) throw new Error("報表月份格式不正確");
  if (!REPORT_TYPES.has(normalizedType)) throw new Error("報表類型不正確");
  if (!Number.isInteger(normalizedIndex) || normalizedIndex < 0 || normalizedIndex > 7) throw new Error("報表序號不正確");
  if (!Number.isSafeInteger(normalizedCreatedAt) || normalizedCreatedAt <= 0) throw new Error("報表上傳時間不正確");
  if (!SHA256_PATTERN.test(normalizedHash)) throw new Error("報表雜湊格式不正確");

  return `monthly-data/${normalizedMonth}/${normalizedType}/${normalizedCreatedAt}-${normalizedIndex}-${normalizedHash.slice(0, 16)}.xls`;
}
