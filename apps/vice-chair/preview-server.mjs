import http from "node:http";
import {readFile,writeFile,stat,mkdir,chmod,readdir} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import {buildBniAnalysisSnapshot,parsePalmsReport} from "./bni-bridge.mjs";
import {analysisDraftApi,analysisSnapshotsApi} from "./services/analysis-draft.mjs";
import {memberDepartureApi} from "./services/member-departure.mjs";

const require=createRequire(import.meta.url),monthlyMeetingDomain=require("./core/monthly-meeting-domain.js");
const{splitKnowledgeDocument,selectKnowledge,sanitizeAiAnswer}=require("./core/ai-knowledge-domain.js");
const ROOT=path.dirname(fileURLToPath(import.meta.url)),ANALYSIS_ROOT=path.resolve(ROOT,"..","bni-analysis"),PORT=Number(process.argv[2]||4173);
const AI_HOME=path.join(os.homedir(),"Library","Application Support","Fulian VP System"),AI_KEY_FILE=path.join(AI_HOME,"local-master.key"),AI_STORE_FILE=path.join(AI_HOME,"ai-credentials.enc"),MEETING_STORE_FILE=path.join(AI_HOME,"committee-meetings.json"),AI_PROVIDERS=["openai","gemini","anthropic"];
const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml",".docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document"};
const AI_MODELS={openai:"gpt-5.6-luna",gemini:["gemini-3.5-flash","gemini-3.1-flash-lite","gemini-2.5-flash"],anthropic:"claude-sonnet-5"};
const AI_KNOWLEDGE_FILES=["docs/HANDOFF.md","docs/decision-log.md","docs/workflows.md","docs/voting-rules.md","docs/meeting-scripts.md","docs/task-management.md","docs/forms/interview-forms.md","docs/policies/member-rules-v9.1.md","docs/policies/public-bni-reference-2026.md","docs/policies/renewal-review.md","docs/policies/321a-review.md","docs/email-templates.md","docs/line-templates.md","docs/architecture-hosting-security.md"];
const aiRequestTimes=new Map();
function json(res,status,body){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(body))}
function localHostname(value=""){return["127.0.0.1","localhost","::1","[::1]"].includes(String(value).toLowerCase())}
// FULIAN_LAN=1 時額外信任私有網段（同 Wi-Fi 手機測試用）。僅限私有 IP，公開隧道與外網仍一律拒絕。
const LAN_MODE=process.env.FULIAN_LAN==="1";
function privateHostname(value=""){return /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(String(value))}
function trustedHostname(value=""){return localHostname(value)||(LAN_MODE&&privateHostname(value))}
function hostName(value=""){try{return new URL(`http://${value}`).hostname}catch{return""}}
function trustedLocalRequest(req){
  if(!trustedHostname(hostName(req.headers.host||"")))return false;
  const origin=req.headers.origin;
  if(origin){try{if(!trustedHostname(new URL(origin).hostname))return false}catch{return false}}
  return true;
}
function rocDateToIso(value=""){const digits=String(value).replace(/\D/g,"");if(digits.length!==7)return"";const year=Number(digits.slice(0,3))+1911,month=digits.slice(3,5),day=digits.slice(5,7);return`${year}-${month}-${day}`}
async function companyLookup(url,res){const taxId=(url.searchParams.get("taxId")||"").replace(/\D/g,"");if(!/^\d{8}$/.test(taxId))return json(res,400,{found:false,message:"統編必須為8碼數字"});const endpoint=new URL("https://data.gcis.nat.gov.tw/od/data/api/5F64D864-61CB-4D0D-8AD9-492047CC1EA6");endpoint.searchParams.set("$format","json");endpoint.searchParams.set("$filter",`Business_Accounting_NO eq ${taxId}`);try{const response=await fetch(endpoint,{headers:{accept:"application/json","user-agent":"Fulian-Membership-Committee-Prototype/1.0"}});if(!response.ok)throw new Error(`官方服務回應 ${response.status}`);const rows=await response.json(),company=rows[0];if(!company)return json(res,404,{found:false,message:"查無公司登記資料；若為商號或行號請先手動填寫"});return json(res,200,{found:true,name:company.Company_Name||"",capital:company.Capital_Stock_Amount||"",setupDate:rocDateToIso(company.Company_Setup_Date),status:company.Company_Status_Desc||"",source:"經濟部商業發展署商工行政資料開放平臺"})}catch(error){return json(res,502,{found:false,message:`官方公司資料暫時無法查詢：${error.message}`})}}
async function bniAnalysis(res){try{return json(res,200,await buildBniAnalysisSnapshot({bniRoot:bniRoot()}))}catch(error){return json(res,503,{schema:"fulian.bni-analysis.v1",available:false,message:"BNI 分析工具目前無法讀取",detail:error.message})}}
async function requestBody(req){let body="";for await(const chunk of req){body+=chunk;if(body.length>65536)throw new Error("請求內容過大")}return body?JSON.parse(body):{}}
async function masterKey(){
  await mkdir(AI_HOME,{recursive:true,mode:0o700});await chmod(AI_HOME,0o700).catch(()=>{});
  try{return Buffer.from((await readFile(AI_KEY_FILE,"utf8")).trim(),"base64")}catch{
    const key=randomBytes(32);await writeFile(AI_KEY_FILE,key.toString("base64"),{mode:0o600});await chmod(AI_KEY_FILE,0o600).catch(()=>{});return key;
  }
}
async function readAiStore(){
  try{
    const envelope=JSON.parse(await readFile(AI_STORE_FILE,"utf8")),key=await masterKey(),decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(envelope.iv,"base64"));
    decipher.setAuthTag(Buffer.from(envelope.tag,"base64"));const clear=Buffer.concat([decipher.update(Buffer.from(envelope.data,"base64")),decipher.final()]);return JSON.parse(clear.toString("utf8"));
  }catch(error){if(error.code==="ENOENT")return{version:1,profiles:{}};throw error}
}
async function writeAiStore(store){
  const key=await masterKey(),iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv),clear=Buffer.from(JSON.stringify(store),"utf8"),encrypted=Buffer.concat([cipher.update(clear),cipher.final()]),envelope={version:1,iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),data:encrypted.toString("base64")};
  await writeFile(AI_STORE_FILE,JSON.stringify(envelope),{mode:0o600});await chmod(AI_STORE_FILE,0o600).catch(()=>{});
}
function validIdentity(value){return typeof value==="string"&&/^(admin|vp|committee):.{1,60}$/u.test(value)}
function identityRole(value=""){return String(value).split(":")[0]}
function bniRoot(){return path.resolve(process.env.BNI_ANALYSIS_ROOT||ANALYSIS_ROOT)}
function isoDay(date){return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())).toISOString().slice(0,10)}
function monthWindow(offsetMonths,countMonths){
  const now=new Date(),end=new Date(Date.UTC(now.getFullYear(),now.getMonth()+offsetMonths+1,0)),start=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()-countMonths+1,1));
  return{start:isoDay(start),end:isoDay(end),month:isoDay(start).slice(0,7)};
}
async function largeRequestBody(req){
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>20*1024*1024)throw new Error("上傳內容超過 20MB");chunks.push(chunk)}
  return chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):{};
}
async function findPalmsByPeriod(directory,start,end){
  const names=await readdir(directory).catch(error=>error.code==="ENOENT"?[]:Promise.reject(error));
  for(const name of names.filter(value=>value.toLowerCase().endsWith(".xls"))){
    try{const report=parsePalmsReport(await readFile(path.join(directory,name),"utf8"));if(report.periodStart===start&&report.periodEnd===end)return{name,report}}catch{}
  }
  return null;
}
function expectedAuditWeeks(start,end){
  let count=0,date=new Date(`${start}T00:00:00Z`),last=new Date(`${end}T00:00:00Z`);
  while(date<=last){if(date.getUTCDay()===2)count+=1;date.setUTCDate(date.getUTCDate()+1)}
  return count;
}
async function monthlyDataStatus(){
  const root=bniRoot(),monthly=monthWindow(-1,1),half=monthWindow(-1,6),annual=monthWindow(-1,12);
  const baselinePath=path.join(root,"data","baseline","palms.xls"),archiveDirectory=path.join(root,"data","archive"),monthlyDirectory=path.join(root,"data","monthly"),auditDirectory=path.join(root,"data","audit",monthly.month);
  let baseline=null;
  try{const report=parsePalmsReport(await readFile(baselinePath,"utf8"));if(report.periodStart===half.start&&report.periodEnd===half.end)baseline={name:"palms.xls",report}}catch{}
  const annualMatch=await findPalmsByPeriod(archiveDirectory,annual.start,annual.end),monthlyMatch=await findPalmsByPeriod(monthlyDirectory,monthly.start,monthly.end);
  const auditNames=(await readdir(auditDirectory).catch(error=>error.code==="ENOENT"?[]:Promise.reject(error))).filter(name=>name.toLowerCase().endsWith(".xls"));
  const expectedAudits=expectedAuditWeeks(monthly.start,monthly.end),auditComplete=auditNames.length>=expectedAudits;
  const items=[
    {type:"halfYear",label:"半年 PALMS",period:`${half.start} 至 ${half.end}`,complete:Boolean(baseline),detail:baseline?`已上傳・${baseline.report.members.length} 位會員`:"供燈號與關懷儀表板使用",accept:".xls",multiple:false},
    {type:"annual",label:"一年 PALMS",period:`${annual.start} 至 ${annual.end}`,complete:Boolean(annualMatch),detail:annualMatch?`已上傳・${annualMatch.report.members.length} 位會員`:"供續約審查與全年數據使用",accept:".xls",multiple:false},
    {type:"monthly",label:"單月 PALMS",period:`${monthly.start} 至 ${monthly.end}`,complete:Boolean(monthlyMatch),detail:monthlyMatch?`已上傳・${monthlyMatch.report.members.length} 位會員`:"供月會與上月出席統計使用",accept:".xls",multiple:false},
    {type:"audit",label:"每週審計資料",period:`${monthly.start} 至 ${monthly.end}`,complete:auditComplete,detail:`已上傳 ${auditNames.length}／預計 ${expectedAudits} 份`,accept:".xls",multiple:true}
  ];
  return{month:monthly.month,items,completed:items.filter(item=>item.complete).length,total:items.length,generatedAt:new Date().toISOString()};
}
function decodeUpload(file){
  if(!file||typeof file.dataBase64!=="string")throw new Error("沒有收到上傳檔案");
  const buffer=Buffer.from(file.dataBase64,"base64");if(!buffer.length||buffer.length>8*1024*1024)throw new Error("檔案內容為空或超過 8MB");
  return buffer;
}
async function monthlyDataUpload(req,res){
  try{
    const body=await largeRequestBody(req),identity=body.identity||"";
    if(!validIdentity(identity))return json(res,400,{message:"登入身份格式不正確"});
    if(!["admin","vp"].includes(identityRole(identity)))return json(res,403,{message:"只有副主席可以上傳每月 BNI 資料"});
    const root=bniRoot(),monthly=monthWindow(-1,1),half=monthWindow(-1,6),annual=monthWindow(-1,12),files=Array.isArray(body.files)?body.files:[];
    if(!["halfYear","annual","monthly","audit"].includes(body.type)||!files.length)return json(res,400,{message:"請選擇要上傳的資料"});
    if(body.type!=="audit"&&files.length!==1)return json(res,400,{message:"此類資料每次只能上傳一份"});
    if(files.length>8)return json(res,400,{message:"每次最多上傳 8 份檔案"});
    if(body.type==="audit"){
      const directory=path.join(root,"data","audit",monthly.month);await mkdir(directory,{recursive:true});
      for(let index=0;index<files.length;index+=1){
        const buffer=decodeUpload(files[index]),text=buffer.toString("utf8"),match=text.match(/審計報告[^\d]{0,30}(\d{1,2})\/(\d{1,2})\/(\d{4})/u);
        if(!match)throw new Error(`第 ${index+1} 份不是可辨識的 BNI 審計報告`);
        const reportDate=`${match[3]}-${String(match[2]).padStart(2,"0")}-${String(match[1]).padStart(2,"0")}`;
        if(reportDate<monthly.start||reportDate>monthly.end)throw new Error(`審計報告 ${reportDate} 不屬於 ${monthly.month}`);
        await writeFile(path.join(directory,`audit_week_${reportDate}.xls`),buffer);
      }
    }else{
      const buffer=decodeUpload(files[0]),report=parsePalmsReport(buffer.toString("utf8")),expected=body.type==="halfYear"?half:body.type==="annual"?annual:monthly;
      if(report.periodStart!==expected.start||report.periodEnd!==expected.end)throw new Error(`報表期間是 ${report.periodStart} 至 ${report.periodEnd}，本次需要 ${expected.start} 至 ${expected.end}`);
      let destination;
      if(body.type==="halfYear")destination=path.join(root,"data","baseline","palms.xls");
      else if(body.type==="annual")destination=path.join(root,"data","archive",`palms_${annual.start.slice(0,7)}_${annual.end.slice(0,7)}_annual.xls`);
      else destination=path.join(root,"data","monthly",`palms_${monthly.month}.xls`);
      await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,buffer);
    }
    return json(res,200,{message:"資料已驗證並完成入檔",status:await monthlyDataStatus()});
  }catch(error){return json(res,400,{message:`上傳失敗：${String(error?.message||error).slice(0,220)}`})}
}
async function monthlyDataApi(req,url,res){
  if(req.method==="GET"){
    const identity=url.searchParams.get("identity")||"";if(!validIdentity(identity))return json(res,400,{message:"登入身份格式不正確"});
    try{return json(res,200,await monthlyDataStatus())}catch(error){return json(res,500,{message:`無法檢查每月資料：${error.message}`})}
  }
  if(req.method==="POST")return monthlyDataUpload(req,res);
  return json(res,405,{message:"不支援的操作"});
}
async function readMeetingStore(){
  try{
    const store=JSON.parse(await readFile(MEETING_STORE_FILE,"utf8"));
    return{version:1,settings:{chapterSizeTarget:51,...store.settings},records:Array.isArray(store.records)?store.records:[]};
  }catch(error){if(error.code==="ENOENT")return{version:1,settings:{chapterSizeTarget:51},records:[]};throw error}
}
async function writeMeetingStore(store){
  await mkdir(AI_HOME,{recursive:true,mode:0o700});await chmod(AI_HOME,0o700).catch(()=>{});
  await writeFile(MEETING_STORE_FILE,JSON.stringify(store,null,2),{mode:0o600});await chmod(MEETING_STORE_FILE,0o600).catch(()=>{});
}
async function committeeMeetings(req,url,res){
  try{
    if(req.method==="GET"){
      const identity=url.searchParams.get("identity")||"";if(!validIdentity(identity))return json(res,400,{message:"登入身份格式不正確"});
      const store=await readMeetingStore(),role=identityRole(identity),records=role==="committee"?store.records.filter(item=>item.status==="final"):store.records;
      return json(res,200,{settings:store.settings,records:[...records].sort((a,b)=>String(b.meetingDate||"").localeCompare(String(a.meetingDate||""))),access:role==="committee"?"history":"manage"});
    }
    if(req.method!=="POST")return json(res,405,{message:"不支援的操作"});
    const body=await requestBody(req),identity=body.identity;if(!validIdentity(identity))return json(res,400,{message:"登入身份格式不正確"});
    const store=await readMeetingStore(),role=identityRole(identity);
    if(!["admin","vp"].includes(role))return json(res,403,{message:"會員委員只能查閱已結案的歷史會議紀錄"});
    if(body.action==="amend-renewal-decision"){
      const meetingId=String(body.meetingId||""),careItemId=String(body.careItemId||"");
      if(!/^meeting-\d{4}-\d{2}$/.test(meetingId)||!careItemId)return json(res,400,{message:"更正的月會或續約項目不正確"});
      const recordIndex=store.records.findIndex(item=>item.id===meetingId),existing=store.records[recordIndex];
      if(!existing||existing.status!=="final")return json(res,409,{message:"續約決議更正只適用於已結案月會，不會修改月會草稿"});
      const items=Array.isArray(existing.care?.items)?existing.care.items:[],matches=items.map((item,index)=>({item,index})).filter(entry=>entry.item.id===careItemId);
      if(matches.length!==1)return json(res,matches.length?409:404,{message:matches.length?"續約項目識別重複，請重新整理後再試":"找不到要更正的續約項目"});
      const{item,index:itemIndex}=matches[0];
      const correctionId=String(body.correction?.id||"").trim();
      if(item.decisionAmendments?.some(amendment=>amendment.id===correctionId))return json(res,200,{record:existing,alreadyApplied:true});
      let corrected;
      try{corrected=monthlyMeetingDomain.applyRenewalDecisionCorrection(item,{...(body.correction||{}),id:correctionId,correctedAt:new Date().toISOString(),correctedBy:identity})}
      catch(error){return json(res,409,{message:String(error?.message||"續約決議無法更正").slice(0,180)})}
      const nextItems=items.map((entry,index)=>index===itemIndex?corrected:entry),now=new Date().toISOString();
      const saved={...existing,care:{...(existing.care||{}),items:nextItems},updatedAt:now,updatedBy:identity};
      if(JSON.stringify(saved).length>60000)return json(res,400,{message:"會議紀錄內容過大"});
      store.records[recordIndex]=saved;await writeMeetingStore(store);return json(res,200,{record:saved,taskSyncRequired:true});
    }
    if(body.action==="settings"){
      const target=Math.round(Number(body.chapterSizeTarget));if(!Number.isFinite(target)||target<1||target>500)return json(res,400,{message:"分會目標人數不正確"});
      store.settings.chapterSizeTarget=target;store.settings.updatedAt=new Date().toISOString();store.settings.updatedBy=identity;await writeMeetingStore(store);return json(res,200,{settings:store.settings});
    }
    let record=body.record;if(!record||!/^meeting-\d{4}-\d{2}$/.test(String(record.id||""))||record.meetingMonth!==String(record.id).slice("meeting-".length))return json(res,400,{message:"會議紀錄編號不正確"});
    const storedRecord=store.records.find(item=>item.id===record.id);
    if(storedRecord?.status==="final")return record.status==="final"?json(res,200,{record:storedRecord,alreadyFinal:true}):json(res,409,{message:"已結案月會不能改回草稿；續約變更請使用專用更正"});
    const careItems=Array.isArray(record.care?.items)?record.care.items:[];
    if(careItems.some(item=>monthlyMeetingDomain.decisionAmendments(item).length))return json(res,409,{message:"結案後續約更正只能使用專用操作，不能隨整份月會覆寫"});
    if(careItems.some(item=>!monthlyMeetingDomain.isValidCareDisposition(item)))return json(res,400,{message:"確認不續約只能用於續約項目"});
    record={...record,care:{...(record.care||{}),items:careItems.map(monthlyMeetingDomain.normalizeCareItem)}};
    if(record.status==="final"&&monthlyMeetingDomain.missingCareAssignments(record.care?.items||[]).length)return json(res,400,{message:"需要後續行動的續約及輔導項目，都必須完成追蹤委員與排定日期後才能結案"});
    if(monthlyMeetingDomain.hasCareAssignmentConflict(record.care?.items||[]))return json(res,400,{message:"負責委員與陪訪委員不能是同一人"});
    const serialized=JSON.stringify(record);if(serialized.length>60000)return json(res,400,{message:"會議紀錄內容過大"});
    const existing=store.records.find(item=>item.id===record.id),now=new Date().toISOString();
    const saved={...record,createdAt:existing?.createdAt||now,createdBy:existing?.createdBy||identity,updatedAt:now,updatedBy:identity};
    const index=store.records.findIndex(item=>item.id===saved.id);if(index>=0)store.records[index]=saved;else store.records.push(saved);
    await writeMeetingStore(store);return json(res,200,{record:saved});
  }catch(error){return json(res,500,{message:`月會紀錄無法處理：${String(error?.message||error).slice(0,180)}`})}
}
async function testDataReset(req,url,res){
  try{
    const body=req.method==="POST"?await requestBody(req):{},identity=req.method==="GET"?url.searchParams.get("identity")||"":body.identity||"";
    if(!validIdentity(identity))return json(res,400,{message:"登入身份格式不正確"});
    if(identityRole(identity)!=="admin")return json(res,403,{message:"只有系統開發人員 Admin 可以清除測試資料"});
    const store=await readMeetingStore();
    if(req.method==="GET")return json(res,200,{meetings:store.records.length});
    if(req.method!=="POST")return json(res,405,{message:"不支援的操作"});
    if(body.confirmation!=="RESET_FULIAN_TEST_DATA")return json(res,400,{message:"缺少測試資料清除確認"});
    const meetings=store.records.length;store.records=[];await writeMeetingStore(store);
    return json(res,200,{meetings,message:"伺服器端測試資料已清除"});
  }catch(error){return json(res,500,{message:`測試資料無法清除：${String(error?.message||error).slice(0,180)}`})}
}
function attendanceCountList(map){return[...map].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"zh-Hant")).map(([name,count])=>`${name}（${count}次）`).join("、")}
async function bniMonthlyAttendance(month){
  if(!/^\d{4}-\d{2}$/.test(month))throw new Error("報告月份格式不正確");
  const root=bniRoot(),monthlyDirectory=path.join(root,"data","monthly"),names=await readdir(monthlyDirectory).catch(error=>error.code==="ENOENT"?[]:Promise.reject(error));
  const reports=[];
  for(const name of names.filter(value=>value.toLowerCase().endsWith(".xls"))){
    try{reports.push({name,report:parsePalmsReport(await readFile(path.join(monthlyDirectory,name),"utf8"))})}catch{}
  }
  const match=reports.find(item=>item.report.periodStart.slice(0,7)===month&&item.report.periodEnd.slice(0,7)===month);
  if(!match)throw new Error(`尚未提供 ${month} 單月 PALMS；請將 BNI Connect 匯出的 ${month}-01 至月底報表放入 BNI/data/monthly/`);
  const{name,report}=match,periodStart=report.periodStart,periodEnd=report.periodEnd,currentMembers=JSON.parse(await readFile(path.join(root,"data","reference","current-members.json"),"utf8")),currentNames=new Set((currentMembers.members||[]).map(item=>String(item.name||"").replace(/\s+/g,""))),members=report.members.filter(member=>currentNames.has(member.name));
  const absence=new Map(),late=new Map(),proxy=new Map();let absenceActual=0,lateActual=0,proxyActual=0;
  const add=(map,name,count=1)=>map.set(name,(map.get(name)||0)+count);
  for(const member of members){
    const metrics=member.metrics||{};
    if(metrics.absence){absenceActual+=metrics.absence;add(absence,member.name,metrics.absence)}
    if(metrics.late){lateActual+=metrics.late;add(late,member.name,metrics.late)}
    if(metrics.substitutes){proxyActual+=metrics.substitutes;add(proxy,member.name,metrics.substitutes)}
  }
  return{month,memberCount:members.length,absenceActual,absenceList:attendanceCountList(absence),lateActual,lateList:attendanceCountList(late),proxyActual,proxyList:attendanceCountList(proxy),periodStart,periodEnd,source:`BNI Connect 單月 PALMS｜data/monthly/${name}`,fetchedAt:new Date().toISOString()};
}
async function attendanceMonthly(url,res){try{return json(res,200,await bniMonthlyAttendance(url.searchParams.get("month")||""))}catch(error){return json(res,503,{message:`BNI 單月 PALMS 無法彙整：${String(error?.message||error).slice(0,180)}`})}}
function aiStatus(profile={}){return{defaultProvider:profile.defaultProvider||"openai",providers:Object.fromEntries(AI_PROVIDERS.map(provider=>[provider,{configured:Boolean(profile.keys?.[provider]?.value),suffix:profile.keys?.[provider]?.suffix||"",updatedAt:profile.keys?.[provider]?.updatedAt||""}])),storage:"本機加密保存・不寫入 GitHub"}}
async function aiSettings(req,url,res){
  try{
    if(req.method==="GET"){const identity=url.searchParams.get("identity")||"";if(!validIdentity(identity))return json(res,400,{message:"登入身份格式不正確"});const store=await readAiStore();return json(res,200,aiStatus(store.profiles[identity]))}
    if(req.method!=="POST")return json(res,405,{message:"不支援的操作"});
    const body=await requestBody(req),identity=body.identity;if(!validIdentity(identity))return json(res,400,{message:"登入身份格式不正確"});
    if(!AI_PROVIDERS.includes(body.defaultProvider))return json(res,400,{message:"預設 AI 平台不正確"});
    const store=await readAiStore(),profile=store.profiles[identity]||{keys:{}};profile.keys=profile.keys||{};profile.defaultProvider=body.defaultProvider;
    for(const provider of AI_PROVIDERS){const value=String(body.keys?.[provider]||"").trim();if(value){if(value.length<12||value.length>500)return json(res,400,{message:`${provider} API Key 格式或長度不正確`});profile.keys[provider]={value,suffix:value.slice(-4),updatedAt:new Date().toISOString()}}}
    for(const provider of Array.isArray(body.remove)?body.remove:[]){if(AI_PROVIDERS.includes(provider))delete profile.keys[provider]}
    profile.updatedAt=new Date().toISOString();store.profiles[identity]=profile;await writeAiStore(store);return json(res,200,aiStatus(profile));
  }catch(error){return json(res,500,{message:`個人 AI 設定無法處理：${error.message}`})}
}

async function loadKnowledgeChunks(){
  const chunks=[];
  for(const relativePath of AI_KNOWLEDGE_FILES){try{chunks.push(...splitKnowledgeDocument(await readFile(path.join(ROOT,relativePath),"utf8"),relativePath))}catch(error){if(error.code!=="ENOENT")throw error}}
  try{
    const snapshot=await buildBniAnalysisSnapshot();
    const breakthroughTable=(snapshot.sections||[]).find(section=>section.title.includes("黃燈突圍"))?.tables?.[0];
    const breakthroughMap=new Map((breakthroughTable?.rows||[]).map(row=>[row[0],row[2]]));
    for(const member of snapshot.members||[]){
      const metrics=member.metrics||{},official=member.official||{},components=official.componentScores||{};
      const totalReferrals=(metrics.givenIn||0)+(metrics.givenOut||0);
      const referralAverage=official.weeks?`${(totalReferrals/official.weeks).toFixed(2)} 筆/週`:"待確認";
      const content=[
        `${member.name}｜專業別：${member.profession||"未提供"}｜會籍到期日：${member.expiryDate||"未提供"}｜最新燈號：${member.light||"待確認"}｜最新分數：${member.score??"待確認"}`,
        `半年數據：提供內部引薦 ${metrics.givenIn||0} 筆、外部引薦 ${metrics.givenOut||0} 筆、共 ${totalReferrals} 筆；計算週數 ${official.weeks??"待確認"} 週；引薦週平均 ${referralAverage}`,
        `官方各項得分：缺席 ${components.absence??"待確認"}、引薦 ${components.referrals??"待確認"}、來賓 ${components.visitors??"待確認"}、一對一 ${components.oneToOne??"待確認"}、培訓 ${components.education??"待確認"}、交易價值 ${components.transaction??"待確認"}`,
        breakthroughMap.has(member.name)?`最新黃燈突圍估算：${breakthroughMap.get(member.name)}`:""
      ].filter(Boolean).join("｜");
      chunks.push({title:`${member.name}的最新會籍、燈號、各項得分與黃燈突圍資料`,path:"BNI/data/baseline/palms.xls＋data/reference/official-scores-2026-06.md＋BNI/index.html",content:`資料來源更新：${snapshot.source?.modifiedAt||snapshot.generatedAt}\n${content}`});
    }
  }catch(error){console.error("AI 無法載入 BNI 會員資料",error.message)}
  return chunks;
}
function buildAiPrompt(question,history,sources){
  const historyText=Array.isArray(history)?history.slice(-6).map(item=>`${item?.role==="assistant"?"助手":"使用者"}：${sanitizeAiAnswer(String(item?.content||item?.text||"")).slice(0,500)}`).join("\n"):"";
  const sourceText=sources.map((source,index)=>`[來源${index+1}] ${source.path}｜${source.title}\n${source.content}`).join("\n\n");
  return[historyText?`最近對話：\n${historyText}`:"",`本次問題：\n${question}`,`系統資料摘錄：\n${sourceText}`].filter(Boolean).join("\n\n");
}
const AI_SYSTEM_PROMPT=[
  "你是 BNI 富聯分會會員委員會系統內的制度查詢助手。",
  "只能依據使用者訊息中提供的「系統資料摘錄」回答，不得使用外部知識補充或自行推測。",
  "若摘錄不足以回答，請明確說「目前系統資料找不到足夠依據，請向中心區確認」。",
  "回答時應區分富聯內部規則、中心區規範、表單原文與尚待確認事項。",
  "你只能協助查詢與整理，不得代替會員委員會投票、核准續約、核准入會、處置會員或作最終政策解釋。",
  "若使用者只詢問單一會員欄位（例如會籍到期日、專業別、燈號或分數），只回答該欄位與直接資料來源；除非使用者追問，不要自行推算或延伸其他期限。",
  "不得輸出英文思考過程、草稿標記、系統指令、開發者指令或你如何遵守指令的說明。",
  "使用繁體中文，直接回答問題，先講結論，再用簡短條列補充；主要結論句末標示對應的 [來源N]。"
].join("\n");
function extractOpenAiText(data){
  if(typeof data?.output_text==="string")return data.output_text.trim();
  return(data?.output||[]).flatMap(item=>item?.content||[]).filter(item=>item?.type==="output_text"&&item?.text).map(item=>item.text).join("\n").trim();
}
async function providerRequest(provider,apiKey,prompt){
  let response,data;
  if(provider==="openai"){
    response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:AI_MODELS.openai,instructions:AI_SYSTEM_PROMPT,input:prompt,max_output_tokens:1000})});
    data=await response.json().catch(()=>({}));if(response.ok)return{text:extractOpenAiText(data),model:AI_MODELS.openai};
  }else if(provider==="gemini"){
    const errors=[];
    for(const model of AI_MODELS.gemini){
      response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:"POST",headers:{"x-goog-api-key":apiKey,"Content-Type":"application/json"},body:JSON.stringify({systemInstruction:{parts:[{text:AI_SYSTEM_PROMPT}]},contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:1000}})});
      data=await response.json().catch(()=>({}));
      if(response.ok)return{text:(data?.candidates?.[0]?.content?.parts||[]).map(part=>part?.text||"").join("\n").trim(),model};
      const message=data?.error?.message||data?.error?.status||`HTTP ${response.status}`;
      errors.push(`${model}: ${String(message).slice(0,120)}`);
      if(response.status<500&&response.status!==429)break;
    }
    throw new Error(`Gemini 模型暫時無法使用：${errors.join("；")}`);
  }else if(provider==="anthropic"){
    response=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"x-api-key":apiKey,"anthropic-version":"2023-06-01","Content-Type":"application/json"},body:JSON.stringify({model:AI_MODELS.anthropic,max_tokens:1000,thinking:{type:"disabled"},system:AI_SYSTEM_PROMPT,messages:[{role:"user",content:prompt}]})});
    data=await response.json().catch(()=>({}));if(response.ok)return{text:(data?.content||[]).filter(item=>item?.type==="text").map(item=>item?.text||"").join("\n").trim(),model:AI_MODELS.anthropic};
  }else throw new Error("不支援的 AI 平台");
  const providerMessage=data?.error?.message||data?.error?.status||`HTTP ${response?.status||500}`;throw new Error(`AI 平台回應失敗：${String(providerMessage).slice(0,180)}`);
}
async function aiChat(req,res){
  try{
    const body=await requestBody(req),identity=body.identity,provider=body.provider,question=String(body.question||"").trim().slice(0,600);
    if(!validIdentity(identity)||!AI_PROVIDERS.includes(provider)||!question)return json(res,400,{message:"缺少身分、AI 平台或問題內容"});
    const now=Date.now(),lastRequest=aiRequestTimes.get(identity)||0;if(now-lastRequest<1800)return json(res,429,{message:"請稍候片刻再詢問下一題"});aiRequestTimes.set(identity,now);
    const store=await readAiStore(),apiKey=store.profiles?.[identity]?.keys?.[provider]?.value;if(!apiKey)return json(res,400,{message:"此身分尚未綁定所選平台的 API Key，請先到設定完成綁定"});
    const selected=selectKnowledge(question,await loadKnowledgeChunks());if(!selected.length)return json(res,200,{answer:"目前系統資料找不到足夠依據，請向中心區確認。",sources:[],provider,model:"未呼叫"});
    const result=await providerRequest(provider,apiKey,buildAiPrompt(question,body.history,selected)),answer=sanitizeAiAnswer(result.text);if(!answer)throw new Error("AI 平台未回傳可顯示的文字");
    return json(res,200,{answer,sources:selected.map(({title,path})=>({title,path})),provider,model:result.model});
  }catch(error){return json(res,500,{message:String(error?.message||"AI 助手暫時無法回應").slice(0,220)})}
}
async function staticFile(res,filePath,allowedRoot){
  if(filePath!==allowedRoot&&!filePath.startsWith(allowedRoot+path.sep))return res.writeHead(403).end("Forbidden");
  try{
    const info=await stat(filePath);if(!info.isFile())throw new Error("not file");
    const body=await readFile(filePath);
    res.writeHead(200,{"content-type":mime[path.extname(filePath).toLowerCase()]||"application/octet-stream","cache-control":"no-cache","x-content-type-options":"nosniff","referrer-policy":"same-origin"});
    res.end(body);
  }catch{
    res.writeHead(404,{"content-type":"text/plain; charset=utf-8"});res.end("Not found");
  }
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://127.0.0.1"),isApi=url.pathname.startsWith("/api/");
  if(isApi&&!trustedLocalRequest(req))return json(res,403,{message:"本機 API 僅允許由 localhost 使用，禁止透過公開隧道存取"});
  if(url.pathname==="/api/company")return companyLookup(url,res);
  if(url.pathname==="/api/bni-analysis")return bniAnalysis(res);
  if(url.pathname==="/api/bni-monthly-attendance")return attendanceMonthly(url,res);
  if(url.pathname==="/api/monthly-data")return monthlyDataApi(req,url,res);
  if(url.pathname==="/api/committee-meetings")return committeeMeetings(req,url,res);
  if(url.pathname==="/api/test-data-reset")return testDataReset(req,url,res);
  if(url.pathname==="/api/ai-settings")return aiSettings(req,url,res);
  if(url.pathname==="/api/analysis-draft")return analysisDraftApi(req,url,res,{json,requestBody,validIdentity,identityRole,readAiStore});
  if(url.pathname==="/api/analysis-snapshots")return analysisSnapshotsApi(req,url,res,{json,validIdentity});
  if(url.pathname==="/api/member-departure")return memberDepartureApi(req,url,res,{json,requestBody,validIdentity,identityRole});
  if(url.pathname==="/api/ai-chat"&&req.method==="POST")return aiChat(req,res);
  if(url.pathname==="/analysis"||url.pathname==="/analysis/")return staticFile(res,path.join(bniRoot(),"index.html"),bniRoot());
  if(url.pathname==="/analysis/report.html")return staticFile(res,path.join(bniRoot(),"report.html"),bniRoot());
  const requested=url.pathname==="/"?"index.html":decodeURIComponent(url.pathname.slice(1));
  return staticFile(res,path.resolve(ROOT,requested),ROOT);
});
server.listen(PORT,LAN_MODE?"0.0.0.0":"127.0.0.1",()=>console.log(`富聯會員委員會整合系統：http://127.0.0.1:${PORT}${LAN_MODE?"（區網模式：同網段裝置可連線）":""}\nBNI 完整分析工具：http://127.0.0.1:${PORT}/analysis/`));
