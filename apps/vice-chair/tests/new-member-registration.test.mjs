import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const html = read("apps/vice-chair/settings.html");
const settings = read("apps/vice-chair/assets/js/settings.js");
const attendance = read("apps/vice-chair/assets/js/attendance.js");
const edge = read("supabase/functions/app-api/index.ts");
const migration = read("supabase/migrations/20260805090000_provisional_new_members.sql");

assert.match(html, /id="newMemberRegistrationCard" hidden/);
assert.match(html, /不會進入續約、期中關懷、會員儀表板或正式分析/);
assert.match(settings, /canManageNewMembers=\["admin","vp"\]/);
assert.match(settings, /\/api\/new-member-registration/);
assert.match(settings, /action:"register"/);
assert.match(settings, /action:"cancel"/);

assert.match(migration, /create table public\.provisional_members/);
assert.match(migration, /status in \('pending_palms', 'promoted', 'cancelled'\)/);
assert.match(migration, /provisional_members_unique_pending_identity/);
assert.match(migration, /num_nonnulls\(member_id, provisional_member_id\) = 1/);
assert.match(migration, /edge_promote_provisional_member/);
assert.match(migration, /revoke all on table public\.provisional_members from public, anon, authenticated/);

assert.match(edge, /leadership\(context\);[\s\S]{0,180}if \(request\.method === "GET"\) return newMemberRegistrationState/);
assert.match(edge, /stateRows\?\.\[0\]\?\.workflow\?\.closed/);
assert.match(edge, /相同姓名與專業別已存在，不可重複登錄/);
assert.match(edge, /reconcileProvisionalMembersWithPalms/);
assert.match(edge, /同名資料無法由 PALMS 唯一辨識/);
assert.match(edge, /status=eq\.pending_palms/);
assert.match(edge, /protectedNewMemberCases/);
assert.match(edge, /resettableTasks/);

assert.match(attendance, /attendanceId:member\.attendanceId/);
assert.match(attendance, /新會員・待 PALMS/);
assert.match(edge, /provisional_member_id/);
assert.match(edge, /official\[member\.attendanceId\] = \{ late: 0, proxy: 0, absence: 0 \}/);

console.log("new member registration tests passed");
