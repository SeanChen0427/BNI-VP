import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createRenewalDocumentSaver,renewalFingerprintSource,validRenewalDocuments,renewalWorkflow,renewalStorageObjects,canReadRenewalAssessment} from '../services/renewal-documents.mjs';
const require=createRequire(import.meta.url),domain=require('../core/case-domain.js'),template=require('../core/interview-template-domain.js'),word=require('../services/interview-template.js'),caseFiles=require('../services/case-files.js');
const sha=async value=>createHash('sha256').update(value).digest('hex');
const access={task:{id:'task-uuid',category:'renewal',title:'測試會員'},leadership:false,assigned:true},context={name:'測試主訪',personId:'person-uuid'};
const draft={renewalPackVersion:1,member:'測試會員',counselor:'測試主訪',meetingDate:'2026-10-25T10:00',renewalInterview:{personalGrowth:'會員原話'},renewalAssessment:{recommendation:'conditional',assessmentDate:'2026-10-26'}};
const bytes=async kind=>new Uint8Array(await word.zipParts({'word/document.xml':new TextEncoder().encode('<w:document/>')},{format:'fulian.regional-template.v1',templateId:template.templateFor(kind==='renewal-interview'?'renewal':kind).id}).arrayBuffer());
function fixture(){let row=null,failIndex=false,failStorage=false,n=0;const objects=new Map(),writes=[];return{get row(){return structuredClone(row)},get objects(){return objects},failIndex(){failIndex=true},failStorage(){failStorage=true},save:createRenewalDocumentSaver({sha256Text:sha,sha256Bytes:sha,uuid:()=>String(++n),now:()=>`stamp-${n}`,db:async(path,options)=>{writes.push(path);if(failIndex)throw new Error('index failed');const p=JSON.parse(options.body);if(options.method==='PATCH'){if(!path.endsWith(encodeURIComponent(row.updated_at)))return[];row={...row,...p};return[row];}row=p;return null;},serviceFetch:async(path,options)=>{if(failStorage)throw new Error('storage failed');if(options.method==='DELETE'){for(const p of JSON.parse(options.body).prefixes)objects.delete(p);}else objects.set(path.split('/case-files/')[1],options.body);}})};}
const call=async(f,kind,stateDraft=draft,stateWorkflow={},existing=f.row)=>f.save({access,context,body:{documentKind:kind,filename:kind+'.docx'},bytes:await bytes(kind),existing,state:{draft:stateDraft,workflow:stateWorkflow}});
test('同案兩份獨立附件，第一份不開放回饋；第二份必須連到已保存訪談的雜湊',async()=>{
 const f=fixture();await assert.rejects(call(f,'renewal-assessment'),/先成功保存/);assert.equal(f.objects.size,0);
 const one=await call(f,'renewal-interview');assert.equal(f.objects.size,1);assert.equal(domain.renewalDocumentsReady(one.documents),false);
 let workflow=caseFiles.workflowAfterWord({},one.name,'test','time','stamp',{documentKind:'renewal-interview',documents:one.documents});assert.equal(workflow.wordSaved,false);assert.equal(domain.stageOf({type:'renewal'},workflow,true),'assessment');
 const primary=f.row.object_path,two=await call(f,'renewal-assessment');assert.equal(f.objects.size,2);assert.equal(f.row.object_path,primary);assert.notEqual(two.documents['renewal-assessment'].object_path,primary);assert.equal(domain.renewalDocumentsReady(two.documents),true);
 workflow=await renewalWorkflow({access,workflow,draft,files:f.row,sha256Text:sha});assert.equal(workflow.wordSaved,true);assert.equal(domain.stageOf({type:'renewal'},workflow,true),'feedback');assert.equal(renewalStorageObjects([f.row]).length,2);
});
test('更改會員訪談、訪談人或評估內容使舊文件失效，重存訪談後仍需重存對應評估',async()=>{
 const f=fixture();await call(f,'renewal-interview');await call(f,'renewal-assessment');
 for(const changed of [{...draft,counselor:'另一位'},{...draft,renewalInterview:{personalGrowth:'新回答'}},{...draft,renewalAssessment:{recommendation:'normal'}}]){
 const w=await renewalWorkflow({access,workflow:{renewalPackVersion:1,wordSaved:true},draft:changed,files:f.row,sha256Text:sha});assert.equal(w.wordSaved,false);
 }
 const changed={...draft,renewalInterview:{personalGrowth:'新回答'}};const one=await call(f,'renewal-interview',changed);assert.equal(domain.renewalDocumentsReady(one.documents),false);assert.equal(Object.hasOwn(one.documents,'renewal-assessment'),false);
 const two=await call(f,'renewal-assessment',changed);assert.equal(domain.renewalDocumentsReady(two.documents),true);
});
test('保存失敗與同時更新不誤推流程，新上傳孤兒清理，保留原件',async()=>{
 const f=fixture();await call(f,'renewal-interview');const before=f.row;f.failIndex();await assert.rejects(call(f,'renewal-assessment'),/index failed/);assert.equal(f.objects.size,1);assert.deepEqual(f.row,before);
 const g=fixture();await call(g,'renewal-interview');const stale=g.row;await call(g,'renewal-interview');await assert.rejects(call(g,'renewal-assessment',draft,{},stale),/其他裝置更新/);assert.equal(g.objects.size,2);
 const h=fixture();h.failStorage();await assert.rejects(call(h,'renewal-interview'),/storage failed/);assert.equal(h.row,null);
});
test('已建立回饋呼喚便鎖定文件；申請人迴避內部評估，錯誤模板拒絕',async()=>{
 const f=fixture();await call(f,'renewal-interview');for(const w of [{feedbackCallId:'call'},{feedbackNotified:true},{feedback:{委員:'回饋'}},{votingOpen:true}])await assert.rejects(call(f,'renewal-interview',draft,w),/不可覆寫/);
 assert.equal(canReadRenewalAssessment(access,{name:'測試會員'}),false);assert.equal(canReadRenewalAssessment({...access,assigned:false},context),false);assert.equal(canReadRenewalAssessment(access,context),true);
 await assert.rejects(f.save({access,context:{...context,name:'測試會員'},body:{documentKind:'renewal-assessment'},bytes:await bytes('renewal-assessment'),state:{draft}}),{status:403});
 await assert.rejects(f.save({access,context,body:{documentKind:'renewal-assessment',filename:'bad.docx'},bytes:await bytes('renewal-interview'),existing:f.row,state:{draft}}),{status:422});
});
test('新案強制雙文件，歷史已保存舊案保留原流程；前後端不能用 wordSaved 繞過門檻',()=>{
 assert.equal(domain.renewalPackRequired({type:'renewal'},{},{}),true);assert.equal(domain.renewalPackRequired({type:'renewal'},{wordSaved:true},{}),false);assert.equal(domain.renewalPackRequired({type:'renewal'},{wordSaved:true,renewalPackVersion:1},{}),true);
 assert.deepEqual(domain.pendingActions({type:'renewal',member:'會員',lead:'委員'},{renewalPackVersion:1,wordSaved:true,renewalInterviewSaved:true},{userName:'委員',committee:['委員']}),['assigned']);
 const edge=readFileSync(new URL('../../../supabase/functions/app-api/index.ts',import.meta.url),'utf8');assert.match(edge,/renewalGate\[packSpec.versionKey\]===1\?\{\[packSpec.versionKey\]:1\}/);assert.match(edge,/renewalGate.wordSaved\)throw/);assert.match(edge,/if\(assessmentChanged&&!canReadRenewalAssessment/);assert.match(edge,/if\(body.documentKind\)return saveRenewalDocument/);
 const sql=readFileSync(new URL('../../../supabase/migrations/20261025090000_renewal_document_parts.sql',import.meta.url),'utf8');assert.match(sql,/add column if not exists documents jsonb/);assert.doesNotMatch(sql,/create or replace|update public\.|delete from|drop policy/i);
});
test('重產前版本保留私密索引，刪案會涵蓋所有版本；清理失敗回報並排入重試',async()=>{
 const f=fixture();await call(f,'renewal-interview');await call(f,'renewal-assessment');await call(f,'renewal-interview');assert.equal(f.row.documents._history.length,1);assert.equal(renewalStorageObjects([f.row]).length,3);
 const queued=[];const saver=createRenewalDocumentSaver({sha256Text:sha,sha256Bytes:sha,db:async()=>{throw new Error('index failed')},serviceFetch:async(p,o)=>{if(o.method==='DELETE')throw new Error('cleanup failed')},queueCleanup:async(task,path)=>queued.push({task,path})});
 await assert.rejects(saver({access,context,body:{documentKind:'renewal-interview',filename:'test.docx'},bytes:await bytes('renewal-interview'),state:{draft}}),/排入清理重試/);assert.equal(queued.length,1);assert.match(queued[0].path,/renewal-interview/);
});
