import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseDepartedMd, appendDepartedRow, removeDepartedRow, renderMemberDirectory, registerDeparture, undoDeparture, listState } from "../services/member-departure.mjs";

const DEPARTED_MD = `# 離會會員名單

以下會員已離會。

| 姓名 | 離會確認日 | 備註 |
|------|-----------|------|
| 測試甲 | 2026-06-02 | — |

> 更新規則：每次有新離會者，補記姓名與確認日即可。
`;

function makeFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "departure-test-"));
  const paths = {
    departedMd: path.join(dir, "departed-members.md"),
    currentMembers: path.join(dir, "current-members.json"),
    memberDirectory: path.join(dir, "member-directory.js"),
    journal: path.join(dir, "journal.json"),
  };
  writeFileSync(paths.departedMd, DEPARTED_MD);
  writeFileSync(paths.currentMembers, JSON.stringify({ schema: "fulian.current-members.v1", asOf: "2026-07-01", members: [
    { name: "測試乙", profession: "測試業" },
    { name: "測試丙", profession: "示範業" },
  ] }, null, 2));
  writeFileSync(paths.memberDirectory, "placeholder");
  return paths;
}

test("解析與增刪離會表格列", () => {
  const rows = parseDepartedMd(DEPARTED_MD);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "測試甲");
  const appended = appendDepartedRow(DEPARTED_MD, { name: "測試乙", confirmedAt: "2026-07-19", note: "到期未續約" });
  assert.match(appended, /\| 測試乙 \| 2026-07-19 \| 到期未續約 \|/);
  assert.equal(parseDepartedMd(appended).length, 2);
  const removed = removeDepartedRow(appended, "測試乙");
  assert.equal(parseDepartedMd(removed).length, 1);
  assert.ok(removed.includes("> 更新規則"), "尾註必須保留");
});

test("member-directory 生成保持 FulianMemberDirectory 介面", () => {
  const js = renderMemberDirectory(["甲", "乙"]);
  assert.ok(js.includes('window.FulianMemberDirectory'));
  assert.ok(js.includes('"甲","乙"'));
});

test("登記離會：三份檔案同步、journal 記錄", async () => {
  const paths = makeFixture();
  const result = await registerDeparture({ name: "測試乙", confirmName: "測試乙", confirmedAt: "2026-07-19", note: "搬遷離會", by: "vp:測試" }, paths);
  assert.equal(result.remainingMembers, 1);
  const state = await listState(paths);
  assert.deepEqual(state.currentMembers.map((m) => m.name), ["測試丙"]);
  assert.ok(state.departed.some((d) => d.name === "測試乙" && d.note === "搬遷離會"));
  assert.ok(readFileSync(paths.memberDirectory, "utf8").includes('"測試丙"'));
  assert.ok(!readFileSync(paths.memberDirectory, "utf8").includes('"測試乙"'));
});

test("防呆：確認姓名不一致、未來日期、重複登記、非現任者全部阻擋", async () => {
  const paths = makeFixture();
  await assert.rejects(() => registerDeparture({ name: "測試乙", confirmName: "測試丙", confirmedAt: "2026-07-19", by: "vp:測試" }, paths), /確認姓名不一致/);
  const future = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
  await assert.rejects(() => registerDeparture({ name: "測試乙", confirmName: "測試乙", confirmedAt: future, by: "vp:測試" }, paths), /未來日期/);
  await assert.rejects(() => registerDeparture({ name: "測試甲", confirmName: "測試甲", confirmedAt: "2026-07-19", by: "vp:測試" }, paths), /已在離會名單|不在現任會員主檔/);
  await registerDeparture({ name: "測試乙", confirmName: "測試乙", confirmedAt: "2026-07-19", by: "vp:測試" }, paths);
  await assert.rejects(() => registerDeparture({ name: "測試乙", confirmName: "測試乙", confirmedAt: "2026-07-19", by: "vp:測試" }, paths), /重複登記/);
});

test("撤銷離會：還原主檔與專業別", async () => {
  const paths = makeFixture();
  await registerDeparture({ name: "測試乙", confirmName: "測試乙", confirmedAt: "2026-07-19", by: "vp:測試" }, paths);
  const result = await undoDeparture({ name: "測試乙", confirmName: "測試乙", by: "vp:測試" }, paths);
  assert.equal(result.professionRestored, true);
  const state = await listState(paths);
  assert.ok(state.currentMembers.some((m) => m.name === "測試乙" && m.profession === "測試業"));
  assert.equal(state.departed.length, 1);
  assert.ok(readFileSync(paths.memberDirectory, "utf8").includes('"測試乙"'));
});

console.log("member-departure tests passed");
