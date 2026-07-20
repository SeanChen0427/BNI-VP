import {readFile,stat} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const required=[
  "apps/vice-chair/index.html",
  "apps/vice-chair/preview-server.mjs",
  "apps/vice-chair/bni-bridge.mjs",
  "apps/bni-analysis/index.html",
  "apps/bni-analysis/data/baseline/palms.xls",
  "apps/bni-analysis/data/reference/current-members.json",
  "docs/ARCHITECTURE.md",
  "project-manifest.json"
];
const failures=[];

for(const relative of required){
  try{if(!(await stat(path.join(root,relative))).isFile())failures.push(`不是檔案：${relative}`)}
  catch{failures.push(`缺少：${relative}`)}
}

const agents=await readFile(path.join(root,"AGENTS.md"),"utf8");
const claude=await readFile(path.join(root,"CLAUDE.md"),"utf8");
if(agents!==claude)failures.push("根目錄 AGENTS.md 與 CLAUDE.md 不一致");

const bridge=await readFile(path.join(root,"apps/vice-chair/bni-bridge.mjs"),"utf8");
if(!bridge.includes("../bni-analysis/"))failures.push("BNI 橋接未指向整合專案內的分析工具");

const viceAudit=spawnSync(process.execPath,["scripts/project-audit.mjs"],{
  cwd:path.join(root,"apps/vice-chair"),
  encoding:"utf8"
});
process.stdout.write(viceAudit.stdout);
if(viceAudit.status!==0){
  process.stderr.write(viceAudit.stderr);
  failures.push("副主席工作台健檢失敗");
}

console.log("\n富聯整合專案｜跨模組健檢");
for(const relative of required)console.log(`PASS  ${relative}`);
for(const failure of failures)console.log(`FAIL  ${failure}`);
console.log(`結果：${failures.length} 個錯誤`);
if(failures.length)process.exitCode=1;
