import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildChangelogContext,
  parseChangelog,
  selectChangelogEntries,
} from "../../../scripts/changelog-context.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const scriptPath = path.join(projectRoot, "scripts/changelog-context.mjs");
const viceChangelogPath = path.join(projectRoot, "apps/vice-chair/CHANGELOG.md");

test("解析時保留每一筆完整原文，且不把程式碼區塊中的 ## 當成條目", () => {
  const source = [
    "# 變更紀錄\n\n",
    "## 2026-09-04｜第一筆\n\n內容 A\n\n",
    "```md\n## 這不是條目\n```\n\n",
    "## 2026-09-03｜第二筆\n\n內容 B\n",
  ].join("");
  const parsed = parseChangelog(source);

  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.entries[0].heading, "## 2026-09-04｜第一筆");
  assert.match(parsed.entries[0].raw, /## 這不是條目/);
  assert.equal(parsed.entries.map((entry) => entry.raw).join(""), source.slice(parsed.intro.length));
});

test("近期與查詢結果取聯集、去重，並維持原本的新到舊順序", () => {
  const parsed = parseChangelog(
    "# Log\n\n## A\nLINE Reply\n\n## B\n其他\n\n## C\nLINE Reply 舊版\n"
  );
  const result = selectChangelogEntries(parsed.entries, {
    recent: 2,
    requiredTerms: ["LINE", "Reply"],
  });

  assert.deepEqual(result.selected.map((entry) => entry.heading), ["## A", "## B", "## C"]);
  assert.equal(result.queryMatches.length, 2);
});

test("分層輸出包含完整標題索引與完整命中條目，並回報實際字元縮減", async () => {
  const source = await readFile(viceChangelogPath, "utf8");
  const result = buildChangelogContext(source, {
    sourceLabel: "apps/vice-chair/CHANGELOG.md",
    includeHeadings: true,
    recent: 8,
    requiredTerms: ["LINE", "Reply"],
  });
  const parsed = parseChangelog(source);
  const expected = selectChangelogEntries(parsed.entries, {
    recent: 8,
    requiredTerms: ["LINE", "Reply"],
  });

  for (const entry of expected.selected) assert.ok(result.text.includes(entry.raw.trimEnd()));
  assert.equal(result.stats.selectedEntries, expected.selected.length);
  assert.equal(result.stats.sourceCharacters, source.length);
  assert.equal(
    result.stats.reductionPercent,
    Math.max(0, (1 - result.stats.contextCharacters / source.length) * 100)
  );
});

test("分層輸出保留原始檔案前言與讀寫規則", async () => {
  const source = await readFile(path.join(projectRoot, "apps/bni-analysis/CHANGELOG.md"), "utf8");
  const result = buildChangelogContext(source, { includeHeadings: true, recent: 1 });

  assert.match(result.text, /# 專案變更日誌/);
  assert.match(result.text, /每次對規格、計分規則、資料檔的變更/);
});

test("--all 原樣輸出完整檔案，沒有摘要、前綴或遺失", async () => {
  const source = await readFile(viceChangelogPath, "utf8");
  const output = execFileSync(
    process.execPath,
    [scriptPath, "--app", "vice-chair", "--all"],
    { cwd: projectRoot, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 }
  );

  assert.equal(output, source);
});

test("查詢零命中時列出完整標題索引並以非零狀態提醒擴大搜尋", () => {
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--app", "vice-chair", "--search", "不存在的唯一詞-9f97c6"],
    { cwd: projectRoot, encoding: "utf8" }
  );

  assert.equal(result.status, 2);
  assert.match(result.stdout, /警告：查詢沒有命中/);
  assert.match(result.stdout, /# CHANGELOG 條目索引/);
  assert.equal(result.stderr, "");
});

async function collectRuntimeSources(directory) {
  const ignoredDirectories = new Set(["archive", "docs", "node_modules", "scripts", "tests"]);
  const sourceExtensions = new Set([".html", ".js", ".mjs", ".ts"]);
  const groups = await Promise.all((await readdir(directory, { withFileTypes: true })).map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : collectRuntimeSources(entryPath);
    }
    return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
  }));
  return groups.flat();
}

test("CHANGELOG 工具沒有進入工作台或分析核心的正式執行路徑", async () => {
  const runtimeFiles = [
    ...await collectRuntimeSources(path.join(projectRoot, "apps/vice-chair")),
    ...await collectRuntimeSources(path.join(projectRoot, "apps/bni-analysis")),
  ];

  const runtimeContents = await Promise.all(runtimeFiles.map((file) => readFile(file, "utf8")));
  for (const [index, content] of runtimeContents.entries()) {
    const file = runtimeFiles[index];
    assert.equal(
      content.includes("changelog-context.mjs"),
      false,
      `${path.relative(projectRoot, file)} 不得載入開發用 CHANGELOG 工具`
    );
  }
});
