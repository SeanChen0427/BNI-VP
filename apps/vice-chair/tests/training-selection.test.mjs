import test from "node:test";
import assert from "node:assert/strict";
import domain from "../core/training-selection-domain.js";

const event={id:11,title:"MSP（上）",start_at:"2026-12-31T16:30:00.000Z",end_at:"2026-12-31T18:00:00.000Z",category:"msp_up",source_status:"published"};
test("選課依類別及開始時間篩選，跨年度仍可選，已缺漏或已開始場次不提供新選擇",()=>{
  const rows=[event,{...event,id:12,start_at:"2026-12-20T05:30:00.000Z"},{...event,id:13,category:"msp_down"},{...event,id:14,source_status:"missing"}];
  assert.deepEqual(domain.options(rows,"msp_up",new Date("2026-12-19T00:00:00Z")).map(e=>e.id),[12,11]);
  assert.deepEqual(domain.options(rows,"msp_up",new Date(event.start_at)),[]);
});
test("草稿保存場次快照，台北日期吻合才恢復；舊手填日期不被推測成官方選課",()=>{
  const saved=domain.snapshot(event);
  assert.deepEqual(domain.restore(JSON.parse(JSON.stringify(saved)),"msp_up","2027-01-01"),saved);
  assert.equal(domain.restore(saved,"msp_up","2026-12-31"),null);
  assert.equal(domain.restore(saved,"msp_down","2027-01-01"),null);
  assert.equal(domain.restore(undefined,"msp_up","2027-01-01"),null);
  assert.equal(domain.snapshot({...event,start_at:"invalid"}),null);
});
test("官方改期、改名、缺漏及恢復可辨識，但不修改原先保存的場次",()=>{
  const saved=domain.snapshot(event),before=JSON.stringify(saved);
  for(const change of [{title:"MSP（上）新名稱"},{start_at:"2027-01-10T00:30:00.000Z"},{end_at:"2026-12-31T19:00:00.000Z"}]){
    assert.equal(domain.status(saved,[{...event,...change}]).kind,"changed");
    assert.equal(JSON.stringify(saved),before);
  }
  assert.equal(domain.status(saved,[]).kind,"missing");
  assert.equal(domain.status(saved,[{...event,source_status:"missing"}]).kind,"missing");
  assert.equal(domain.status(saved,[event]).kind,"current");
});
