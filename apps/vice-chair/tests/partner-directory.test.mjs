import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {createPartnerReportsApi,monthlyReportCatalog} from "../services/partner-reports.mjs";
const require=createRequire(import.meta.url);
require("../core/calendar-domain.js");
const D=require("../core/partner-directory-domain.js");
const now=new Date("2026-09-11T03:00:00Z");
const metrics=(oneToOne)=>({oneToOne,givenIn:2,givenOut:3,receivedIn:1,receivedOut:4,education:0});
const snapshot=()=>({schema:"fulian.bni-analysis.v1",summary:{totalMembers:3},memberData:{count:3,metricsPeriod:{start:"2026-03-01",end:"2026-08-31"},annualMetricsPeriod:{start:"2025-09-01",end:"2026-08-31"}},members:[
  {name:"測試甲",profession:"設計",expiryDate:"2026-09-30",recentActivation:"2026-03-01",metrics:metrics(12),annualMetrics:metrics(60)},
  {name:"測試乙",profession:"設計顧問",expiryDate:"2026-09-11",recentActivation:"2026-09-01",metrics:metrics(2),annualMetrics:metrics(5)},
  {name:"測試丙",profession:"顧問",expiryDate:"",recentActivation:"",metrics:{},annualMetrics:{}},
]});

test("一對一使用數值排序，升降冪都將缺值置底，保留零與原始來源",()=>{
  const source=snapshot(),before=JSON.stringify(source),rows=D.rows(source,"half",now);
  assert.deepEqual(D.query(rows,{sort:"oneToOne"}).map(row=>row.oneToOne),[2,12,null]);
  assert.deepEqual(D.query(rows,{sort:"oneToOne",direction:"desc"}).map(row=>row.oneToOne),[12,2,null]);
  assert.equal(rows[0].education,0);assert.equal(rows[2].education,null);
  assert.equal(rows[0].given,5);assert.equal(rows[2].given,null);
  assert.equal(JSON.stringify(source),before);
});
test("搜尋、專業、日期與數值篩選可組合，到期日包含台北今天",()=>{
  const rows=D.rows(snapshot(),"half",now);
  assert.equal(D.query(rows,{search:"測試 設計",metric:"oneToOne",min:"3",max:"15",expiry:"30"},now)[0].name,"測試甲");
  assert.equal(D.query(rows,{profession:"設計顧問",expiry:"30"},now).length,1);
  assert.equal(D.query(rows,{from:"2026-09-12",to:"2026-09-30"},now).length,1);
  assert.equal(D.query(rows,{expiry:"missing"},now)[0].name,"測試丙");
  assert.equal(D.query(rows,{expiry:"past"},now).length,0);
});
test("半年一年分開且缺期間不可用其他期間冒充，生效日不可推定缺值",()=>{
  const source=snapshot();assert.equal(D.rows(source,"annual",now)[0].oneToOne,60);
  source.memberData.annualMetricsPeriod=null;
  assert.equal(D.rows(source,"annual",now)[0].oneToOne,null);
  assert.equal(D.rows(source,"half",now)[0].tenureMonths,6);
  assert.equal(D.monthsSince("2026-10-01",now),null);
  assert.equal(D.monthsSince("2026-02-30",now),null);
  assert.equal(D.rows(source,"half",now)[2].tenureMonths,null);
});
test("名錄人數與姓名契約錯誤要停止，不可靜默缺人",()=>{
  const source=snapshot();source.summary.totalMembers=4;assert.throws(()=>D.rows(source),/人數不一致/);
  source.summary.totalMembers=3;source.members[1].name="測 試 甲";assert.throws(()=>D.rows(source),/姓名缺漏或重複/);
});
test("偏好只保存已知欄位、排序與期間，不保存個人資料或搜尋條件",()=>{
  assert.deepEqual(D.preferences({period:"month:2026-08",columns:["email","oneToOne","oneToOne"],sort:"phone",direction:"desc",search:"測試甲",members:snapshot().members}),{period:"month:2026-08",columns:["name","oneToOne"],sort:"expiryDate",direction:"desc"});
});
test("單月只覆蓋活動數字，不改會籍；當月缺名為缺資料，且拒绝錯月",()=>{
  const source=snapshot(),data={schema:"fulian.partner-reports.v1",month:"2026-08",period:{start:"2026-08-01",end:"2026-08-31"},members:[{name:"測 試 甲",metrics:metrics(1)}]};
  const merged=D.withMonth(source,data,"2026-08"),rows=D.rows(merged,"month:2026-08",now);
  assert.equal(rows[0].oneToOne,1);assert.equal(rows[1].oneToOne,null);assert.equal(rows[0].expiryDate,"2026-09-30");
  assert.equal(D.rows(merged,"half",now)[0].oneToOne,12);assert.equal(source.members[0].monthlyMetrics,undefined);
  assert.throws(()=>D.withMonth(source,data,"2026-07"),/期間不相容/);
});

const row=(id,imported_at,start="2026-08-01",end="2026-08-31")=>({id,imported_at,period_start:start,period_end:end,report_type:"monthly_palms",storage_path:"private-path",metadata:{originalFilename:"private-filename"}});
const cell=value=>`<Cell><Data>${value}</Data></Cell>`;
const xml=(names=["測試甲","歷史乙"])=>`<Workbook><Table><Row>${cell("從:")}${cell("2026-08-01T00:00:00")}</Row><Row>${cell("至:")}${cell("2026-08-31T00:00:00")}</Row><Row>${cell("姓氏")}${cell("名字")}</Row>${names.map(name=>`<Row>${cell(name)}<Cell ss:Index="18"><Data>9</Data></Cell></Row>`).join("")}</Table></Workbook>`;
test("單月清單依實際報表起訖及最新匯入版本，不列假月份或洩漏私密路徑",()=>{
  const catalog=monthlyReportCatalog([row("old","2026-09-01"),row("new","2026-09-03"),row("bad","2026-09-05","2026-08-01","2026-08-30"),row("bad-month","2026-09-06","2026-13-01","2026-13-31")]);
  assert.deepEqual(catalog,[{month:"2026-08",period:{start:"2026-08-01",end:"2026-08-31"},importedAt:"2026-09-03",sourceId:"new"}]);
  assert.doesNotMatch(JSON.stringify(catalog),/private-/);
});
test("單月端點先驗權限及方法，再讀檔；只回傳本期名錄的白名單數據",async()=>{
  let readCount=0;
  const api=createPartnerReportsApi({getImports:async()=>[row("one","2026-09-03")],downloadReport:async()=>{readCount++;return xml()},getRoster:async()=>["測試甲","測試丙"]});
  const url=new URL("https://example.invalid/api/partner-reports?month=2026-08");
  await assert.rejects(api({method:"GET"},url,{role:"guest"}),error=>error.status===403);
  await assert.rejects(api({method:"POST"},url,{role:"vp"}),error=>error.status===405);
  assert.equal(readCount,0);
  for(const role of ["vp","committee","admin"]){
    const data=await api({method:"GET"},url,{role});
    assert.equal(data.members.length,1);assert.equal(data.members[0].metrics.oneToOne,9);assert.equal(data.reportOnlyCount,1);
    assert.deepEqual(Object.keys(data.members[0]),["name","metrics"]);
    assert.doesNotMatch(JSON.stringify(data),/private-|歷史乙/);
  }
  await assert.rejects(api({method:"GET"},new URL("https://example.invalid/?month=2026-07"),{role:"vp"}),error=>error.status===404);
  await assert.rejects(api({method:"GET"},new URL("https://example.invalid/?month=2026-99"),{role:"vp"}),error=>error.status===400);
});
test("單月索引與實際期間或姓名矛盾時停止，不返回錯誤數字",async()=>{
  const build=(imports,content)=>createPartnerReportsApi({getImports:async()=>imports,downloadReport:async()=>content,getRoster:async()=>["測試甲"]});
  const url=new URL("https://example.invalid/?month=2026-08");
  await assert.rejects(build([row("one","2026-09-03")],xml().replaceAll("2026-08","2026-07"))({method:"GET"},url,{role:"vp"}),/期間不一致/);
  await assert.rejects(build([row("one","2026-09-03")],xml(["測試甲","測 試 甲"]))({method:"GET"},url,{role:"vp"}),/姓名缺漏或重複/);
});

test("多選夥伴採聯集，再套用活動篩選，沒有選人時顯示全部",()=>{
  const rows=D.rows(snapshot(),"half",now);
  assert.deepEqual(D.query(rows,{selected:["測試甲","測 試 乙"],metric:"oneToOne",max:"5"}).map(r=>r.name),["測試乙"]);
  assert.equal(D.query(rows,{selected:[]}).length,3);
  assert.deepEqual(D.preferences().columns,["name","oneToOne","given","received","visitors","education","amount"]);
});
const E=require("../core/partner-export-domain.js");
test("匯出只包含所選欄位與已排序結果，保留期間條件、零及缺資料",()=>{
  const model=E.build({columns:[D.columns[0],D.columns.find(c=>c.key==="visitors")],rows:[["測試乙","0"],["測試甲","尚無資料"]],meta:["一年 PALMS：2025-09-01 至 2026-08-31","來賓：0–3 位"]});
  assert.match(model.text,/2025-09-01 至 2026-08-31/);assert.match(model.text,/來賓：0–3 位/);
  assert.ok(model.text.indexOf("測試乙")<model.text.indexOf("測試甲"));assert.match(model.text,/來賓（位）：0/);
  assert.doesNotMatch(model.text,/專業別|會籍到期日|undefined/);assert.equal(model.pages.length,1);
  assert.throws(()=>E.build({columns:[D.columns[0]],rows:[]}),/沒有可匯出/);
});
test("長名單與寬表格自動分頁，所有欄位和每位姓名都保留",()=>{
  const columns=D.columns.slice(0,15),rows=Array.from({length:35},(_,r)=>columns.map((c,i)=>i?String(r*100+i):`測試${r}`));
  const model=E.build({columns,rows});assert.equal(model.pages.length,9);
  assert.ok(model.pages.every(p=>p.columns[0].key==="name"&&p.rows.length<=16&&p.columns.length<=7));
  for(let row=0;row<35;row++)for(let col=1;col<15;col++)assert.ok(model.pages.some(p=>p.columns.some(c=>c.key===columns[col].key)&&p.rows.some(r=>r[0]===`測試${row}`&&r.includes(String(row*100+col)))));
});
