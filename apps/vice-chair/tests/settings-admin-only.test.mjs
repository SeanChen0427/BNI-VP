import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("登入帳密、設定紀錄與測試資料重置只提供 Admin", () => {
  const page = read("apps/vice-chair/settings.html");
  const settings = read("apps/vice-chair/assets/js/settings.js");
  const preview = read("apps/vice-chair/preview-server.mjs");
  const edge = read("supabase/functions/app-api/index.ts");
  const resetHandler = edge.match(/async function testResetApi[\s\S]*?\n}\n\nconst COMMITTEE_BOARD_KIND/)[0];

  assert.match(page, /id="credentialsCard" hidden/);
  assert.match(page, /id="auditCard" hidden/);
  assert.match(page, /id="testDataResetCard" hidden/);
  assert.match(page, /assets\/js\/settings\.js\?v=14/);
  assert.match(settings, /#credentialsCard"\)\.hidden=!admin/);
  assert.match(settings, /#auditCard"\)\.hidden=!admin/);
  assert.match(settings, /canResetTestData=session\.role==="admin"/);
  assert.match(preview, /identityRole\(identity\)!=="admin"/);
  assert.match(resetHandler, /context\.role !== "admin"/);
  assert.doesNotMatch(resetHandler, /leadership\(context\)/);
});
