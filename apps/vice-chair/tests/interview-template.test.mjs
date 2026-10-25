import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createInterviewTemplateApi} from '../services/interview-template-api.mjs';
const require=createRequire(import.meta.url);
const domain=require('../core/interview-template-domain.js');
const service=require('../services/interview-template.js');
const types=['new','industry','midterm','renewal','renewal-assessment','midterm-assessment','departure'];
function unzip(bytes){const data=Buffer.from(bytes),parts={};let offset=0;while(data.readUInt32LE(offset)===0x04034b50){const length=data.readUInt32LE(offset+18),nameLength=data.readUInt16LE(offset+26),extra=data.readUInt16LE(offset+28),start=offset+30+nameLength+extra;parts[data.subarray(offset+30,offset+30+nameLength).toString()]=data.subarray(start,start+length);offset=start+length}return parts}
function fixture(type,xml){const t=domain.templateFor(type);return{schema:t.schema,templateId:t.id,sourceSha256:t.sourceSha256,parts:{'[Content_Types].xml':Buffer.from('<Types/>').toString('base64'),'word/document.xml':Buffer.from(xml).toString('base64'),'word/styles.xml':Buffer.from('original styles byte for byte').toString('base64'),'word/media/logo.png':Buffer.from([0,255,20,100]).toString('base64')}}}
test('七種文件使用六份白名單模板，檔名採訪談日，拒絕未知類型與缺漏日期',()=>{
 assert.equal(new Set(types.map(type=>domain.templateFor(type).id)).size,6);
 assert.equal(domain.fileName({type:'new',applicant:'範例',meetingDate:'2026-09-14T10:30'}),'高屏區會員成功訪談表暨權利義務確認書-新會員-範例-20260914.docx');
 for(const type of types)assert.match(domain.fileName({type,applicant:'測試/姓名',meetingDate:'2026-09-14'}),/-測試-姓名-20260914\.docx$/);
 for(const type of ['../secret','constructor','toString','other'])assert.throws(()=>domain.templateFor(type));
 assert.throws(()=>domain.fileName({type:'renewal',applicant:'範例',meetingDate:''}),/日期/);
});
test('V1.1 新欄位與兩份簽名分開保存，舊承諾不推定為新版同意，長答案不截斷',()=>{
 const long='長答案&<符號>\n'.repeat(300);
 const values=domain.fields({businessContent:long,teamSize:6,leadInterviewer:'主訪',witness1:'已填主訪',applicantSignature:'已填申請人',rightsMsp:true,rightsQualification:true,rightsEmploymentType:'兼職',rightsExperienceYears:3,mspUpDate2:'2026-11-21',joinOption2:true,goalOption3:true,cooperationOtherSelected:true,contactRelation20:'客戶','radio:sixHours':'yes','radio:policyEthics':'yes',membershipTransfer:true},'範例');
 assert.equal(domain.TEMPLATE.id,'kp-membership-v1.1-20261012');assert.equal(values.teamSize,'6');
 assert.equal(values.applicantSignature,'已填申請人');assert.equal(values.interviewerSignatures,'已填主訪');
 assert.equal(values.rightsApplicantSignature,'');assert.equal(values.rightsInterviewerSignatures,'');
 assert.equal(values.rightsMsp,'■');assert.equal(values.rightsQualification,'■');assert.equal(values.rightsEmploymentPart,'■');assert.equal(values.rightsExperienceYears,'3');
 assert.equal(values.rightsCategory,'□');assert.equal(values.rightsEthics,'□');assert.equal(values.participationYes,'□');
 assert.equal(values.joinOption2,'■');assert.equal(values.joinOption1,'□');assert.equal(values.goalOption3,'■');assert.equal(values.cooperationOtherSelected,'■');
 assert.equal(values.mspUpDate2,'2026年11月21日');assert.equal(values.contactRelation20,'客戶');
 const reconstructed=Array.from({length:domain.NARRATIVES.businessContent[0]},(_,i)=>values[`businessContent.${i}`]).join('\n');assert.equal(reconstructed.replace(/\s/g,''),long.replace(/\s/g,''));
 assert.ok(!Object.hasOwn(values,'sixHoursYes'));
});
test('期中新版兩份欄位分開，內部評估不得混入共同訪談，長答案不截斷',()=>{
 const draft={counselor:'主訪',companionCounselor:'陪訪',midtermInterview:{gain1:true,engagement:'5',willingness:'2',achievement:'會員原話',chapterSupport:'長答案'.repeat(800)+'最後一句'},midtermAssessment:{light:'3',energy:'4',training16:true,summary:'內部專屬',assessmentDate:'2026-10-25'}};
 const v=domain.fields(draft,'範例','midterm');assert.equal(v.gain1,'■');assert.equal(v.gain2,'□');assert.equal(v.engagement,'5');assert.equal(v.willingness2,'■');assert.equal(v['achievement.0'],'會員原話');assert.ok(!JSON.stringify(v).includes('內部專屬'));assert.ok(!Object.hasOwn(v,'memberSignature'));assert.ok(!Object.hasOwn(v,'metric.given'));assert.ok(v['chapterSupport.3'].endsWith('最後一句'));
 const internal=domain.fields(draft,'範例','midterm-assessment');assert.equal(internal.light3,'■');assert.equal(internal.energy4,'■');assert.equal(internal.training16,'■');assert.equal(internal['summary.0'],'內部專屬');assert.ok(!JSON.stringify(internal).includes('會員原話'));assert.match(internal.assessmentSignatures,/^_+$/);
});
test('續約新版僅映射會員訪談，缺少數值留白，內部評估不得混入',()=>{
 const draft={renewalInterview:{renewalCycle:'3',gain1:true,usageScore:'4',mspUnderstood:true,nextYearPlan:'年度目標'},renewalAssessment:{notes:'內部不可出現在訪談',recommendation:'reject'}};
 const v=domain.fields(draft,'範例','renewal',{metrics:{givenIn:7,givenOut:11,amount:1234}});
 assert.equal(v.cycle3,'■');assert.equal(v.cycle1,'□');assert.equal(v.gain1,'■');assert.equal(v.usageScore4,'■');assert.equal(v.mspUnderstood,'■');
 assert.equal(v['metric.referrals'],'18');assert.equal(v['metric.amountGiven'],'1234');assert.equal(v['metric.amountReceived'],'');assert.equal(v['metric.education'],'');
 assert.ok(!JSON.stringify(v).includes('內部不可出現在訪談'));assert.match(v.memberSignature,/^_+$/);
 const a=domain.fields({...draft,renewalAssessment:{systemUse:'low',recommendation:'conditional',improvement1:true,improvementGoal:'90天目標',assessmentDate:'2026-10-25'}},'範例','renewal-assessment');
 assert.equal(a['rating.systemUse.low'],'■');assert.equal(a.recommendConditional,'■');assert.equal(a.recommendReject,'□');assert.equal(a.improvement1,'■');assert.equal(a.assessmentDate,'2026年10月25日');assert.ok(!JSON.stringify(a).includes('年度目標'));
});
test('離會僅填公版欄位，簽名不虛構，保留內部改善與確認紀錄在系統',()=>{
 const v=domain.fields({interviewDate:'2026-09-14T10:30',counselor:'主訪','radio:mspAttended':'否',mspNotes:'待說明',internalNotes:'僅系統內部',trademarkUnderstood:true,presidentSignature:'已知姓名'},'範例','departure');
 assert.equal(v.msp,'否；待說明');assert.match(v.presidentSignature,/^已知姓名_+$/);assert.match(v.directorSignature,/^_+$/);assert.ok(!JSON.stringify(v).includes('僅系統內部'));
});
test('原始部件完整保留，XML 安全替換一次，缺少欄位即失敗',async()=>{
 const fixturePackage=fixture('new','<w:p><w:r><w:t>{{answer}}</w:t></w:r></w:p>');
 const parts=unzip(await service.fillPackage(fixturePackage,{answer:'甲 & <乙>\n{{未遞迴}}'}).arrayBuffer());
 assert.equal(parts['word/styles.xml'].toString(),'original styles byte for byte');assert.deepEqual(parts['word/media/logo.png'],Buffer.from([0,255,20,100]));
 assert.match(parts['word/document.xml'].toString(),/甲 &amp; &lt;乙&gt;<\/w:t><w:br\/><w:t xml:space="preserve">\{\{未遞迴\}\}/);
 assert.throws(()=>service.fillPackage(fixturePackage,{}),/尚未對應/);
});
test('五類生成驗證指定模板與登入後 API，損壞版本停止產檔',async()=>{
 for(const type of types){
  const expected=domain.templateFor(type),template=fixture(type,'<w:p><w:r><w:t>{{'+(type.endsWith('-assessment')?'assessmentDate':['new','industry'].includes(type)?'applicant':'member')+'}}</w:t></w:r></w:p>');
  const fetchImpl=async(url,options)=>{assert.equal(url,`/api/interview-template?type=${type}`);assert.equal(options.cache,'no-store');return{ok:true,json:async()=>({templateJson:JSON.stringify(template)})}};
  const cryptoImpl={subtle:{digest:async()=>Buffer.from(expected.sha256,'hex')}};
  const output=await service.generate({type,applicant:'範例',draft:{meetingDate:'2026-09-14',renewalAssessment:{assessmentDate:'2026-09-14'},midtermAssessment:{assessmentDate:'2026-09-14'}},fetchImpl,cryptoImpl});assert.equal(output.templateId,expected.id);assert.ok(output.blob.size>0);
  await assert.rejects(service.generate({type,applicant:'範例',draft:{meetingDate:'2026-09-14',renewalAssessment:{assessmentDate:'2026-09-14'},midtermAssessment:{assessmentDate:'2026-09-14'}},fetchImpl}),/版本驗證失敗/);
 }
});
test('後端拒絕未登入、寫入、路徑注入、缺檔與版本損壞，不回退自製版型',async()=>{
 let loaded=false;const api=createInterviewTemplateApi({loadTemplate:async()=>{loaded=true;return '{}'}});
 const req={method:'GET'},url=new URL('http://localhost/api/interview-template?type=new');
 await assert.rejects(api(req,url,{}),{status:403});assert.equal(loaded,false);
 await assert.rejects(api({method:'POST'},url,{role:'vp'}),{status:405});
 await assert.rejects(api(req,new URL('http://localhost/?type=constructor'),{role:'vp'}),{status:400});
 await assert.rejects(api(req,url,{role:'committee'}),{status:503});
 const absent=createInterviewTemplateApi({loadTemplate:async()=>{throw new Error('missing')}});await assert.rejects(absent(req,url,{role:'admin'}),{status:503});
});
test('五個入口使用模板，產檔失敗不得保存附件或推進案件',async()=>{
 for(const [file,type] of [['new-member-form','new'],['industry-change-form','industry'],['departure-form','departure']]){
  const source=await readFile(new URL(`../assets/js/${file}.js`,import.meta.url),'utf8'),html=await readFile(new URL(`../${file}.html`,import.meta.url),'utf8');
  assert.doesNotMatch(source,/new Document\(|Packer\.toBlob/);assert.match(source,new RegExp(`FulianInterviewTemplate.generate\\(\\{type:"${type}"`));
  assert.match(source,/\.failure\(\{error\}\);\s*toast\(error.message[^;]*\);\s*return;/);
  if(type==="renewal")assert.match(source,/capture\(\);[\s\S]*?renewalFoundationSnapshot:foundationSnapshot[\s\S]*?await window.FulianCaseStateStore.flush\(\)[\s\S]*?FulianInterviewTemplate.generate/);
  assert.match(html,/core\/interview-template-domain.js/);assert.match(html,/services\/interview-template.js/);assert.doesNotMatch(html,/vendor\/docx.iife/);
 }
});
