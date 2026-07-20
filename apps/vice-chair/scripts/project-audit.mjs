import { readdir, readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.cwd());
const hardErrors = [];
const warnings = [];
const notes = [];

async function exists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function rootFiles(extension) {
  return (await readdir(root))
    .filter((name) => name.endsWith(extension))
    .sort();
}

async function directoryFiles(relativeDirectory, extension) {
  const directory = path.join(root, relativeDirectory);
  return (await readdir(directory))
    .filter((name) => name.endsWith(extension))
    .sort()
    .map((name) => path.join(relativeDirectory, name));
}

function record(condition, message, bucket = hardErrors) {
  if (!condition) bucket.push(message);
}

async function checkAgentFiles() {
  const agents = await readFile(path.join(root, "AGENTS.md"), "utf8");
  const claude = await readFile(path.join(root, "CLAUDE.md"), "utf8");
  record(agents === claude, "AGENTS.md 與 CLAUDE.md 不一致");
}

async function checkCanonicalDocs() {
  for (const duplicate of ["requirements-draft.md", "decision-log.md"]) {
    record(
      !(await exists(path.join(root, duplicate))),
      `根目錄仍有重複規格文件：${duplicate}`
    );
  }

  for (const canonical of [
    "docs/requirements-draft.md",
    "docs/decision-log.md",
    "docs/AI_START_HERE.md",
    "docs/ARCHITECTURE_MAP.md",
    "docs/STORAGE_SCHEMA.md",
    "docs/REFACTOR_ROADMAP.md",
  ]) {
    record(await exists(path.join(root, canonical)), `缺少主文件：${canonical}`);
  }
}

async function checkManifest() {
  try {
    const manifest = JSON.parse(
      await readFile(path.join(root, "project-manifest.json"), "utf8")
    );
    record(
      manifest.schema === "fulian.project-manifest.v1",
      "project-manifest.json schema 不正確"
    );
    notes.push(`manifest：${manifest.schema}`);
  } catch (error) {
    hardErrors.push(`project-manifest.json 無法解析：${error.message}`);
  }
}

async function checkHtmlReferences() {
  const htmlFiles = await rootFiles(".html");
  const referencePattern = /<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g;

  for (const htmlFile of htmlFiles) {
    const html = await readFile(path.join(root, htmlFile), "utf8");
    for (const match of html.matchAll(referencePattern)) {
      const reference = match[1].split("?")[0].split("#")[0];
      if (
        !reference ||
        /^(?:https?:|data:|mailto:|javascript:)/.test(reference)
      ) {
        continue;
      }
      record(
        await exists(path.resolve(root, reference)),
        `${htmlFile} 引用不存在的檔案：${reference}`
      );
    }
  }

  notes.push(`HTML 頁面：${htmlFiles.length}`);
}

async function checkJavaScriptSyntax() {
  const files = [
    ...(await directoryFiles("assets/js", ".js")),
    ...(await directoryFiles("services", ".js")),
    ...(await directoryFiles("core", ".js")),
    ...(await rootFiles(".mjs")),
    "scripts/project-audit.mjs",
  ];

  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", path.join(root, file)], {
      encoding: "utf8",
    });
    if (result.status !== 0) {
      hardErrors.push(`${file} 語法錯誤：${result.stderr.trim()}`);
    }
  }

  notes.push(`JavaScript 語法檢查：${files.length} 檔`);
}

async function checkLineDensity() {
  for (const [directory, extension] of [
    ["assets/js", ".js"],
    ["assets/css", ".css"],
  ]) {
    for (const file of await directoryFiles(directory, extension)) {
      const content = await readFile(path.join(root, file), "utf8");
      const lines = content.split(/\r?\n/).length;
      if (content.length > 1000 && lines <= 5) {
        warnings.push(`${file} 為高密度單行檔，建議格式化`);
      }
    }
  }
}

async function checkCaseDomainOrder() {
  const consumers = {
    "index.html": ["work-planner.js", "notification-center.js"],
    "case-board.html": ["case-board.js"],
    "case-workflow.html": ["case-workflow.js"],
    "terminal-form.html": ["services/case-files.js", "terminal-form.js"],
    "midterm-form.html": ["services/case-files.js", "midterm-form.js"],
    "new-member-form.html": ["services/case-files.js", "new-member-form.js"],
    "industry-change-form.html": ["services/case-files.js", "industry-change-form.js"],
    "departure-form.html": ["services/case-files.js", "departure-form.js"],
  };

  for (const [htmlFile, scripts] of Object.entries(consumers)) {
    const html = await readFile(path.join(root, htmlFile), "utf8");
    const domainIndex = html.indexOf("core/case-domain.js");
    record(domainIndex >= 0, `${htmlFile} 未載入 core/case-domain.js`);
    for (const script of scripts) {
      const consumerIndex = html.indexOf(script);
      record(
        domainIndex >= 0 && consumerIndex > domainIndex,
        `${htmlFile} 必須先載入 case-domain 再載入 ${script}`
      );
    }
  }
}

await checkAgentFiles();
await checkCanonicalDocs();
await checkManifest();
await checkHtmlReferences();
await checkJavaScriptSyntax();
await checkLineDensity();
await checkCaseDomainOrder();

console.log("富聯副主席系統｜專案健檢");
for (const note of notes) console.log(`PASS  ${note}`);
for (const warning of warnings) console.log(`WARN  ${warning}`);
for (const error of hardErrors) console.log(`FAIL  ${error}`);
console.log(
  `結果：${hardErrors.length} 個錯誤，${warnings.length} 個改善提醒`
);

if (hardErrors.length) process.exitCode = 1;
