import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import {createMonthlyAwardsApi} from "../services/monthly-awards.mjs";
const require=createRequire(import.meta.url),D=require("../core/monthly-awards-domain.js");
const cell=value=>`<Cell><Data>${value}</Data></Cell>`;
const xml=(rows,month="2026-08")=>`<Workbook><Table><Row>${cell("從:")}${cell(`${month}-01T00:00:00`)}</Row><Row>${cell("至:")}${cell(`${month}-31T00:00:00`)}</Row><Row>${cell("姓氏")}${cell("名字")}</Row>${rows.map(([name,one=3,inside=2,outside=1,amount=1200,visitors=0])=>`<Row>${Array.from({length:20},(_,i)=>cell(({0:name,1:"",10:inside,11:outside,15:visitors,17:one,18:amount})[i]??0)).join("")}</Row>`).join("")}</Table></Workbook>`;
const source=xml([["測試甲"],["測試乙"],["離會丙",99,99,99,999999,9]]);
const hash=text=>createHash("sha256").update(text).digest("hex");
const row=(id="new",content=source)=>({id,report_type:"monthly_palms",period_start:"2026-08-01",period_end:"2026-08-31",imported_at:id==="old"?"2026-09-01":"2026-09-02",sha256:hash(content),storage_path:"private-path"});
const url=month=>new URL(`https://example.invalid/api/monthly-awards${month?`?month=${month}`:""}`);
const build=({content=source,imports=[row("new",content)],roster=["測試甲","測試乙","新會員丁"],downloadReport}={})=>createMonthlyAwardsApi({getImports:async()=>imports,getRoster:async()=>roster,downloadReport:downloadReport||(async()=>content)});
const call=(api,month="2026-08",role="vp",method="GET")=>api({method},url(month),{role});
test("最高值全部並列；排除離會者，提供引薦相加，零不授獎、缺會員不補零",async()=>{
  const data=await call(build());
  assert.equal(data.memberCount,2);assert.equal(data.missingMemberCount,1);
  for(const award of data.awards.slice(0,3))assert.deepEqual(new Set(award.winners),new Set(["測試甲","測試乙"]));
  assert.equal(data.awards[1].value,3);assert.equal(data.awards[2].value,1200);
  assert.deepEqual(data.awards[3].winners,[]);assert.equal(data.awards[3].status,"no-records");
  assert.doesNotMatch(JSON.stringify(data),/離會丙|private-path/);
  const text=D.announcement(data);assert.match(text,/2026 年 8 月/);assert.match(text,/1,200 元/);assert.match(text,/並列第一/);assert.match(text,/1 位現役會員當月無資料/);
  assert.match(text,/本月無紀錄/);assert.doesNotMatch(text,/undefined|NaN/);
});
test("授權及方法在任何來源讀取前檢查",async()=>{
  let reads=0;const api=createMonthlyAwardsApi({getImports:()=>{reads++;throw Error("unexpected");}});
  for(const role of ["committee","chair","guest",undefined])await assert.rejects(call(api,"2026-08",role===undefined?null:role),e=>e.status===403);
  await assert.rejects(call(api,"2026-08","vp","POST"),e=>e.status===405);assert.equal(reads,0);
  assert.equal((await call(build(),"2026-08","admin")).awards.length,4);
});
test("月份目錄與最新同月版本；不能把缺月或無合資格會員當零",async()=>{
  let downloaded;
  const api=build({imports:[row("old"),row("new")],downloadReport:async row=>{downloaded=row.id;return source;}});
  assert.equal((await call(api,"")).months.length,1);assert.equal(downloaded,undefined);
  await call(api);assert.equal(downloaded,"new");
  await assert.rejects(call(api,"2026-07"),e=>e.status===404);
  await assert.rejects(call(api,"2026-13"),e=>e.status===400);
  await assert.rejects(call(build({roster:[]})),/沒有目前在會會員/);
});
test("來源指紋、期間、重複姓名及數字缺漏有問題時停止公告",async()=>{
  await assert.rejects(call(build({imports:[{...row(),sha256:"0".repeat(64)}]})),/指紋不一致/);
  await assert.rejects(call(build({imports:[{...row(),sha256:null}]})),/缺少完整性指紋/);
  await assert.rejects(call(build({content:source.replaceAll("2026-08","2026-07")})),/期間不一致/);
  await assert.rejects(call(build({content:xml([["測試甲"],["測 試 甲"]])})),/姓名缺漏或重複/);
  await assert.rejects(call(build({roster:["測試甲","測 試 甲"]})),/現役名單/);
  for(const value of ["",-1,"bad"]){await assert.rejects(call(build({content:xml([["測試甲",value]])})),/評比欄位缺漏或不正確/);}
});
const browserCode=await readFile(new URL("../assets/js/monthly-awards.js",import.meta.url),"utf8");
function page({role="vp",clipboard}={}){
  const elements=new Map(),listeners={},requests=[];
  const element=()=>({value:"",textContent:"",disabled:false,open:false,children:[],handlers:{},replaceChildren(...nodes){this.children=nodes;this.value=nodes[0]?.value||"";},append(...nodes){this.children.push(...nodes);},addEventListener(type,fn){this.handlers[type]=fn;},focus(){this.focused=true;},select(){this.selected=true;}});
  const panel={querySelector(selector){if(!elements.has(selector))elements.set(selector,element());return elements.get(selector);}};
  const context={document:{querySelector:()=>panel,createElement:element},window:{FulianAuth:{getSession:()=>({role,name:"測試"})},FulianMonthlyAwardsDomain:D,addEventListener:(name,fn)=>listeners[name]=fn},navigator:{clipboard},fetch:(url)=>new Promise(resolve=>requests.push({url,reply:(data,ok=true)=>resolve({ok,json:async()=>data})}))};
  vm.runInNewContext(browserCode,context);
  return{elements,listeners,requests,get:id=>elements.get(`#monthlyAwards${id}`)};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const catalog={months:[{month:"2026-08"},{month:"2026-07"}]};
async function ready(p){p.requests[0].reply(catalog);await settle();p.requests[1].reply(await call(build()));await settle();}
test("前端切月立即清舊公告、忽略過期回應，讀取錯誤不提供複製",async()=>{
  const p=page();await ready(p);assert.equal(p.get("Copy").disabled,false);
  p.get("Month").value="2026-07";const first=p.get("Month").handlers.change();
  assert.equal(p.get("Text").value,"");assert.equal(p.get("Copy").disabled,true);
  p.get("Month").value="2026-08";const second=p.get("Month").handlers.change();
  p.requests[3].reply(await call(build()));await second;
  p.requests[2].reply({message:"舊請求失敗"},false);await first;
  assert.match(p.get("Text").value,/2026 年 8 月/);assert.equal(p.get("Copy").disabled,false);
  const failed=p.get("Month").handlers.change();p.requests[4].reply({message:"尚無資料"},false);await failed;
  assert.equal(p.get("Text").value,"");assert.equal(p.get("Copy").disabled,true);assert.equal(p.get("Status").textContent,"尚無資料");
});
test("複製成功與拒絕備援、更新事件刷新，以及委員不讀取公告",async()=>{
  let copied;const p=page({clipboard:{writeText:async text=>copied=text}});await ready(p);
  await p.get("Copy").handlers.click();assert.equal(copied,p.get("Text").value);assert.match(p.get("Status").textContent,/已複製/);
  const fallback=page({clipboard:{writeText:async()=>{throw Error("denied");}}});await ready(fallback);
  await fallback.get("Copy").handlers.click();assert.equal(fallback.get("Preview").open,true);assert.equal(fallback.get("Text").selected,true);
  p.listeners["fulian:monthly-data-status"]();assert.equal(p.get("Copy").disabled,true);assert.equal(p.requests.length,3);
  assert.equal(page({role:"committee"}).requests.length,0);
});

test("本機增量鏡像按 manifest 讀檔、使用較新現役核對，不用舊快照復活離會者",async()=>{
  const {mkdtemp,mkdir,writeFile,rm}=await import("node:fs/promises"),{tmpdir}=await import("node:os"),path=await import("node:path");
  const {localMonthlyAwards}=await import("../services/local-monthly-awards.mjs");
  const root=await mkdtemp(path.join(tmpdir(),"fulian-awards-"));
  const put=async(file,data)=>{const target=path.join(root,file);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,typeof data==="string"?data:JSON.stringify(data));};
  const member=(name,status="active")=>({status,people:{display_name:name,status:"active"}});
  try{
    await put("data/reference/current-production-mirror.json",{directory:"data/mirror",manifest:"mirror-manifest.json",verifiedAt:"2026-09-01",operationalReadbacks:[{directory:"data/roster",verifiedAt:"2026-09-02"}]});
    await put("data/mirror/after.json",{imports:[row()],members:[member("測試甲"),member("離會丙")]});
    await put("data/roster/after.json",{members:[member("測試甲"),member("離會丙","departed")]});
    await put("data/sources/monthly.xls",source);
    await put("data/mirror/mirror-manifest.json",{files:[{local:path.join(root,"data/sources/monthly.xls"),storagePath:"private-path",sha256:hash(source)}]});
    const run=()=>localMonthlyAwards({method:"GET"},url("2026-08"),{role:"vp"},root);
    const result=await run();assert.equal(result.memberCount,1);assert.deepEqual(result.awards[0].winners,["測試甲"]);
    await put("data/sources/monthly.xls",source+" ");await assert.rejects(run(),/指紋不一致/);
    await rm(path.join(root,"data/roster/after.json"));await assert.rejects(run(),/鏡像或現役核對資料不完整/);
  }finally{await rm(root,{recursive:true,force:true});}
});

const halfXml=(rows,start="2026-03-01",end="2026-08-31")=>`<Workbook><Table><Row>${cell("從:")}${cell(start+"T00:00:00")}</Row><Row>${cell("至:")}${cell(end+"T00:00:00")}</Row><Row>${cell("姓氏")}${cell("名字")}</Row>${rows.map(values=>`<Row>${Array.from({length:20},(_,i)=>cell(values[i]??(i===1?"":0))).join("")}</Row>`).join("")}</Table></Workbook>`;
const halfRows=[{0:"測試甲",3:26,17:12,18:5000,19:18},{0:"測試乙",3:26,17:12,18:5000,19:18},{0:"新會員丁",3:8,19:2},{0:"離會丙",3:26,17:999,19:999}];
const halfSource=halfXml(halfRows);
const halfRow=(content=halfSource,overrides={})=>({id:"half",report_type:"half_year_palms",metadata:{category:"halfYear"},period_start:"2026-03-01",period_end:"2026-08-31",imported_at:"2026-09-02",sha256:hash(content),...overrides});
const withHalf=({content=halfSource,imports=[row(),halfRow(content)],roster,downloadReport}={})=>build({imports,roster,downloadReport:downloadReport||(async item=>item.id==="new"?source:content)});
const centerCall=(api,month="2026-08")=>api({method:"GET"},new URL(`https://example.invalid/api/monthly-awards?month=${month}&include=halfYear`),{role:"vp"});
test("中心區回覆包含近半年、培訓並列與完整出席者；新人與離會者排除，原 API 相容",async()=>{
  const api=withHalf(),data=await centerCall(api),half=data.halfYear;
  assert.equal((await call(api)).halfYear,undefined);
  assert.equal(half.status,"ready");assert.deepEqual(half.period,{start:"2026-03-01",end:"2026-08-31"});
  assert.equal(half.attendance.totalWeeks,26);assert.deepEqual(new Set(half.attendance.winners),new Set(["測試甲","測試乙"]));
  assert.deepEqual(new Set(half.awards.find(a=>a.key==="education").winners),new Set(["測試甲","測試乙"]));
  const text=D.centerReply(data);
  assert.match(text,/近半年 2026\/03\/01–2026\/08\/31/);assert.match(text,/2．引薦價值/);assert.match(text,/3．業務引薦/);assert.match(text,/5．培訓積分/);assert.match(text,/6．全勤獎/);
  assert.match(text,/並列，各 18 分/);assert.match(text,/26 次/);assert.match(text,/PALMS 會面次數/);assert.doesNotMatch(text,/離會丙|Sean|本會期|undefined|NaN/);
});
test("全勤四項各自排除；整份報表決定完整週數，無全勤明列無",async()=>{
  const rows=[...Array.from({length:4},(_,i)=>({0:`測試${i}`,3:25,[([4,5,6,8][i])]:1})),{0:"新人",3:8},{0:"離會者",3:26}];
  const data=await centerCall(withHalf({content:halfXml(rows),roster:["測試甲",...rows.slice(0,-1).map(r=>r[0])]}));
  assert.equal(data.halfYear.status,"ready");assert.equal(data.halfYear.attendance.totalWeeks,26);assert.deepEqual(data.halfYear.attendance.winners,[]);assert.match(D.centerReply(data),/6．全勤獎：本期無/);
  const shorter=await centerCall(withHalf({content:halfXml([{0:"測試甲",3:8},{0:"離會者",3:26}]),roster:["測試甲"]}));
  assert.equal(shorter.halfYear.attendance.totalWeeks,26);assert.deepEqual(shorter.halfYear.attendance.winners,[]);
});
test("半年來源只取精確期間最新合格報表，缺漏或損毀不誤報零、不回退舊版",async()=>{
  const badCategory=halfRow(halfSource,{id:"renewal",metadata:{category:"renewal"},imported_at:"2026-09-05"});
  let downloaded=[];
  const api=withHalf({imports:[row(),halfRow(),badCategory,halfRow(halfSource,{id:"annual",metadata:{category:"annual"},imported_at:"2026-09-06"})],downloadReport:async item=>{downloaded.push(item.id);return item.id==="new"?source:halfSource;}});
  assert.equal((await centerCall(api)).halfYear.status,"ready");assert.deepEqual(downloaded,["new","half"]);
  const missing=await centerCall(withHalf({imports:[row(),badCategory]}));
  assert.equal(missing.awards.length,4);assert.equal(missing.halfYear.status,"unavailable");assert.throws(()=>D.centerReply(missing),/尚未齊全/);
  const broken=await centerCall(withHalf({imports:[row(),halfRow(),halfRow(halfSource,{id:"broken",imported_at:"2026-09-06",sha256:"0".repeat(64)})]}));
  assert.equal(broken.halfYear.status,"unavailable");assert.match(broken.halfYear.message,/指紋不一致/);
  for(const [index,value] of [[19,""],[3,""],[4,-1],[5,0.5]]){
    const result=await centerCall(withHalf({content:halfXml([{...halfRows[0],[index]:value},...halfRows.slice(1)])}));
    assert.equal(result.halfYear.status,"unavailable");assert.match(result.halfYear.message,/欄位缺漏或不正確/);
  }
  const wrongPeriod=await centerCall(withHalf({content:halfXml(halfRows,"2026-02-01")}));assert.equal(wrongPeriod.halfYear.status,"unavailable");
});
test("近六個月跨年與二月月底不採固定會期",async()=>{
  const monthly=xml([["測試甲"]],"2026-02").replaceAll("2026-02-31","2026-02-28"),half=halfXml(halfRows,"2025-09-01","2026-02-28");
  const api=build({imports:[{...row("new",monthly),period_start:"2026-02-01",period_end:"2026-02-28"},halfRow(half,{period_start:"2025-09-01",period_end:"2026-02-28",metadata:{}})],downloadReport:async item=>item.id==="new"?monthly:half});
  const result=await centerCall(api,"2026-02");assert.equal(result.halfYear.status,"ready");assert.deepEqual(result.halfYear.period,{start:"2025-09-01",end:"2026-02-28"});
});
test("中心區複製成功與備援、缺半年禁用、切月清除兩份文字並忽略過期複製",async()=>{
  let copied,finishCopy;
  const p=page({clipboard:{writeText:text=>{copied=text;return new Promise(resolve=>finishCopy=resolve);}}});
  p.requests[0].reply(catalog);await settle();assert.match(p.requests[1].url,/include=halfYear/);
  p.requests[1].reply(await centerCall(withHalf()));await settle();
  assert.equal(p.get("CenterCopy").disabled,false);const copying=p.get("CenterCopy").handlers.click();assert.match(copied,/6．全勤獎/);
  p.get("Month").value="2026-07";const changing=p.get("Month").handlers.change();assert.equal(p.get("CenterText").value,"");assert.equal(p.get("CenterCopy").disabled,true);
  finishCopy();await copying;assert.doesNotMatch(p.get("Status").textContent,/已複製/);
  p.requests[2].reply({message:"尚無資料"},false);await changing;assert.equal(p.get("CenterText").value,"");
  const fallback=page();fallback.requests[0].reply(catalog);await settle();fallback.requests[1].reply(await centerCall(withHalf()));await settle();
  await fallback.get("CenterCopy").handlers.click();assert.equal(fallback.get("CenterPreview").open,true);assert.equal(fallback.get("CenterText").selected,true);
  const missing=page();await ready(missing);assert.equal(missing.get("CenterCopy").disabled,true);assert.equal(missing.get("Copy").disabled,false);assert.equal(missing.get("CenterText").hidden,true);
});
