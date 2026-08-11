import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("已離會會員可由歷史紀錄安排選擇性補訪且綁定正式會員識別碼", () => {
  const creator = read("assets/js/case-creator.js");
  const settings = read("assets/js/settings.js");
  const live = read("assets/js/departure-form-live.js");

  assert.match(settings, /case-board\.html\?new=departure&amp;memberId=/);
  assert.match(creator, /歷史離會會員/);
  assert.match(creator, /memberRecordId:\s*departureMember\?\.memberId/);
  assert.match(creator, /補訪不會恢復會員資格/);
  assert.match(live, /task\.memberRecordId/);
  assert.match(live, /已離會會員的補訪/);
  assert.match(live, /不會恢復現任會員資格/);
});

test("正式後端允許離會案件綁定 departed member，但其他既有會員案件仍限 active", () => {
  const edge = read("../../supabase/functions/app-api/index.ts");

  assert.match(edge, /departureMemberByName: new Map\(members\.filter\(\(member: any\) => \["active", "departed"\]/);
  assert.match(edge, /task\.type !== "new" && task\.type !== "departure" && selectedMember\?\.status !== "active"/);
  assert.match(edge, /task\.type === "departure" && !\["active", "departed"\]\.includes/);
  assert.match(edge, /案件會員識別資料與姓名不一致/);
  assert.match(edge, /不能標記為不安排/);
});

test("離會補訪偏好只保存安排狀態，不修改會員狀態", () => {
  const migration = read("../../supabase/migrations/20260811011500_departure_interview_preferences.sql");

  assert.match(migration, /create table if not exists public\.departure_interview_preferences/);
  assert.match(migration, /member_id uuid primary key references public\.members\(id\)/);
  assert.match(migration, /check \(disposition in \('optional', 'waived'\)\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all .* authenticated/);
  assert.match(migration, /grant select, insert, update .* service_role/);
  assert.doesNotMatch(migration, /update public\.members/i);
});
