#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const changelogPaths = Object.freeze({
  "vice-chair": path.join(projectRoot, "apps/vice-chair/CHANGELOG.md"),
  "bni-analysis": path.join(projectRoot, "apps/bni-analysis/CHANGELOG.md"),
});

function findLevelTwoHeadings(source) {
  const headings = [];
  let cursor = 0;
  let fence = null;

  while (cursor < source.length) {
    const newline = source.indexOf("\n", cursor);
    const end = newline === -1 ? source.length : newline + 1;
    const line = source.slice(cursor, newline === -1 ? source.length : newline).replace(/\r$/, "");
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);

    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) {
        fence = { character: marker[0], length: marker.length };
      } else if (marker[0] === fence.character && marker.length >= fence.length) {
        fence = null;
      }
    } else if (!fence && /^##[ \t]+.+$/.test(line)) {
      headings.push({ offset: cursor, heading: line });
    }

    cursor = end;
  }

  return headings;
}

export function parseChangelog(source) {
  if (typeof source !== "string") throw new TypeError("CHANGELOG 內容必須是字串");

  const headings = findLevelTwoHeadings(source);
  const entries = headings.map((item, index) => ({
    index,
    heading: item.heading,
    raw: source.slice(item.offset, headings[index + 1]?.offset ?? source.length),
  }));

  return {
    intro: source.slice(0, headings[0]?.offset ?? source.length),
    entries,
  };
}

function normalizeTerms(terms = []) {
  return terms
    .map((term) => String(term).trim().toLocaleLowerCase("zh-TW"))
    .filter(Boolean);
}

export function selectChangelogEntries(
  entries,
  { recent = 0, requiredTerms = [], anyTerms = [] } = {}
) {
  const required = normalizeTerms(requiredTerms);
  const any = normalizeTerms(anyTerms);
  const hasQuery = required.length > 0 || any.length > 0;
  const queryMatches = hasQuery
    ? entries.filter((entry) => {
        const content = entry.raw.toLocaleLowerCase("zh-TW");
        return (
          required.every((term) => content.includes(term)) &&
          (any.length === 0 || any.some((term) => content.includes(term)))
        );
      })
    : [];

  const selectedIndexes = new Set();
  for (let index = 0; index < Math.min(recent, entries.length); index += 1) {
    selectedIndexes.add(index);
  }
  for (const entry of queryMatches) selectedIndexes.add(entry.index);

  return {
    hasQuery,
    queryMatches,
    selected: entries.filter((entry) => selectedIndexes.has(entry.index)),
  };
}

export function buildChangelogContext(
  source,
  {
    sourceLabel = "CHANGELOG.md",
    includeHeadings = false,
    recent = 0,
    requiredTerms = [],
    anyTerms = [],
  } = {}
) {
  const parsed = parseChangelog(source);
  const selection = selectChangelogEntries(parsed.entries, {
    recent,
    requiredTerms,
    anyTerms,
  });
  const showHeadings = includeHeadings || (selection.hasQuery && selection.queryMatches.length === 0);
  const headingsText = showHeadings
    ? `${parsed.entries.map((entry) => entry.heading).join("\n")}\n`
    : "";
  const entriesText = selection.selected.map((entry) => entry.raw).join("");
  const contextCharacters = parsed.intro.length + headingsText.length + entriesText.length;
  const reduction = source.length
    ? Math.max(0, (1 - contextCharacters / source.length) * 100)
    : 0;
  const summary = [
    `來源：${sourceLabel}`,
    `完整紀錄：${parsed.entries.length} 筆、${source.length} 字元`,
    `本次脈絡：${selection.selected.length} 筆完整條目、索引與條目共 ${contextCharacters} 字元，較整份少 ${reduction.toFixed(1)}%`,
  ];

  if (selection.hasQuery) {
    summary.push(`查詢命中：${selection.queryMatches.length} 筆`);
  }
  if (selection.hasQuery && selection.queryMatches.length === 0) {
    summary.push("警告：查詢沒有命中；已列出全部標題，請更換關鍵字或在高風險任務使用 --all。");
  }

  const blocks = [summary.join("\n")];
  if (parsed.intro) blocks.push(parsed.intro.trimEnd());
  if (showHeadings) blocks.push(`# CHANGELOG 條目索引\n\n${headingsText.trimEnd()}`);
  if (entriesText) blocks.push(`# 完整選取條目\n\n${entriesText.trimEnd()}`);

  return {
    text: `${blocks.join("\n\n")}\n`,
    noQueryMatch: selection.hasQuery && selection.queryMatches.length === 0,
    stats: {
      totalEntries: parsed.entries.length,
      selectedEntries: selection.selected.length,
      queryMatches: selection.queryMatches.length,
      sourceCharacters: source.length,
      contextCharacters,
      reductionPercent: reduction,
    },
  };
}

function usage() {
  return `CHANGELOG 分層讀取工具（唯讀、不連線）

用法：
  node scripts/changelog-context.mjs --app <vice-chair|bni-analysis> [選項]

選項：
  --headings          列出全部二級標題，作為低 token 索引
  --recent <數量>     輸出最近 N 筆完整條目
  --search <文字>     必須包含的文字；可重複，重複時全部都要命中
  --any <文字>        任一命中即可的文字；可重複，可與 --search 合用
  --all               原樣輸出完整 CHANGELOG；不可與其他選取選項合用
  --help              顯示說明

範例：
  node scripts/changelog-context.mjs --app vice-chair --headings --recent 8
  node scripts/changelog-context.mjs --app vice-chair --headings --recent 8 --search LINE --search Reply
  node scripts/changelog-context.mjs --app vice-chair --any 投票 --any vote
`;
}

function takeValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} 缺少值`);
  return value;
}

export function parseCliArguments(argv) {
  const options = {
    app: null,
    includeHeadings: false,
    recent: 0,
    requiredTerms: [],
    anyTerms: [],
    all: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--app") {
      options.app = takeValue(argv, index, argument);
      index += 1;
    } else if (argument === "--headings") {
      options.includeHeadings = true;
    } else if (argument === "--recent") {
      const value = takeValue(argv, index, argument);
      if (!/^\d+$/.test(value) || Number(value) < 1) {
        throw new Error("--recent 必須是大於 0 的整數");
      }
      options.recent = Number(value);
      index += 1;
    } else if (argument === "--search") {
      options.requiredTerms.push(takeValue(argv, index, argument));
      index += 1;
    } else if (argument === "--any") {
      options.anyTerms.push(takeValue(argv, index, argument));
      index += 1;
    } else if (argument === "--all") {
      options.all = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`未知選項：${argument}`);
    }
  }

  if (options.help) return options;
  if (!Object.hasOwn(changelogPaths, options.app)) {
    throw new Error("--app 必須是 vice-chair 或 bni-analysis");
  }

  const hasSelection =
    options.includeHeadings ||
    options.recent > 0 ||
    options.requiredTerms.length > 0 ||
    options.anyTerms.length > 0;
  if (options.all && hasSelection) throw new Error("--all 不可與其他選取選項合用");
  if (!options.all && !hasSelection) {
    throw new Error("請至少使用 --headings、--recent、--search、--any 或 --all 其中一項");
  }

  return options;
}

async function main(argv) {
  const options = parseCliArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const changelogPath = changelogPaths[options.app];
  const source = await readFile(changelogPath, "utf8");
  if (options.all) {
    process.stdout.write(source);
    return;
  }

  const result = buildChangelogContext(source, {
    sourceLabel: path.relative(projectRoot, changelogPath),
    includeHeadings: options.includeHeadings,
    recent: options.recent,
    requiredTerms: options.requiredTerms,
    anyTerms: options.anyTerms,
  });
  process.stdout.write(result.text);
  if (result.noQueryMatch) process.exitCode = 2;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`錯誤：${error.message}\n\n${usage()}`);
    process.exitCode = 1;
  });
}
