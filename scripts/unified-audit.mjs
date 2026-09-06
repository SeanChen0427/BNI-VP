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
  "apps/bni-analysis/README.md",
  "apps/bni-analysis/data/baseline/palms.xls",
  "apps/bni-analysis/data/reference/current-members.json",
  "docs/ARCHITECTURE.md",
  "project-manifest.json",
  "apps/vice-chair/CHANGELOG.md",
  "apps/vice-chair/docs/decision-log.md",
  "apps/vice-chair/docs/DEPLOYMENT_LOG_2026-07-20.md",
  "apps/vice-chair/docs/DEPLOYMENT_LOG_2026-08-08_LINE_BOT.md",
  "apps/vice-chair/docs/DEPLOYMENT_LOG_2026-08-19_LINE_BOT_SPLIT.md",
  "apps/vice-chair/docs/DEPLOYMENT_LOG_2026-09-04_ANNUAL_HANDOVER.md",
  "apps/vice-chair/docs/DEPLOYMENT_LOG_2026-09-04_COMMITTEE_TERM_PERMISSIONS.md",
  "apps/vice-chair/docs/DEPLOYMENT_LOG_2026-09-04_COMMITTEE_WORK_DIGEST_REPLY.md",
  "apps/vice-chair/docs/DEPLOYMENT_LOG_2026-09-04_LINE_REPLY_DRIVEN_REMINDERS.md",
  "apps/vice-chair/docs/DEPLOYMENT_LOG_2026-09-04_TAIPEI_TIME.md",
  "apps/vice-chair/docs/PROJECT_AUDIT_2026-07-16.md",
  "apps/vice-chair/docs/reviews/CODE_REVIEW_2026-07-16.md"
];
const failures=[];

const currentDocuments=[
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "docs/ARCHITECTURE.md",
  "apps/bni-analysis/README.md",
  "apps/vice-chair/AGENTS.md",
  "apps/vice-chair/CLAUDE.md",
  "apps/vice-chair/README.md",
  "apps/vice-chair/docs/AI_START_HERE.md",
  "apps/vice-chair/docs/ARCHITECTURE_MAP.md",
  "apps/vice-chair/docs/HANDOFF.md",
  "apps/vice-chair/docs/OPEN_QUESTIONS.md",
  "apps/vice-chair/docs/REFACTOR_ROADMAP.md",
  "apps/vice-chair/docs/STORAGE_SCHEMA.md",
  "apps/vice-chair/docs/accountability-email-workflow.md",
  "apps/vice-chair/docs/architecture-hosting-security.md",
  "apps/vice-chair/docs/email-templates.md",
  "apps/vice-chair/docs/forms/interview-forms.md",
  "apps/vice-chair/docs/line-quota-architecture.md",
  "apps/vice-chair/docs/line-templates.md",
  "apps/vice-chair/docs/meeting-scripts.md",
  "apps/vice-chair/docs/monthly-committee-meeting.md",
  "apps/vice-chair/docs/onboarding-course.md",
  "apps/vice-chair/docs/release-version-policy.md",
  "apps/vice-chair/docs/requirements-draft.md",
  "apps/vice-chair/docs/system-operation-guide.md",
  "apps/vice-chair/docs/task-management.md",
  "apps/vice-chair/docs/voting-rules.md",
  "apps/vice-chair/docs/workflows.md"
];

const supersededCurrentClaims=[
  "正式 Supabase 後端尚未建立",
  "尚未初始化 Git repository",
  "尚未建立 Git repository",
  "仍待建立／連接 repository",
  "多數案件與表單資料仍待由瀏覽器本機儲存遷移",
  "正式跨裝置使用時，月會 API 的資料層應改接 Supabase",
  "優先級：上線前必要",
  "狀態：本次開始執行",
  "第一階段只完成 Key 綁定",
  "SaaS 的實際技術架構、網域、帳號持有人與維運責任",
  "未來若改用系統內投票",
  "可先使用外部表單連結投票",
  "存放於 `BNI/data/monthly/`",
  "在瀏覽器工作資料中建立或更新正式工作排定",
  "狀態：需求蒐集中"
];

for(const relative of required){
  try{if(!(await stat(path.join(root,relative))).isFile())failures.push(`不是檔案：${relative}`)}
  catch{failures.push(`缺少：${relative}`)}
}

const agents=await readFile(path.join(root,"AGENTS.md"),"utf8");
const claude=await readFile(path.join(root,"CLAUDE.md"),"utf8");
if(agents!==claude)failures.push("根目錄 AGENTS.md 與 CLAUDE.md 不一致");

async function checkDocumentationGovernance(){
  let rootManifest;
  let viceManifest;
  try{
    rootManifest=JSON.parse(await readFile(path.join(root,"project-manifest.json"),"utf8"));
    viceManifest=JSON.parse(await readFile(path.join(root,"apps/vice-chair/project-manifest.json"),"utf8"));
  }catch(error){
    failures.push(`現況 manifest 無法解析：${error.message}`);
    return;
  }

  if(rootManifest.schema!=="fulian.unified-project.v1")failures.push("根目錄 manifest schema 不正確");
  if(viceManifest.schema!=="fulian.project-manifest.v1")failures.push("工作台 manifest schema 不正確");
  if(rootManifest.runtime?.formalBackend!==true)failures.push("根目錄 manifest 未標示正式後端已啟用");
  if(viceManifest.runtime?.formalBackend!==true)failures.push("工作台 manifest 未標示正式後端已啟用");
  if(rootManifest.runtime?.formalBackendProvider!=="Supabase")failures.push("根目錄 manifest 的正式後端不是 Supabase");
  if(viceManifest.runtime?.formalBackendProvider!=="Supabase")failures.push("工作台 manifest 的正式後端不是 Supabase");
  if(rootManifest.runtime?.productionUrl!==viceManifest.runtime?.productionUrl)failures.push("兩份 manifest 的正式網址不一致");

  for(const [label,manifest] of [["根目錄",rootManifest],["工作台",viceManifest]]){
    if(!manifest.dataContinuity?.formalOperationalSource)failures.push(`${label} manifest 缺少正式資料來源`);
    if(!manifest.dataContinuity?.localDataRole)failures.push(`${label} manifest 缺少本機復原資料角色`);
    if(!manifest.dataContinuity?.consistencyRule)failures.push(`${label} manifest 缺少本機／線上一致性規則`);
    if(!manifest.dataContinuity?.historyRule)failures.push(`${label} manifest 缺少歷史保留規則`);
  }

  for(const relative of currentDocuments){
    let content;
    try{content=await readFile(path.join(root,relative),"utf8")}
    catch{failures.push(`缺少現況文件：${relative}`);continue}
    for(const claim of supersededCurrentClaims){
      if(content.includes(claim))failures.push(`現況文件仍含已失效敘述：${relative} → ${claim}`);
    }
  }
}

await checkDocumentationGovernance();

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
