import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const root=new URL("../",import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),"utf8");
const index=read("index.html");
const login=read("login.html");
const loginScript=read("assets/js/login.js");
const guideScript=read("assets/js/onboarding-guides.js");
const pageGuideScript=read("assets/js/onboarding-page-guides.js");
const publicGuideScript=read("assets/js/onboarding-public-guides.js");
const publicBootstrap=read("assets/js/onboarding-public-bootstrap.js");
const engine=read("assets/js/onboarding.js");
const styles=read("assets/css/onboarding.css");
const planner=read("assets/js/work-planner.js");
const workspaceNav=read("assets/js/workspace-nav.js");
const course=read("course.html");
const monthlyMeeting=read("monthly-meeting.html");
const publicFeedback=read("public-feedback.html");
const publicVote=read("public-vote.html");

const guideContext={window:{matchMedia:()=>({matches:false})}};
vm.runInNewContext(guideScript,guideContext,{filename:"onboarding-guides.js"});
vm.runInNewContext(pageGuideScript,guideContext,{filename:"onboarding-page-guides.js"});
vm.runInNewContext(publicGuideScript,guideContext,{filename:"onboarding-public-guides.js"});
const catalog=guideContext.window.FulianOnboardingGuides;

test("首頁載入共用領域、角色教學、專屬樣式與導覽引擎",()=>{
  assert.match(index,/core\/onboarding-domain\.js\?v=3/);
  assert.match(index,/assets\/js\/onboarding-guides\.js\?v=5/);
  assert.match(index,/assets\/js\/onboarding\.js\?v=9/);
  assert.match(index,/assets\/css\/onboarding\.css\?v=7/);
  assert.match(index,/data-guide-page="page:index"/);
});

test("副主席與委員取得不同步驟，Admin 沒有任何版本",()=>{
  const vpShell=catalog.getGuide("global-shell","vp");
  const committeeShell=catalog.getGuide("global-shell","committee");
  const vpHome=catalog.getGuide("page:index","vp");
  const committeeHome=catalog.getGuide("page:index","committee");
  assert.ok(vpShell.steps.length>committeeShell.steps.length);
  assert.ok(vpHome.steps.length>committeeHome.steps.length);
  assert.ok(vpShell.steps.some(step=>step.id==="reminders"));
  assert.ok(!committeeShell.steps.some(step=>step.id==="reminders"));
  assert.ok(vpHome.steps.some(step=>step.id==="monthly-data"));
  assert.ok(!committeeHome.steps.some(step=>step.id==="monthly-data"));
  assert.ok(committeeHome.steps.some(step=>step.id==="filter-assigned"));
  assert.ok(!vpHome.steps.some(step=>step.id==="filter-assigned"));
  assert.equal(catalog.getGuide("role-transition:vp","vp").steps.length,7);
  assert.equal(catalog.getGuide("role-transition:committee","committee").steps.length,4);
  assert.equal(catalog.getGuide("role-transition:vp","committee"),null);
  assert.equal(catalog.getGuide("role-transition:committee","vp"),null);
  assert.equal(catalog.getGuide("global-shell","admin"),null);
  assert.equal(catalog.getGuide("page:index","admin"),null);
  assert.equal(catalog.listGuides("admin").length,0);
});

test("完整導覽目錄具備固定版本、逐步文案與不重複識別",()=>{
  const expected={vp:{guides:22,steps:288},committee:{guides:16,steps:187},public:{guides:2,steps:14}};
  Object.entries(expected).forEach(([role,count])=>{
    const guides=catalog.listGuides(role);
    assert.equal(guides.length,count.guides,role+" 導覽數量不完整");
    assert.equal(guides.reduce((total,guide)=>total+guide.steps.length,0),count.steps,role+" 步驟數量不完整");
    guides.forEach(guide=>{
      assert.match(guide.version,/^\d+\.\d+\.\d+$/,guide.id+" 缺少有效版本");
      assert.ok(guide.intro?.title&&guide.intro?.description,guide.id+" 缺少導覽封面");
      assert.equal(new Set(guide.steps.map(step=>step.id)).size,guide.steps.length,guide.id+" 步驟識別重複");
      guide.steps.forEach(step=>{
        ["id","section","target","title","body"].forEach(field=>assert.ok(step[field],`${guide.id}/${step.id||"unknown"} 缺少 ${field}`));
      });
    });
  });
});

test("每個桌面導覽目標都有穩定 data-guide-id",()=>{
  const homeGuides=["global-shell","page:index","role-transition:vp","role-transition:committee"].flatMap(id=>["vp","committee"].map(role=>catalog.getGuide(id,role))).filter(Boolean);
  const targets=homeGuides.flatMap(guide=>guide.steps.map(step=>step.target));
  const ids=[...new Set(targets.map(selector=>selector.match(/data-guide-id=\\?"([^"\\]+)\\?"/)?.[1]).filter(Boolean))];
  const renderedSources=index+planner+engine;
  ids.forEach(id=>assert.match(renderedSources,new RegExp(`data-guide-id=\\\\?"${id.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\\\?"`),`缺少導覽目標 ${id}`));
});

test("所有登入後工作頁都有頁面導覽，並由共用選單載入同一套引擎",()=>{
  const workspacePages=[
    "accountability-emails","analysis-review","attendance","case-archive","case-board","case-workflow",
    "departure-form","industry-change-form","member-care","message-templates","midterm-form","monthly-meeting",
    "new-member-form","renewal-foundations","routine-reminders","settings","terminal-form","useful-links"
  ];
  workspacePages.forEach(name=>{
    const html=read(name+".html");
    assert.match(html,/assets\/js\/workspace-nav\.js\?v=15/,name+" 未載入最新版共用選單");
    assert.ok(catalog.getGuide("page:"+name,"vp")||catalog.getGuide("page:"+name,"committee"),name+" 缺少頁面導覽");
  });
  assert.match(workspaceNav,/onboarding-page-guides\.js/);
  assert.match(workspaceNav,/document\.body\.dataset\.guidePage/);
  assert.match(workspaceNav,/\["vp","committee"\]\.includes\(role\)/);
  assert.match(workspaceNav,/data\.guideId = "workspace\.menu"|dataset\.guideId = "workspace\.menu"/);
});

test("副主席與會員委員頁面內容依權限分流",()=>{
  const vpWorkflow=catalog.getGuide("page:case-workflow","vp");
  const committeeWorkflow=catalog.getGuide("page:case-workflow","committee");
  const vpSettings=catalog.getGuide("page:settings","vp");
  const committeeSettings=catalog.getGuide("page:settings","committee");
  assert.ok(vpWorkflow.steps.length>committeeWorkflow.steps.length);
  assert.ok(vpWorkflow.steps.some(step=>step.id==="close"));
  assert.ok(!committeeWorkflow.steps.some(step=>step.id==="close"));
  assert.ok(vpSettings.steps.some(step=>step.id==="departure"));
  assert.ok(!committeeSettings.steps.some(step=>step.id==="departure"));
  assert.equal(catalog.getGuide("page:analysis-review","committee"),null);
  assert.equal(catalog.getGuide("page:course","committee"),null);
});

test("課程介面導覽與制度課程內容保持分離",()=>{
  assert.match(course,/data-guide-page="page:course"/);
  assert.match(course,/onboarding-page-guides\.js\?v=5/);
  const guide=catalog.getGuide("page:course","vp");
  assert.ok(guide.steps.some(step=>step.id==="nav"));
  assert.ok(guide.steps.some(step=>step.id==="reset"));
  assert.match(guide.intro.description,/只介紹目錄、進度、續看、切換及重設/);
});

test("月會導覽以完整語意工作區為目標，不再框選零碎輸入欄位",()=>{
  const guide=catalog.getGuide("page:monthly-meeting","vp");
  assert.equal(guide.version,"1.0.2");
  [
    "monthly.history-panel","monthly.profile-card","monthly.attendance-card","monthly.attendance-breakdown",
    "monthly.growth-card","monthly.care-source","monthly.care-board","monthly.care-actions",
    "monthly.support-card","monthly.motions-card","monthly.conclusion-card"
  ].forEach(id=>assert.match(monthlyMeeting,new RegExp(`data-guide-id="${id.replace(".","\\.")}"`),`月會缺少 ${id}`));
  const targetFor=id=>guide.steps.find(step=>step.id===id)?.target;
  assert.equal(targetFor("attendance"),'[data-guide-id="monthly.attendance-card"]');
  assert.equal(targetFor("attendance-cards"),'[data-guide-id="monthly.attendance-breakdown"]');
  assert.equal(targetFor("growth"),'[data-guide-id="monthly.growth-card"]');
  assert.equal(targetFor("care-board"),'[data-guide-id="monthly.care-card"]');
  ["#absenceActual","#chapterTarget","#careSource","#careActions","#memberAssistance"].forEach(selector=>{
    assert.ok(!guide.steps.some(step=>step.target===selector),`月會仍使用過小目標 ${selector}`);
  });
});

test("全部頁面導覽都沿用月會的語意框選標準",()=>{
  const target=(guideId,stepId,role="vp")=>catalog.getGuide(guideId,role)?.steps.find(step=>step.id===stepId)?.target;
  const expectedTargets={
    "page:case-board":{
      search:'[data-guide-id="cases.search"]'
    },
    "page:case-workflow":{
      facts:'[data-guide-id="workflow.case-profile"]',
      "feedback-notice":'[data-guide-id="workflow.feedback-destination"]',
      "feedback-status":'[data-guide-id="workflow.feedback-threshold"]',
      "feedback-editor":'[data-guide-id="workflow.feedback-editor"]',
      ballot:'[data-guide-id="workflow.ballot"]',
      advisor:'[data-guide-id="workflow.advisor-box"]',
      status:'[data-guide-id="workflow.status-card"]',
      history:'[data-guide-id="workflow.activity-card"]'
    },
    "page:member-care":{
      overview:'[data-guide-id="care.overview"]',
      traffic:'[data-guide-id="care.traffic-panel"]',
      provenance:'[data-guide-id="care.provenance"]'
    },
    "page:analysis-review":{
      raw:'[data-guide-id="analysis.raw-result"]',
      codex:'[data-guide-id="analysis.codex-entry"]',
      provider:'[data-guide-id="analysis.provider-select"]',
      reject:'[data-guide-id="analysis.reject-card"]',
      publish:'[data-guide-id="analysis.publish-card"]'
    },
    "page:attendance":{
      meeting:'[data-guide-id="attendance.meeting-date"]',
      "history-session":'[data-guide-id="attendance.history-session"]',
      "primary-recorder":'[data-guide-id="attendance.primary-recorder"]',
      "assistant-recorder":'[data-guide-id="attendance.assistant-recorder"]',
      speech:'[data-guide-id="attendance.speech-seconds"]',
      summary:'[data-guide-id="attendance.stats"]',
      roster:'[data-guide-id="attendance.roster-table"]',
      bulk:'[data-guide-id="attendance.bulk-tools"]',
      recorder:'[data-guide-id="attendance.recorder-confirm"]',
      "vp-confirm":'[data-guide-id="attendance.vp-confirm"]'
    },
    "page:accountability-emails":{
      summary:'[data-guide-id="accountability.summary"]',
      "copy-fields":'[data-guide-id="accountability.copy-fields"]',
      exceptions:'[data-guide-id="accountability.actions"]'
    },
    "page:routine-reminders":{
      identity:'[data-guide-id="reminders.identity"]',
      targets:'[data-guide-id="reminders.target-card"]',
      digest:'[data-guide-id="reminders.digest-card"]',
      history:'[data-guide-id="reminders.history-card"]'
    },
    "page:settings":{
      vp:'[data-guide-id="settings.vp-card"]',
      committee:'[data-guide-id="settings.committee-card"]',
      "ai-owner":'[data-guide-id="settings.ai-overview"]',
      "ai-default":'[data-guide-id="settings.default-provider"]',
      "ai-providers":'[data-guide-id="settings.provider-grid"]',
      "ai-remove":'[data-guide-id="settings.provider-grid"]'
    },
    "page:case-archive":{
      facts:'[data-guide-id="archive.facts-card"]',
      activity:'[data-guide-id="archive.activity-card"]'
    },
    "page:course":{progress:'[data-guide-id="course.progress"]'}
  };
  Object.entries(expectedTargets).forEach(([guideId,steps])=>{
    const html=read(guideId.slice(5)+".html");
    Object.entries(steps).forEach(([stepId,selector])=>{
      assert.equal(target(guideId,stepId),selector,`${guideId}/${stepId} 框選錯誤`);
      const guideIdValue=selector.match(/data-guide-id="([^"]+)"/)?.[1];
      if(guideIdValue)assert.match(html,new RegExp(`data-guide-id="${guideIdValue.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}"`),`${guideId} 缺少 ${guideIdValue}`);
    });
  });
  ["page:new-member-form","page:industry-change-form","page:midterm-form","page:terminal-form","page:departure-form"].forEach(guideId=>{
    assert.equal(target(guideId,"progress"),'[data-guide-id="form.progress-panel"]',guideId+" 仍只框細進度條");
    assert.match(read(guideId.slice(5)+".html"),/data-guide-id="form\.progress-panel"/,guideId+" 缺少完整進度側欄目標");
  });
  assert.equal(target("page:terminal-form","signatures"),"#agreement","終期輔導仍只框單一簽名輸入框");
  const publicTargets={
    "page:public-feedback":{identity:".identity-field",feedback:".feedback-field"},
    "page:public-vote":{identity:".identity-field"}
  };
  Object.entries(publicTargets).forEach(([guideId,steps])=>{
    const html=read(guideId.slice(5)+".html");
    Object.entries(steps).forEach(([stepId,selector])=>{
      assert.equal(target(guideId,stepId,"public"),selector,`${guideId}/${stepId} 框選錯誤`);
      assert.match(html,new RegExp(`class="[^"]*${selector.slice(1)}(?:\\s|\")`),`${guideId} 缺少 ${selector}`);
    });
  });
  const allPageSteps=[...catalog.listGuides("vp"),...catalog.listGuides("committee"),...catalog.listGuides("public")].flatMap(guide=>guide.steps);
  [
    "#caseType","#myFeedback","#advisorStatus","#stageNumber","#dashboard","#sourceFingerprint",
    "#draftJson","#codexReviewText","#rejectButton","#publishButton","#totalCount","#memberRows",
    "#clearWeek","#recorderConfirmed","#vpConfirmed","#progressBar","#memberSignature","#accountabilityApp",
    "#previewSubject","#outcomeNote","#holdTask","#exchangeTargetState","#workDigestPreview","#deliveryList","#vpName","#committeeList",
    '[data-provider-card="openai"]','[data-remove-provider="openai"]',"#percent",
    "#meetingDate","#historySession","#primaryRecorder","#assistantRecorder","#speechSeconds",
    "#feedbackCallEnvironment","#providerSelect","#search","#loginIdentity","#defaultAiProvider",
    "#caseFacts","#activityLog","#responder","#feedback","#voter"
  ].forEach(selector=>assert.ok(!allPageSteps.some(step=>step.target===selector),`仍有零碎或錯位目標 ${selector}`));
});

test("每一份逐頁導覽的靜態目標都存在於對應頁面",()=>{
  const sharedTargets=new Set(['[data-guide-id="workspace.menu"]','[data-guide-id="workspace.back"]']);
  const checked=new Set();
  ["vp","committee","public"].forEach(role=>catalog.listGuides(role).forEach(guide=>{
    if(!guide.id.startsWith("page:")||guide.id==="page:index")return;
    const page=guide.id.slice(5);
    const source=read(page+".html");
    guide.steps.forEach(step=>{
      const key=`${page}:${step.target}`;
      if(checked.has(key)||sharedTargets.has(step.target))return;
      checked.add(key);
      const id=step.target.match(/^#([\w-]+)/)?.[1];
      const className=step.target.match(/^\.([\w-]+)/)?.[1];
      const attribute=step.target.match(/^\[([\w-]+)(?:=["']([^"']+)["'])?\]/);
      if(id)assert.match(source,new RegExp(`id=["']${id}["']`),`${page} 缺少 ${step.target}`);
      else if(className)assert.match(source,new RegExp(`class=["'][^"']*\\b${className}\\b`),`${page} 缺少 ${step.target}`);
      else if(attribute){
        const [,name,value]=attribute;
        assert.match(source,value?new RegExp(`${name}=["']${value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}["']`):new RegExp(`\\b${name}\\b`),`${page} 缺少 ${step.target}`);
      }
    });
  }));
  assert.ok(checked.size>150,"逐頁目標檢查數量異常");
});

test("兩個免登入公開頁只有必要操作導覽，不載入內部功能地圖",()=>{
  assert.match(publicFeedback,/data-guide-page="page:public-feedback"/);
  assert.match(publicVote,/data-guide-page="page:public-vote"/);
  assert.match(publicFeedback,/onboarding-public-bootstrap\.js/);
  assert.match(publicVote,/onboarding-public-guides\.js/);
  assert.match(publicBootstrap,/role:"public"/);
  assert.equal(catalog.getGuide("global-shell","public"),null);
  assert.ok(catalog.getGuide("page:public-feedback","public"));
  assert.ok(catalog.getGuide("page:public-vote","public"));
});

test("首頁動態篩選器保留副主席與委員各自的導覽識別",()=>{
  ["home.filter-pending","home.filter-mine","home.filter-due","home.filter-handover","home.filter-assigned","home.filter-team"].forEach(id=>{
    assert.match(planner,new RegExp(id.replace(".","\\.")));
  });
});

test("說明模式攔截點擊且不代按任何正式控制",()=>{
  assert.match(engine,/guide-click-shield/);
  assert.match(engine,/setTourInert\(true\)/);
  assert.match(engine,/event\.key==="Escape"/);
  assert.match(engine,/trapFocus/);
  assert.match(engine,/restoreInterface/);
  assert.doesNotMatch(engine,/\.click\s*\(/);
  assert.match(guideScript,/不會替你按下/);
  assert.match(guideScript,/不會代按/);
  assert.match(engine,/workspace-menu/);
  assert.match(engine,/tourRoot\.addEventListener\("click",event=>\{\s*event\.stopPropagation\(\)/);
  assert.match(engine,/if\(!event\.target\.closest\("\.guide-more"\)\)moreMenu\.open=false/);
  assert.match(engine,/event\.key==="Escape"&&moreMenu\.open/);
  assert.match(engine,/rect\.width>2&&rect\.height>2/);
  assert.match(engine,/innerHeight-card\.offsetHeight-10/);
  assert.match(engine,/guide-card-mobile-top/);
});

test("略過導覽後操作教學中心仍可開啟",()=>{
  const availableGuides=engine.slice(engine.indexOf("function availableGuides()"),engine.indexOf("function isTransitionGuide("));
  assert.match(availableGuides,/if\(!guide\|\|guideIds\.has\(guide\.id\)\)return false/);
  assert.match(availableGuides,/guideIds\.add\(guide\.id\)/);
  assert.match(engine,/function guideCenterMarkup\(\)\{\s*const guides=availableGuides\(\)/);
  assert.doesNotMatch(engine,/findIndex\(item=>item\.id===guide\.id\)/);
});

test("視覺層沿用富聯品牌並支援手機底部面板與減少動態效果",()=>{
  assert.match(styles,/--guide-red:#a91419/);
  assert.match(styles,/fill="rgba\(28,26,24,\.68\)"|\.guide-mask/);
  assert.match(styles,/@media\(max-width:800px\)/);
  assert.match(styles,/45dvh/);
  assert.match(styles,/env\(safe-area-inset-bottom\)/);
  assert.match(styles,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(styles,/z-index:2147483000/);
  assert.match(styles,/\.guide-card\{[\s\S]*?overflow:hidden/);
  assert.match(styles,/\.guide-card-progress\{[\s\S]*?margin:11px 17px 0/);
  assert.match(engine,/class="guide-more-icon"/);
  assert.doesNotMatch(engine,/>•••<\/summary>/);
  assert.match(styles,/\.guide-more summary\{[\s\S]*?overflow:hidden/);
  assert.match(styles,/appearance:none/);
  assert.match(styles,/guide-card\.guide-card-mobile-top/);
  assert.match(styles,/scroll-padding-bottom/);
});

test("首次登入完成全站導覽後直接留在可操作首頁，不再串接第二層封面",()=>{
  assert.match(login,/core\/onboarding-domain\.js/);
  assert.match(login,/assets\/js\/onboarding-guides\.js/);
  assert.match(loginScript,/identityFromSession\(session\)/);
  assert.match(loginScript,/catalog\.getGuide\("global-shell",identity\.role\)/);
  assert.doesNotMatch(loginScript,/setItem\("fulian-system-guide-return-v1"/);
  assert.match(loginScript,/location\.replace\("index\.html\?guide=welcome"\)/);
  assert.match(engine,/location\.replace\("index\.html\?guide=welcome"\)/);
  const completionFlow=engine.slice(engine.indexOf("function completeTour()"),engine.indexOf("function moveStep("));
  assert.match(completionFlow,/persistGuide\(completedGuide,\{status:"completed"/);
  assert.match(completionFlow,/endTour\(\)/);
  assert.doesNotMatch(completionFlow,/showIntro|setTimeout|currentPageGuide/);
});

test("換屆角色差異導覽優先於完整新手教學，完成後不再接續重播",()=>{
  assert.match(loginScript,/prepareRoleExperience\?\.\(localStorage,identity\)/);
  assert.match(loginScript,/if\(experience\.pending\)return true/);
  assert.match(engine,/const initialExperience=domain\.prepareRoleExperience\?\.\(localStorage,identity\)/);
  assert.match(engine,/function transitionGuide\(\)/);
  assert.match(engine,/if\(pendingTransition\)\{/);
  assert.match(engine,/location\.replace\("index\.html\?guide=role-change"\)/);
  assert.match(engine,/finishRoleTransition\?\.\(localStorage,identity,outcome/);
  assert.match(engine,/if\(transition\)finishTransition\("completed"\)/);
  assert.match(engine,/if\(transition\)finishTransition\("skipped"\)/);
  assert.match(guideScript,/你看過的共同功能會沿用完成紀錄，不必從頭再看/);
  assert.match(guideScript,/同一角色續任不重播；角色改變只看差異/);
});

test("Admin 不載入工作頁導覽，首頁也會移除操作教學入口",()=>{
  assert.match(workspaceNav,/if\(!\["vp","committee"\]\.includes\(role\)\)return/);
  assert.match(engine,/if\(!config\.enabled\|\|!domain\|\|!catalog\|\|!identity\)\{existingHelpButton\?\.remove\(\);return;\}/);
});
