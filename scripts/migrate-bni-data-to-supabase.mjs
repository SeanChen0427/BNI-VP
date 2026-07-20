import {createHash} from "node:crypto";
import {homedir} from "node:os";
import path from "node:path";
import {readFile,readdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {buildBniAnalysisSnapshot,parsePalmsReport} from "../apps/vice-chair/bni-bridge.mjs";
import {parseAuditWeekText} from "../apps/bni-analysis/engine/audit.mjs";

const projectUrl="https://fahrblkukuhgveiptufn.supabase.co";
const publishableKey="sb_publishable_f5U5bDJjXjvRxYSzh7zqGQ__lF-jwPZ";
const repositoryRoot=fileURLToPath(new URL("..",import.meta.url));
const bniRoot=path.join(repositoryRoot,"apps","bni-analysis");
const credentialPath=process.env.FULIAN_BOOTSTRAP_CREDENTIALS
  ||path.join(homedir(),"Library","Application Support","Fulian VP System","supabase-bootstrap-credentials.txt");

function sha256(buffer){return createHash("sha256").update(buffer).digest("hex")}
function storagePath(relative){return`imports/2026-07-20/${relative.split(path.sep).map(encodeURIComponent).join("/")}`}
function reportType(relative){
  if(relative.includes("/audit/")||relative.startsWith("audit/"))return"audit";
  if(relative.includes("membership-expiry"))return"membership";
  if(relative.includes("tenure"))return"tenure";
  if(relative.startsWith("monthly/"))return"monthly_palms";
  if(relative.includes("palms"))return"half_year_palms";
  return"other";
}
function attendanceCountList(map){
  return[...map].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"zh-Hant"))
    .map(([name,count])=>`${name}（${count}次）`).join("、");
}
function monthlyAttendance(report,currentNames,source){
  const members=report.members.filter(member=>currentNames.has(member.name));
  const absence=new Map(),late=new Map(),proxy=new Map();
  let absenceActual=0,lateActual=0,proxyActual=0;
  const add=(map,name,count)=>map.set(name,(map.get(name)||0)+count);
  for(const member of members){
    const metrics=member.metrics||{};
    if(metrics.absence){absenceActual+=metrics.absence;add(absence,member.name,metrics.absence)}
    if(metrics.late){lateActual+=metrics.late;add(late,member.name,metrics.late)}
    if(metrics.substitutes){proxyActual+=metrics.substitutes;add(proxy,member.name,metrics.substitutes)}
  }
  const month=report.periodStart.slice(0,7);
  return{
    month,memberCount:members.length,absenceActual,absenceList:attendanceCountList(absence),
    lateActual,lateList:attendanceCountList(late),proxyActual,proxyList:attendanceCountList(proxy),
    periodStart:report.periodStart,periodEnd:report.periodEnd,
    source:`BNI Connect 單月 PALMS｜${source}`,fetchedAt:new Date().toISOString()
  };
}

const credentials=await readFile(credentialPath,"utf8");
const admin=credentials.match(/\(admin\)\s+Email:\s*(\S+)\s+Password:\s*(\S+)/);
if(!admin)throw new Error("找不到 Supabase Admin 初始憑證");
const tokenResponse=await fetch(`${projectUrl}/auth/v1/token?grant_type=password`,{
  method:"POST",
  headers:{apikey:publishableKey,"content-type":"application/json"},
  body:JSON.stringify({email:admin[1],password:admin[2]})
});
const token=await tokenResponse.json();
if(!tokenResponse.ok)throw new Error(`Supabase Admin 登入失敗：${tokenResponse.status}`);
const headers={apikey:publishableKey,Authorization:`Bearer ${token.access_token}`};

async function rest(resource,{method="GET",body,prefer}={}){
  const response=await fetch(`${projectUrl}/rest/v1/${resource}`,{
    method,
    headers:{...headers,"content-type":"application/json",...(prefer?{Prefer:prefer}:{})},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(`${method} ${resource} 失敗：${response.status} ${JSON.stringify(data)}`);
  return data;
}

const snapshot=await buildBniAnalysisSnapshot({bniRoot});
snapshot.source.path="apps/bni-analysis/index.html";
const currentNames=new Set(snapshot.members.map(member=>member.name));
const monthlyFiles=(await readdir(path.join(bniRoot,"data","monthly"))).filter(name=>name.endsWith(".xls"));
snapshot.monthlyAttendance={};
for(const name of monthlyFiles){
  const report=parsePalmsReport(await readFile(path.join(bniRoot,"data","monthly",name),"utf8"));
  const attendance=monthlyAttendance(report,currentNames,`data/monthly/${name}`);
  snapshot.monthlyAttendance[attendance.month]=attendance;
}

const peoplePayload=snapshot.members.map(member=>({display_name:member.name,status:"active"}));
const people=await rest("people?on_conflict=display_name",{
  method:"POST",body:peoplePayload,prefer:"resolution=merge-duplicates,return=representation"
});
const peopleByName=new Map(people.map(person=>[person.display_name,person]));
const membersPayload=snapshot.members.map(member=>({
  person_id:peopleByName.get(member.name).id,
  profession:member.profession||"",
  membership_started_on:member.activation||null,
  membership_expires_on:member.expiryDate||null,
  status:"active"
}));
await rest("members?on_conflict=person_id",{
  method:"POST",body:membersPayload,prefer:"resolution=merge-duplicates,return=minimal"
});

const period=snapshot.memberData.metricsPeriod;
const fingerprint=snapshot.source.fingerprint;
const existing=await rest(`analysis_snapshots?source_fingerprint=eq.${encodeURIComponent(fingerprint)}&period_end=eq.${period.end}&select=id&limit=1`);
const leaderId=null;
const snapshotRow={
  schema_version:snapshot.schema,
  analysis_version:`${period.end}-published-v1`,
  period_start:period.start,
  period_end:period.end,
  generated_at:snapshot.generatedAt,
  source_version:`bni-dashboard:${fingerprint}`,
  source_fingerprint:fingerprint,
  member_count:snapshot.members.length,
  reconciliation:{expected:snapshot.members.length,actual:snapshot.members.length,matched:true},
  snapshot,
  is_published:true,
  published_at:new Date().toISOString(),
  published_by:leaderId
};
let snapshotId;
if(existing[0]){
  snapshotId=existing[0].id;
  await rest(`analysis_snapshots?id=eq.${snapshotId}`,{method:"PATCH",body:snapshotRow,prefer:"return=minimal"});
}else{
  const inserted=await rest("analysis_snapshots",{method:"POST",body:snapshotRow,prefer:"return=representation"});
  snapshotId=inserted[0].id;
}

async function allXls(directory,base=directory){
  const result=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const absolute=path.join(directory,entry.name);
    if(entry.isDirectory())result.push(...await allXls(absolute,base));
    else if(entry.name.toLowerCase().endsWith(".xls"))result.push({absolute,relative:path.relative(base,absolute)});
  }
  return result;
}

const files=await allXls(path.join(bniRoot,"data"));
const importRows=[];
for(const file of files){
  const buffer=await readFile(file.absolute),objectPath=storagePath(file.relative);
  const upload=await fetch(`${projectUrl}/storage/v1/object/raw-reports/${objectPath}`,{
    method:"POST",
    headers:{...headers,"content-type":"application/vnd.ms-excel","x-upsert":"true"},
    body:buffer
  });
  if(!upload.ok)throw new Error(`Private Storage 上傳失敗：${file.relative} ${upload.status} ${await upload.text()}`);
  let report=null;
  try{
    if(reportType(file.relative)==="audit"){
      const audit=parseAuditWeekText(buffer.toString("utf8"),file.relative);
      report=audit.week?{periodStart:audit.week,periodEnd:audit.week}:null;
    }else report=parsePalmsReport(buffer.toString("utf8"));
  }catch{}
  importRows.push({
    report_type:reportType(file.relative),
    period_start:report?.periodStart||null,
    period_end:report?.periodEnd||null,
    storage_bucket:"raw-reports",
    storage_path:decodeURIComponent(objectPath),
    sha256:sha256(buffer),
    analysis_snapshot_id:snapshotId,
    metadata:{originalPath:`apps/bni-analysis/data/${file.relative}`,migratedAt:new Date().toISOString()}
  });
}
await rest("report_imports?on_conflict=storage_bucket,storage_path",{
  method:"POST",body:importRows,prefer:"resolution=merge-duplicates,return=minimal"
});

console.log(JSON.stringify({
  people:peoplePayload.length,
  members:membersPayload.length,
  analysisSnapshotId:snapshotId,
  analysisPeriod:period,
  rawReports:files.length,
  monthlyAttendance:Object.keys(snapshot.monthlyAttendance)
}));
