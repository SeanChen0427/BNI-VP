import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { rawReportObjectPath } from "../../../supabase/functions/app-api/storage-object-key.mjs";

const HASH = "a".repeat(64);

test("PALMS Storage key 只使用 Supabase 相容的 ASCII 字元", () => {
  const path = rawReportObjectPath({
    month: "2026-07",
    type: "monthly",
    index: 0,
    createdAt: 1785771363406,
    sha256: HASH,
  });

  assert.equal(path, "monthly-data/2026-07/monthly/1785771363406-0-aaaaaaaaaaaaaaaa.xls");
  assert.match(path, /^[A-Za-z0-9/_-]+\.xls$/);
  assert.doesNotMatch(path, /[\u0080-\uFFFF]/u);
});

test("PALMS Storage key 拒絕不合法的月份、類型與雜湊", () => {
  const base = { month: "2026-07", type: "monthly", index: 0, createdAt: 1785771363406, sha256: HASH };
  assert.throws(() => rawReportObjectPath({ ...base, month: "2026-7" }), /月份/);
  assert.throws(() => rawReportObjectPath({ ...base, type: "unknown" }), /類型/);
  assert.throws(() => rawReportObjectPath({ ...base, sha256: "不是雜湊" }), /雜湊/);
});

test("原始中文檔名只保存於 metadata，不再組入 Storage key", async () => {
  const source = await readFile(new URL("../../../supabase/functions/app-api/index.ts", import.meta.url), "utf8");
  assert.match(source, /metadata: \{ category: body\.type, originalFilename: file\.name/);
  assert.match(source, /rawReportObjectPath\(\{/);
  assert.doesNotMatch(source, /const safeName =/);
});
