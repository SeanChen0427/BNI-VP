import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const domain=createRequire(import.meta.url)('../core/case-domain.js');
const source=readFileSync(new URL('../assets/js/case-workflow.js',import.meta.url),'utf8');
const oldNames=['原副主席','留任委員','卸任委員','申請者'];
const current=['新副主席','留任委員','新委員'];
const task={type:'renewal',member:'申請者'};
function state(){return {wordSaved:true,votingOpen:true,voteNoticeSent:true,closed:false,voterSnapshot:oldNames.slice(0,3),voterRoster:oldNames.map(name=>({name,isRecused:name==='申請者'})),feedback:{原副主席:'原回饋甲',卸任委員:'原回饋乙'},votes:{原副主席:'approve',卸任委員:'approve'},advisorStatus:'confirmed',resultAnnouncementSent:true};}
function page(s,user='新副主席'){
  const nodes=new Map();
  const $=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:selector==='#applicant'?'申請者':selector==='#caseType'?'renewal':'',classList:{toggle(){}},options:[]});return nodes.get(selector);};
  const ctx=vm.createContext({state:s,committee:current,caseDomain:domain,$,feedbackDirty:false,feedbackEditorTarget:user,authSession:{role:'vp',name:user},roles:{},sourceTask:null,calendarDomain:{dateInput:()=>'',defaultVoteDeadline:()=>''},config:()=>({}),steps:[],CASE_ID:'test-case',leadersSaving:false,advisorSaving:false,advisorDirty:false,leadersMessage:()=>'',resultAnnouncementText:()=>'',caseDraft:()=>({}),dateLabel:()=>''});
  const names=['isVp','currentUser','decisionRoster','recusedApplicant','eligibleMembers','editableFeedbackMembers','feedbackSummary','threshold','feedbackCount','selectedFeedbackAuthor','escapeHtml','renderFeedback','feedbackReady','voteAccessReady','voteDecision','currentStage','restoreForm','renderResult'];
  for(const name of names){const start=source.indexOf(`function ${name}(`);assert.ok(start>=0);const next=source.indexOf('\nfunction ',start+1);vm.runInContext(source.slice(start,next<0?undefined:next),ctx);}
  return {ctx,$,run:code=>vm.runInContext(code,ctx)};
}

test('換屆後已完成回饋與投票保持原基數，現任副主席可接續原結案階段',()=>{
 const s=state(),before=structuredClone(s);
 assert.deepEqual(domain.feedbackSummary(s,current,task.member),{eligible:oldNames.slice(0,3),count:2,required:2,ready:true});
 assert.equal(domain.voteSummary(s,current.length).status,'pass');
 const p=page(s);p.run('renderFeedback()');
 assert.equal(p.$('#feedbackCount').textContent,2);
 assert.match(p.$('#feedbackList').innerHTML,/原回饋甲/);
 assert.match(p.$('#feedbackList').innerHTML,/原回饋乙/);
 assert.doesNotMatch(p.$('#feedbackList').innerHTML,/新副主席|新委員/);
 assert.equal(p.run('currentStage()'),10);
 p.run('renderResult()');
 assert.equal(p.$('#closeCase').disabled,false);
 const pending=page({...s,leadersSent:false,advisorStatus:'pending',resultAnnouncementSent:false});
 pending.run('renderResult()');
 assert.equal(pending.$('#closeCase').disabled,true);
 assert.match(pending.$('#closeCaseHint').textContent,/董事顧問/);
 assert.deepEqual(s,before);
});

test('新任委員沒有舊案回饋待辦，留任者按本案原資格判定',()=>{
 const s=state();
 for(const userName of ['新副主席','新委員']){
  assert.equal(domain.feedbackParticipation(task,s,userName,current).status,'not-eligible');
  assert.deepEqual(domain.pendingActions(task,s,{userName,committee:current}),[]);
 }
 assert.equal(domain.feedbackParticipation(task,s,'留任委員',current).status,'pending');
 assert.equal(domain.feedbackParticipation(task,s,'申請者',[...current,'申請者']).status,'recused');
});

test('零票快照重新載入不被現任名單替換，無完整 roster 的舊案也沿用快照',()=>{
 const s=state();s.votes={};delete s.voterRoster;
 const before=structuredClone(s.voterSnapshot),p=page(s);
 p.run('restoreForm()');
 assert.deepEqual(s.voterSnapshot,before);
 assert.deepEqual(domain.decisionRoster(s,current,task.member).map(x=>x.name),before);
 assert.equal(domain.feedbackSummary(s,current,task.member).ready,true);
});

test('尚未開票的新案仍用現任名單及本人迴避，額外歷史回饋不縮小或灌入基數',()=>{
 const s={feedback:{卸任委員:'歷史文字',新委員:'本案文字'}};
 assert.deepEqual(domain.feedbackSummary(s,current,'新副主席'),{eligible:['留任委員','新委員'],count:1,required:2,ready:false});
 const frozen=state();frozen.feedback.新委員='額外文字';
 assert.equal(domain.feedbackSummary(frozen,current,task.member).count,2);
 const p=page(frozen);p.run('renderFeedback()');
 assert.match(p.$('#feedbackList').innerHTML,/歷史回饋（不列入門檻）/);
});
