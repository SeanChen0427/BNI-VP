import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const cases=require('../core/case-domain.js');
const domain=require('../core/interview-template-domain.js');
const templates=require('../services/interview-template.js');
const copy=require('../services/archive-template-copy.js');
const legacy=templates.zipParts({'word/document.xml':new TextEncoder().encode('<w:document/>')});
const base={task:{type:'new',member:'範例',completed:true},state:{closed:true,votes:{委員甲:'approve'},log:[{text:'結案'}]},role:'vp',file:legacy,draft:{applicant:'範例',meetingDate:'2026-09-14',businessContent:'當時的訪談內容'}};
test('五類已保存舊檔即可提供按鈕；新公版不依日期或檔名判斷',async()=>{
 for(const type of ['new','industry','midterm','renewal','departure']){
  const options={...base,task:{...base.task,type}};
  assert.equal(await copy.eligible(options),true);
  const file=templates.zipParts({'word/document.xml':new Uint8Array()}, {format:'fulian.regional-template.v1',templateId:domain.templateFor(type).id});
  assert.equal(await copy.eligible({...options,file}),false);
 }
 for(const role of ['committee','guest',''])assert.equal(await copy.eligible({...base,role}),false);
 for(const state of [{wordSaved:true},{wordSaved:true,feedback:{委員甲:'同意'}},{wordSaved:true,votingOpen:true,votes:{委員甲:'approve'}}]){
  assert.equal(await copy.eligible({...base,task:{...base.task,completed:false},state}),true);
 }
 assert.equal(await copy.eligible({...base,task:{...base.task,completed:false},state:{},file:null}),false);
 assert.equal(await copy.eligible({...base,task:{...base.task,type:'special'}}),false);
 assert.equal(await copy.eligible({...base,file:null}),false);
 await assert.rejects(copy.eligible({...base,file:new Blob(['broken'])}),/Word/);
});
test('保存填答、原訪談日與姓名需完整一致；拒絕用今天補值或空白重製',()=>{
 const result=copy.prepare(base);assert.equal(result.date,'2026-09-14');
 for(const draft of [{}, {...base.draft,meetingDate:''},{...base.draft,meetingDate:'2026-02-30'}, {...base.draft,applicant:'其他人'}])assert.throws(()=>copy.prepare({...base,draft}));
});
test('歷史簽名不以會員名或登入者補填，明確填答與承諾仍保留',()=>{
 const prepared=copy.prepare({...base,draft:{...base.draft,login:'現在登入人',leadInterviewer:'主責','radio:sixHours':'yes'}});
 const fields=domain.fields(prepared.draft,prepared.applicant,prepared.type,prepared.context);
 assert.equal(fields.sixHoursYes,'■');assert.equal(fields.policyEthicsYes,'□');
 assert.match(fields.applicantSignature,/^_+$/);assert.match(fields.witness1,/^_+$/);
 assert.equal(prepared.draft.login,undefined);
 const explicit=domain.fields({...prepared.draft,witness1:'保存姓名',applicantSignature:'已填姓名'},prepared.applicant,'new',prepared.context);
 assert.equal(explicit.witness1,'保存姓名');assert.equal(explicit.applicantSignature,'已填姓名');
});
test('只採同會員歷史 PALMS 快照；期中未保存分數留白，沒有即時資料請求',()=>{
 const options={...base,task:{...base.task,type:'renewal'},draft:{member:'範例',summary:'當時的總結',meetingDate:'2026-09-14',renewalRuleVersion:2,renewalMetricsSnapshot:{member:{name:'範例',metrics:{givenIn:3,givenOut:7}},averages:{amount:10},period:{start:'2025-09',end:'2026-08'}}}};
 let p=copy.prepare(options),v=domain.fields(p.draft,p.applicant,p.type,p.context);
 assert.equal(v['metric.given'],'10');assert.equal(v.score,'');assert.match(v.palmsPeriod,/2025-09 至 2026-08/);
 options.draft.renewalMetricsSnapshot.member.name='其他人';p=copy.prepare(options);assert.equal(p.context.metrics,undefined);
 p=copy.prepare({...options,task:{...options.task,type:'midterm'}});v=domain.fields(p.draft,p.applicant,p.type,p.context);
 assert.equal(v.scoreNote,'');assert.equal(v['metric.given'],'');assert.match(v.memberSignature,/^_+$/);assert.equal(v.signatureDate,'');
});
test('副本生成成功與失敗皆無儲存路徑，輸入及原附件逐位元保留',async()=>{
 const original=JSON.stringify({task:base.task,state:base.state,draft:base.draft});
 const originalBytes=Buffer.from(await legacy.arrayBuffer());
 let calls=0;
 const sandbox={structuredClone,FulianCaseDomain:cases,FulianInterviewTemplate:{...templates,generate:async prepared=>{calls++;assert.equal(prepared.context.historicalCopy,true);return{blob:new Blob(['copy']),fileName:'範例-20260914.docx'}}}};
 for(const key of ['localStorage','indexedDB','fetch'])Object.defineProperty(sandbox,key,{get(){throw new Error(`不應存取 ${key}`)}});
 vm.runInNewContext(await readFile(new URL('../services/archive-template-copy.js',import.meta.url),'utf8'),sandbox);
 const result=await sandbox.FulianArchiveTemplateCopy.generate(base);
 assert.equal(result.fileName,'範例-20260914-公版副本-待核對.docx');assert.equal(calls,1);
 sandbox.FulianInterviewTemplate.generate=async()=>{throw new Error('模板缺漏')};
 await assert.rejects(sandbox.FulianArchiveTemplateCopy.generate(base),/模板缺漏/);
 assert.equal(JSON.stringify({task:base.task,state:base.state,draft:base.draft}),original);
 assert.deepEqual(Buffer.from(await legacy.arrayBuffer()),originalBytes);
 await assert.rejects(sandbox.FulianArchiveTemplateCopy.generate({...base,state:{},task:{...base.task,completed:false},file:null}),/已保存舊版/);
});
test('結案頁保留原檔按鈕，公版副本僅下載且佈署包含服務',async()=>{
 const source=await readFile(new URL('../assets/js/case-archive.js',import.meta.url),'utf8');
 const html=await readFile(new URL('../case-archive.html',import.meta.url),'utf8');
 assert.match(html,/id="templateCopyPanel"[^>]*hidden/);assert.match(html,/id="downloadWord"/);
 assert.match(source,/setupTemplateCopy\(task,state,draft,file\)/);assert.match(source,/FulianTemplateCopyPanel\.mount/);
 assert.doesNotMatch(source,/saveGeneratedWord|setItem|completeRecordOnly|method:\s*["']POST/);
 const deploy=await readFile(new URL('../../../scripts/prepare-github-pages.mjs',import.meta.url),'utf8');
 assert.match(deploy,/'archive-template-copy.js'/);
});

test('投票中的副本保持回饋票數與原檔；共用面板在點擊時重新讀取附件',async()=>{
 const pending={...base,task:{...base.task,completed:false},state:{wordSaved:true,votingOpen:true,feedback:{委員甲:'原始回饋'},votes:{委員甲:'approve'},voterSnapshot:['委員甲','委員乙']}};
 const before=JSON.stringify(pending);
 const sandbox={structuredClone,FulianInterviewTemplate:{...templates,generate:async()=>({fileName:'測試.docx',blob:legacy})}};
 vm.runInNewContext(await readFile(new URL('../services/archive-template-copy.js',import.meta.url),'utf8'),sandbox);
 await sandbox.FulianArchiveTemplateCopy.generate(pending);
 assert.equal(JSON.stringify(pending),before);
 const source=await readFile(new URL('../assets/js/case-workflow.js',import.meta.url),'utf8');
 const panel=await readFile(new URL('../assets/js/template-copy-panel.js',import.meta.url),'utf8');
 assert.match(source,/await refreshTemplateCopy\(\)/);
 assert.match(source,/FulianTemplateCopyPanel\.mount/);
 assert.match(panel,/const latest=await getOptions\(\)/);
 assert.match(panel,/service\.eligible\(latest\)/);
 assert.doesNotMatch(panel,/saveGeneratedWord|setItem|saveWorkflow|saveFeedback|submitVote/);
 for(const page of ['case-workflow','case-archive']){
  const html=await readFile(new URL(`../${page}.html`,import.meta.url),'utf8');
  assert.match(html,/id="templateCopyPanel"[^>]*hidden/);
  assert.match(html,/template-copy-panel.js/);
  assert.match(html,/archive-template-copy.js\?v=2/);
 }
});
