import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire, stripTypeScriptTypes } from "node:module";
import test from "node:test";
const require=createRequire(import.meta.url),domain=require("../core/monthly-meeting-domain.js"),caseDomain=require("../core/case-domain.js");
const edgeSource=fs.readFileSync(new URL("../../../supabase/functions/app-api/index.ts",import.meta.url),"utf8");
const start=edgeSource.indexOf('const MONTHLY_FOLLOW_UP_DISPOSITION'),end=edgeSource.indexOf('function monthlyCareTaskReference',start);
const edge={};vm.createContext(edge);vm.runInContext(stripTypeScriptTypes(edgeSource.slice(start,end)),edge);

for(const taskType of ["special","midterm"]){
  test(`${taskType} 不安排關懷在前後端皆可結案，恢復追蹤後仍需分工`,()=>{
    const input={taskType,disposition:"no_follow_up",assignmentRequired:true,owner:"委員甲",companion:"委員甲",dueDate:"2026-09-09",taskId:"task-test",taskDeleted:true,syncMissing:true};
    assert.equal(domain.isValidCareDisposition(input),true);
    assert.equal(edge.isValidMonthlyCareDisposition(input),true);
    const normalized=domain.normalizeCareItem(input),server=edge.normalizeMonthlyCareItems([input])[0];
    assert.deepEqual(JSON.parse(JSON.stringify(server)),normalized);
    assert.equal(normalized.state,"done");assert.equal(normalized.taskId,"task-test");
    assert.deepEqual(domain.missingCareAssignments([normalized]),[]);
    assert.equal(domain.hasCareAssignmentConflict([normalized]),false);
    assert.equal(edge.monthlyCareRequiresAssignment(normalized),false);
    const resumed={...normalized,disposition:"follow_up"};
    assert.equal(domain.requiresCareAssignment(resumed),true);
    assert.equal(edge.monthlyCareRequiresAssignment(resumed),true);
    assert.equal(domain.missingCareAssignments([resumed]).length,1);
    assert.equal(domain.isValidCareDisposition({...input,decisionAmendments:[{}]}),false);
  });
}
test("不安排關懷不能冒用於續約或其他案件類型",()=>{
  for(const taskType of ["renewal","new","departure","unknown"]){
    const input={taskType,disposition:"no_follow_up"};
    assert.equal(domain.isValidCareDisposition(input),false);
    assert.equal(edge.isValidMonthlyCareDisposition(input),false);
  }
});

function pageFixture(){
  const storage=new Map(),context={
    document:{querySelector:()=>({value:"2026-08"})},
    FulianAuth:{getSession:()=>({role:"vp",name:"測試副主席"})},
    FulianCaseDomain:caseDomain,FulianMonthlyMeetingDomain:domain,
    localStorage:{getItem:key=>storage.get(key)||null,setItem:()=>{throw new Error("unexpected task mutation")}},
    window:{FulianCalendarDomain:{daysUntil:()=>10},FulianTaskStore:{remove:()=>{throw new Error("unexpected task delete")}}}
  };
  const source=fs.readFileSync(new URL("../assets/js/monthly-meeting.js",import.meta.url),"utf8").replace('  init();','  globalThis.fixture={dashboardCareItems,careMembersText,syncCareTask,careAssignmentControls,setSnapshot:value=>snapshot=value};');
  vm.createContext(context);vm.runInContext(source,context);
  return{...context.fixture,storage};
}
test("重讀儀表板或原提示消失後，仍保留不關懷決議、備註與原工作",async()=>{
  const page=pageFixture();page.setSnapshot({sections:[{title:"燈號關懷",cards:[{title:"測試會員",detail:"需追蹤",action:"安排面談"}]}]});
  const context={taskIds:["task-test"],completedTaskIds:[],taskCareMembers:[]};
  const original=page.dashboardCareItems(context)[0],saved={...original,disposition:"no_follow_up",note:"已表明不續約",taskId:"task-test"};
  for(const hasCard of [true,false]){
    if(!hasCard)page.setSnapshot({sections:[]});
    const refreshed=page.dashboardCareItems(context,[saved]);
    assert.equal(refreshed.length,1);assert.equal(refreshed[0].disposition,"no_follow_up");
    assert.equal(refreshed[0].taskId,"task-test");assert.equal(refreshed[0].note,saved.note);
    assert.match(page.careMembersText(refreshed),/會議決議：不安排關懷/);
    assert.doesNotMatch(page.careMembersText(refreshed),/建議：安排面談/);
  }
  page.storage.set(caseDomain.TASK_STORAGE_KEY,JSON.stringify([{id:"task-test",member:"測試會員",type:"special",completed:false}]));
  assert.equal(await page.syncCareTask(saved),"existing");
  assert.equal(saved.taskId,"task-test");
  page.storage.clear();assert.equal(await page.syncCareTask({...saved}),null);
  assert.match(page.careAssignmentControls(saved,[]),/value="no_follow_up"/);
  assert.doesNotMatch(page.careAssignmentControls(saved,[]),/data-field="owner"/);
  assert.match(page.careAssignmentControls({...saved,disposition:"follow_up"},[]),/data-field="owner"/);
});

test("正式月會 API 可保存不關懷並結案，不產生或刪除工作；恢復追蹤缺分工時拒絕結案",async()=>{
  const writes=[];
  const context={
    requestBody:request=>request.json(),leadership:()=>{},meetingToApi:row=>row,
    renewalFoundationsApi:{snapshot:async()=>({items:[]})},
    db:async(path,options={})=>{
      if(path.startsWith("app_settings?"))return[];
      if(path.startsWith("people?"))return[{id:"vp-test",display_name:"測試副主席"}];
      if(path.startsWith("committee_meetings?meeting_month="))return[];
      if(path==="committee_meetings?on_conflict=meeting_month"){
        const row=JSON.parse(options.body);writes.push(row);return[row];
      }
      throw new Error(`Unexpected database access: ${path}`);
    }
  };
  vm.createContext(context);
  vm.runInContext(stripTypeScriptTypes(edgeSource.slice(start,edgeSource.indexOf('function normalizedIdentityPart',start))),context);
  const record={id:"meeting-2026-09",meetingMonth:"2026-09",meetingDate:"2026-09-08",reportMonth:"2026-08",recorder:"測試副主席",status:"final",care:{items:[{id:"care-test",taskType:"special",member:"測試會員",disposition:"no_follow_up",assignmentRequired:true,taskId:"existing-task",owner:"",dueDate:"",note:"已表明不續約"}]}};
  const call=value=>context.committeeMeetingsApi(new Request('https://test/api',{method:"POST",body:JSON.stringify({record:value})}),{role:"vp",name:"測試副主席",identity:"vp:測試副主席",personId:"vp-test"});
  await call(record);
  assert.equal(writes.length,1);assert.equal(writes[0].status,"final");
  assert.equal(writes[0].care_summary.items[0].taskId,"existing-task");
  assert.equal(writes[0].care_summary.items[0].state,"done");
  await assert.rejects(call({...record,care:{items:[{...record.care.items[0],disposition:"follow_up"}]}}),/都必須完成追蹤委員與排定日期/);
  assert.equal(writes.length,1);
});
