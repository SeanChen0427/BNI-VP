import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("離會訪談保存 Word 後直接結案且不顯示決議流程", () => {
  const form = read("departure-form.html");
  const formScript = read("assets/js/departure-form.js");
  const archive = read("assets/js/case-archive.js");

  assert.match(formScript, /requiresDecision:false/);
  assert.match(form, /保存 Word 後直接結案/);
  assert.match(form, /不會進入委員回饋、投票、董事顧問確認或公告流程/);
  assert.doesNotMatch(form, /推進至待發送委員回饋/);
  assert.match(form, /分會營運改善摘要（請去識別化）/);
  assert.match(form, /後續優化行動／負責人與追蹤備註/);
  assert.match(archive, /#decisionSection"\)\.hidden = true/);
});

test("正式後端拒絕離會案件進入回饋投票並允許主責完成紀錄", () => {
  const edge = read("../../supabase/functions/app-api/index.ts");
  const migration = read("../../supabase/migrations/20260811010000_record_only_case_closure.sql");

  assert.match(edge, /const recordOnlyCase = \["midterm", "departure"\]/);
  assert.match(edge, /此案件為訪談紀錄，不適用委員回饋、投票、董顧確認或結果公告/);
  assert.match(edge, /if \(recordOnlyCase\) \{\s+if \(!workflow\.wordSaved\)/s);
  assert.match(migration, /target_task\.category in \('midterm', 'departure'\)/);
  assert.match(migration, /target_task\.lead_person_id is distinct from p_actor/);
  assert.match(migration, /訪談 Word 尚未成功保存，不能結案/);
});
