import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../core/onboarding-domain.js",import.meta.url),"utf8");
const context={window:{}};
vm.runInNewContext(source,context,{filename:"onboarding-domain.js"});
const domain=context.window.FulianOnboardingDomain;

function memoryStorage(){
  const values=new Map();
  return{
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    values
  };
}

test("導覽身份接受副主席、會員委員與公開填寫者，Admin 完全不建立導覽",()=>{
  const vp=domain.identityFromSession({role:"vp",name:"測試副主席",userId:"shared-vp"});
  const memberA=domain.identityFromSession({role:"committee",name:"測試委員甲",userId:"shared-committee"});
  const memberB=domain.identityFromSession({role:"committee",name:"測試委員乙",userId:"shared-committee"});
  assert.equal(vp.role,"vp");
  assert.equal(memberA.role,"committee");
  assert.notEqual(memberA.key,memberB.key);
  assert.doesNotMatch(memberA.key,/測試委員甲/);
  assert.equal(domain.identityFromSession({role:"public",name:"公開填寫者",userId:"public"}).role,"public");
  assert.equal(domain.identityFromSession({role:"admin",name:"系統開發人員 Admin",userId:"admin"}),null);
});

test("姓名、角色與教學版本各自隔離進度",()=>{
  const storage=memoryStorage();
  const identity=domain.identityFromSession({role:"committee",name:"測試委員甲",userId:"shared"});
  let progress=domain.readProgress(storage,identity);
  assert.equal(domain.guideState(progress,"page:index","1.0.0").status,"not_started");
  assert.equal(domain.shouldAutoStart(progress,"page:index","1.0.0"),true);

  progress=domain.updateGuide(progress,identity,"page:index","1.0.0",{status:"in_progress",currentStep:7},"2026-09-05T10:00:00.000Z");
  domain.writeProgress(storage,identity,progress);
  const restored=domain.readProgress(storage,identity);
  assert.equal(domain.guideState(restored,"page:index","1.0.0").currentStep,7);

  progress=domain.updateGuide(restored,identity,"page:index","1.0.0",{status:"completed",currentStep:12},"2026-09-05T10:05:00.000Z");
  assert.equal(domain.shouldAutoStart(progress,"page:index","1.0.0"),false);
  assert.equal(domain.shouldAutoStart(progress,"page:index","1.1.0"),true);
  assert.equal(domain.guideState(progress,"page:index","1.1.0").status,"not_started");
});

test("稍後再看只在本工作階段抑制自動開啟，略過則保存狀態",()=>{
  const identity=domain.identityFromSession({role:"vp",name:"測試副主席",userId:"vp"});
  let progress=domain.emptyProgress(identity);
  assert.equal(domain.shouldAutoStart(progress,"global-shell","1.0.0",true),false);
  progress=domain.updateGuide(progress,identity,"global-shell","1.0.0",{status:"skipped",currentStep:2});
  assert.equal(domain.shouldAutoStart(progress,"global-shell","1.0.0",false),false);
});

test("續看步驟永遠限制在目前教學的有效範圍",()=>{
  assert.equal(domain.clampStep(-5,10),0);
  assert.equal(domain.clampStep(4,10),4);
  assert.equal(domain.clampStep(99,10),9);
  assert.equal(domain.clampStep(5,0),0);
});

test("損壞或跨身份的本機資料會安全回到未開始",()=>{
  const storage=memoryStorage();
  const identity=domain.identityFromSession({role:"committee",name:"測試委員",userId:"shared"});
  storage.setItem(domain.storageKey(identity),"{broken");
  assert.deepEqual(JSON.parse(JSON.stringify(domain.readProgress(storage,identity).guides)),{});
  storage.setItem(domain.storageKey(identity),JSON.stringify({identityKey:"someone-else",guides:{"page:index":{status:"completed",version:"1.0.0"}}}));
  assert.equal(domain.guideState(domain.readProgress(storage,identity),"page:index","1.0.0").status,"not_started");
});

test("首次記錄與同角色續任都不重播換屆差異導覽",()=>{
  const storage=memoryStorage();
  const identity=domain.identityFromSession({role:"committee",name:"同屆委員",userId:"committee-account"});
  const first=domain.prepareRoleExperience(storage,identity,"2026-09-06T01:00:00.000Z");
  assert.equal(first.pending,null);
  assert.equal(domain.readRoleHistory(storage,identity).lastRole,"committee");

  const retained=domain.identityFromSession({role:"committee",name:"同屆委員",userId:"committee-account"});
  const nextTerm=domain.prepareRoleExperience(storage,retained,"2026-10-01T00:00:00.000Z");
  assert.equal(nextTerm.pending,null);
});

test("角色改變只建立一次差異導覽，並沿用共同頁面的完成紀錄",()=>{
  const storage=memoryStorage();
  const name="換屆測試人員";
  const vp=domain.identityFromSession({role:"vp",name,userId:"vp-account"});
  domain.prepareRoleExperience(storage,vp,"2026-09-06T01:00:00.000Z");
  let vpProgress=domain.readProgress(storage,vp);
  vpProgress=domain.updateGuide(vpProgress,vp,"global-shell","1.0.0",{status:"completed",currentStep:29},"2026-09-06T01:05:00.000Z");
  vpProgress=domain.updateGuide(vpProgress,vp,"page:index","1.0.0",{status:"completed",currentStep:20},"2026-09-06T01:06:00.000Z");
  vpProgress=domain.updateGuide(vpProgress,vp,"page:attendance","1.0.1",{status:"skipped",currentStep:2},"2026-09-06T01:07:00.000Z");
  vpProgress=domain.updateGuide(vpProgress,vp,"page:case-board","1.0.1",{status:"in_progress",currentStep:4},"2026-09-06T01:08:00.000Z");
  domain.writeProgress(storage,vp,vpProgress);

  const committee=domain.identityFromSession({role:"committee",name,userId:"committee-account"});
  const changed=domain.prepareRoleExperience(storage,committee,"2026-10-01T00:00:00.000Z");
  assert.equal(changed.pending.fromRole,"vp");
  assert.equal(changed.pending.toRole,"committee");
  assert.equal(changed.pending.guideId,"role-transition:committee");
  assert.equal(changed.inheritedCount,2);
  assert.equal(domain.guideState(changed.progress,"page:index","1.0.0").status,"completed");
  assert.equal(domain.guideState(changed.progress,"page:attendance","1.0.1").status,"skipped");
  assert.equal(domain.guideState(changed.progress,"page:case-board","1.0.1").status,"not_started");
  assert.equal(domain.guideState(changed.progress,"global-shell","1.0.0").status,"not_started");

  const reload=domain.prepareRoleExperience(storage,committee,"2026-10-01T00:01:00.000Z");
  assert.equal(reload.pending.guideId,"role-transition:committee");
  assert.equal(reload.inheritedCount,0);

  const finished=domain.finishRoleTransition(storage,committee,"completed","1.0.0","2026-10-01T00:05:00.000Z");
  assert.equal(finished.pending,null);
  assert.equal(domain.pendingRoleTransition(storage,committee),null);
  assert.equal(domain.guideState(finished.progress,"global-shell","1.0.0").status,"completed");
  assert.equal(domain.prepareRoleExperience(storage,committee,"2026-10-01T00:06:00.000Z").pending,null);

  const historyKey=domain.roleHistoryKey(committee);
  assert.doesNotMatch(historyKey,/換屆測試人員/);
  assert.doesNotMatch(storage.getItem(historyKey),/換屆測試人員/);
});

test("未完成舊角色全站教學時，新角色仍走完整新手導覽",()=>{
  const storage=memoryStorage();
  const name="尚未看完者";
  const committee=domain.identityFromSession({role:"committee",name,userId:"committee-account"});
  domain.prepareRoleExperience(storage,committee,"2026-09-06T01:00:00.000Z");
  let progress=domain.readProgress(storage,committee);
  progress=domain.updateGuide(progress,committee,"global-shell","1.0.0",{status:"skipped",currentStep:1},"2026-09-06T01:01:00.000Z");
  domain.writeProgress(storage,committee,progress);

  const vp=domain.identityFromSession({role:"vp",name,userId:"vp-account"});
  const changed=domain.prepareRoleExperience(storage,vp,"2026-10-01T00:00:00.000Z");
  assert.equal(changed.pending,null);
  assert.equal(domain.shouldAutoStart(changed.progress,"global-shell","1.0.0"),true);
});
