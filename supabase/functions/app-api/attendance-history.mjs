// Read only the date index in batches; load the requested session independently.
export async function loadAttendanceHistory(db) {
  const sessions = [];
  let before = "";
  while (true) {
    const batch = await db(`attendance_sessions?select=meeting_date,status,confirmed_at&order=meeting_date.desc&limit=500${before ? `&meeting_date=lt.${before}` : ""}`);
    if (!batch.length) return sessions;
    sessions.push(...batch);
    before = batch.at(-1).meeting_date;
  }
}
