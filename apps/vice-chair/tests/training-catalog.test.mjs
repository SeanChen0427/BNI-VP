import test from "node:test";
import assert from "node:assert/strict";
import domain from "../core/training-catalog-domain.js";
import {fetchOfficialEvents,syncTrainingCatalog,createTrainingCatalogApi} from "../../../supabase/functions/_shared/training-catalog-sync.mjs";

const source=(id=1,start="2026-12-20T13:30",title="MSP（下）（線上）")=>({id,title,description:title,start,end:start.slice(0,11)+"17:00",url:"eventdetails?eventId=test"});
const now=new Date("2026-12-01T01:00:00Z");
test("台北時間解析、跨年同步與 12 月的下個月",()=>{
  assert.deepEqual(domain.syncYears(new Date("2026-12-31T16:01:00Z")),[2027,2028]);
  assert.equal(domain.parseEvents([source()],2026)[0].start_at,"2026-12-20T05:30:00.000Z");
  assert.equal(domain.range("next-month",now).start,"2027-01-01");
  assert.equal(domain.range("upcoming",now).end,"2027-12-01");
});
test("全年、月份、自訂日期含末日，課名兼容全半形與空格",()=>{
  const events=[...domain.parseEvents([source()],2026),...domain.parseEvents([source(2,"2027-01-20T13:30"),source(3,"2027-06-20T13:30","一對一工作坊")],2027)];
  assert.deepEqual(domain.filterEvents(events,{query:"msp 下",now}).map(x=>x.id),[1,2]);
  assert.deepEqual(domain.filterEvents(events,{mode:"next-month",query:"ＭＳＰ（下）",now}).map(x=>x.id),[2]);
  assert.equal(domain.filterEvents(events,{mode:"next-year",now}).length,2);
  assert.equal(domain.filterEvents(events,{mode:"custom",from:"2026-12-20",through:"2026-12-20",now}).length,1);
  assert.equal(domain.filterEvents(events,{mode:"month",month:"2027-06",category:"workshop",now}).length,1);
  assert.equal(domain.range("custom",now,"","2026-02-30","2026-03-02"),null);
  assert.equal(domain.range("custom",now,"","2026-12-31","2026-12-01"),null);
});
test("拒絕重複 ID、無效日期、錯年度與不安全官方連結，允許未公布年度空陣列",()=>{
  for(const payload of [[source(),source()],[{...source(),start:"2026-02-30T13:30"}],[source(2,"2027-01-20T13:30")],[{...source(),url:"javascript:alert(1)"}],[{...source(),url:"https://example.com/"}],{error:"offline"}])assert.throws(()=>domain.parseEvents(payload,2026));
  assert.deepEqual(domain.parseEvents([],2027),[]);
});
test("請求固定官方來源，讀取失敗只重試一次",async()=>{
  let attempts=0;
  await assert.rejects(fetchOfficialEvents(2026,{fetchImpl:async url=>{attempts++;assert.ok(url.startsWith("https://bnikaohsiung.com.tw/web/open/"));return new Response("offline",{status:503});}}));
  assert.equal(attempts,2);
});
test("兩年度都成功才一次提交，空的明年仍包含在同步範圍",async()=>{
  const calls=[];
  await syncTrainingCatalog({now,db:async(path,options)=>{calls.push([path,JSON.parse(options.body)]);if(path.includes("claim"))return "token";return {received:1};},fetchImpl:async url=>new Response(JSON.stringify(url.includes("start=2026")?[source()]:[]))});
  assert.equal(calls.length,2);assert.deepEqual(calls[1][1].p_years,[2026,2027]);assert.equal(calls[1][1].p_records.length,1);
});
test("單一年度失敗不部分提交，租約不成功就不讀取官網",async()=>{
  const calls=[];
  await assert.rejects(syncTrainingCatalog({now,db:async path=>{calls.push(path);return path.includes("claim")?"token":null;},fetchImpl:async url=>url.includes("start=2026")?new Response(JSON.stringify([source()])):new Response("bad",{status:503})}));
  assert.deepEqual(calls,["rpc/edge_claim_training_sync","rpc/edge_fail_training_sync"]);
  const result=await syncTrainingCatalog({db:async()=>null,fetchImpl:()=>{throw new Error("must not fetch");}});assert.equal(result.skipped,true);
});
test("委員只能查詢；副主席可更新；API 完整分頁",async()=>{
  let syncs=0;
  const api=createTrainingCatalogApi({db:async path=>path.startsWith("training_events?")?(path.includes("offset=0")?Array.from({length:1000},(_,id)=>({id})): [{id:1001}]):[],sync:async()=>{syncs++;return {};}});
  const post=()=>new Request("https://test/api/training-catalog",{method:"POST",body:JSON.stringify({action:"sync"})});
  await assert.rejects(api(post(),{role:"committee"}),{status:403});assert.equal(syncs,0);
  const data=await api(new Request("https://test/api/training-catalog"),{role:"committee"});assert.equal(data.events.length,1001);assert.equal(data.canSync,false);
  assert.equal((await api(post(),{role:"vp"})).canSync,true);assert.equal(syncs,1);
});
