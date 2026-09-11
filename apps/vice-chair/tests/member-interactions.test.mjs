import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {buildMemberInteractions,interactionCoverage,interactionMonthCatalog,selectInteractionReports} from "../../bni-analysis/engine/member-interactions.mjs";
import {createMemberInteractionsApi} from "../services/member-interactions.mjs";

const now=new Date("2026-09-11T16:00:00Z");
const weeks=["2026-08-04","2026-08-11","2026-08-18","2026-08-25"];
const row=(week,id=week,imported="2026-09-01T00:00:00Z")=>({id,report_type:"audit",period_start:week,period_end:week,imported_at:imported,sha256:"a".repeat(64)});
const event=(from,to,type="一對一會面",extra={})=>({from,to,type,inOut:"",detail:"",...extra});
const xml=(week,events=[])=>{
  const cell=value=>`<Cell><Data>${value}</Data></Cell>`;
  const date=week.split("-").reverse().join("/");
  return `<Workbook><Table><Row>${cell(`審計報告 爲了 ${date}`)}</Row><Row>${["自","至","","事件類型","","內部/外部","交易總額","","分會教育單位學分","詳細資料"].map(cell).join("")}</Row>${events.map(e=>`<Row>${[e.from,e.to,"",e.type,"",e.inOut,"","","",e.detail].map(cell).join("")}</Row>`).join("")}</Table></Workbook>`;
};
const source=(week,events=[],id=week)=>{
  const content=xml(week,events);
  return {...row(week,id),sha256:createHash("sha256").update(content).digest("hex"),content};
};
const url=(member="測試甲",month="2026-08")=>new URL("https://example.invalid/api/member-interactions?"+new URLSearchParams({member,month}));
function apiFor(sources,options={}){
  return createMemberInteractionsApi({getImports:async()=>sources,downloadReport:async row=>row.content,getRoster:async()=>["測試甲","測試乙"],now:()=>now,...options});
}

test("同週重傳只採最新版本；重複檔不能補缺週，同時刻矛盾版本必須停止",()=>{
  const reports=selectInteractionReports([row(weeks[0],"old"),row(weeks[0],"new","2026-09-02"),row(weeks[1])]);
  assert.equal(reports.length,2);assert.equal(reports.find(r=>r.period_start===weeks[0]).id,"new");
  const catalog=interactionMonthCatalog(reports,now);
  assert.equal(catalog[0].status,"partial");assert.deepEqual(catalog[0].missingWeeks,weeks.slice(2));
  assert.throws(()=>selectInteractionReports([row(weeks[0],"one"),{...row(weeks[0],"two"),sha256:"b".repeat(64)}]),/版本不明/);
  assert.throws(()=>selectInteractionReports([row("2026-02-30")]),/日期缺漏/);
});

test("完整月份要逐週齊全且月份已結束；台北日界、五週月及改期皆明示",()=>{
  assert.equal(interactionCoverage("2026-08",weeks,new Date("2026-08-31T15:59:59Z")).status,"ongoing");
  assert.equal(interactionCoverage("2026-08",weeks,new Date("2026-08-31T16:00:00Z")).status,"complete");
  assert.equal(interactionCoverage("2026-09",[],now).expectedWeeks.length,5);
  assert.equal(interactionCoverage("2026-08",[],now).status,"unavailable");
  assert.deepEqual(interactionCoverage("2026-08",[...weeks,"2026-08-26"],now).extraWeeks,["2026-08-26"]);
  assert.equal(interactionCoverage("2026-08",[...weeks,"2026-08-26"],now).status,"partial");
});

test("一對一查雙向並保留每筆 slip；引薦分給出與收到，只返回目標會員的白名單欄位",()=>{
  const events=[event("測 試 甲","跨分會乙","一對一會面",{detail:"對方分會：測試分會",amount:999}),event("跨分會乙","測試甲"),event("測試甲","跨分會乙"),
    event("測試甲","測試丙","引薦",{inOut:"二級(外部)"}),event("測試丁","測試甲","引薦",{inOut:"一級(內部)"}),
    event("無關甲","無關乙"),event("測試甲","來賓乙","來賓"),event("測試甲","測試甲")];
  const result=buildMemberInteractions({name:"測試甲",month:"2026-08",reports:[{week:weeks[0],events}],now});
  assert.deepEqual(result.summary,{oneToOne:4,given:1,received:1,counterpartCount:3});
  assert.equal(result.events.length,6);assert.equal(result.events.filter(e=>e.direction==="incoming").length,2);
  assert.ok(result.events.some(e=>e.chapterNote==="對方分會：測試分會"));
  assert.doesNotMatch(JSON.stringify(result),/999|amount|無關甲|來賓乙/);
  assert.throws(()=>buildMemberInteractions({name:"測試甲",month:"2026-07",reports:[{week:weeks[0],events}],now}),/月份不一致/);
});

test("未授權、非 GET、錯月份或非名錄會員，在任何檔案讀取前拒絕",async()=>{
  let reads=0;
  const api=apiFor([source(weeks[0])],{downloadReport:async()=>{reads++;throw Error("unexpected read")}});
  await assert.rejects(api({method:"GET"},url(),{role:"guest"}),e=>e.status===403);
  await assert.rejects(api({method:"POST"},url(),{role:"vp"}),e=>e.status===405);
  await assert.rejects(api({method:"GET"},url("測試甲","2026-13"),{role:"vp"}),e=>e.status===400);
  await assert.rejects(api({method:"GET"},url("陌生甲"),{role:"vp"}),e=>e.status===404);
  await assert.rejects(api({method:"GET"},url("測試甲","2026-07"),{role:"vp"}),e=>e.status===404);
  assert.equal(reads,0);
});

test("三角色只取得指定會員事件；同週舊版不重計，空月份不冒充零",async()=>{
  const sources=weeks.map(week=>source(week,[event("測試甲","測試乙"),event("無關甲","無關乙")]));
  const old={...source(weeks[0],[event("測試甲","舊版乙")],"old"),imported_at:"2026-08-01"};
  const api=apiFor([...sources,old]);
  for(const role of ["vp","committee","admin"]){
    const data=await api({method:"GET"},url(),{role});
    assert.equal(data.coverage.status,"complete");assert.equal(data.events.length,4);
    assert.doesNotMatch(JSON.stringify(data),/舊版乙|無關甲|sha256|storage_path|content/);
  }
  const empty=await apiFor([])({method:"GET"},url("測試甲",""),{role:"vp"});
  assert.equal(empty.summary,null);assert.equal(empty.month,null);assert.equal(empty.coverage,null);
  const zero=await apiFor(weeks.map(week=>source(week)))({method:"GET"},url(),{role:"vp"});
  assert.equal(zero.coverage.status,"complete");assert.equal(zero.summary.oneToOne,0);
});

test("檔案指紋、索引週次與報表不合時不回傳部分統計；以原始 bytes 核對含 BOM XML",async()=>{
  const original=source(weeks[0],[event("測試甲","測試乙")]);
  await assert.rejects(apiFor([{...original,content:original.content+" "}])({method:"GET"},url(),{role:"vp"}),/指紋不一致/);
  await assert.rejects(apiFor([{...original,sha256:null}])({method:"GET"},url(),{role:"vp"}),/完整性指紋/);
  await assert.rejects(apiFor([{...original,period_start:weeks[1],period_end:weeks[1]}])({method:"GET"},url(),{role:"vp"}),/索引週次不一致/);
  const bytes=Buffer.from("\uFEFF"+original.content),bom={...original,content:bytes,sha256:createHash("sha256").update(bytes).digest("hex")};
  assert.equal((await apiFor([bom])({method:"GET"},url(),{role:"vp"})).summary.oneToOne,1);
  await assert.rejects(apiFor([original],{downloadReport:async()=>{throw Error("讀取失敗")}})({method:"GET"},url(),{role:"vp"}),/讀取失敗/);
});
