import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createInterviewTemplateApi} from '../services/interview-template-api.mjs';
const require=createRequire(import.meta.url);
const domain=require('../core/interview-template-domain.js');
const service=require('../services/interview-template.js');
const types=['new','industry','midterm','renewal','departure'];
function unzip(bytes){const data=Buffer.from(bytes),parts={};let offset=0;while(data.readUInt32LE(offset)===0x04034b50){const length=data.readUInt32LE(offset+18),nameLength=data.readUInt16LE(offset+26),extra=data.readUInt16LE(offset+28),start=offset+30+nameLength+extra;parts[data.subarray(offset+30,offset+30+nameLength).toString()]=data.subarray(start,start+length);offset=start+length}return parts}
function fixture(type,xml){const t=domain.templateFor(type);return{schema:t.schema,templateId:t.id,sourceSha256:t.sourceSha256,parts:{'[Content_Types].xml':Buffer.from('<Types/>').toString('base64'),'word/document.xml':Buffer.from(xml).toString('base64'),'word/styles.xml':Buffer.from('original styles byte for byte').toString('base64'),'word/media/logo.png':Buffer.from([0,255,20,100]).toString('base64')}}}
test('五類使用四份白名單模板，檔名採訪談日，拒絕未知類型與缺漏日期',()=>{
 assert.equal(new Set(types.map(type=>domain.templateFor(type).id)).size,4);
 assert.equal(domain.fileName({type:'new',applicant:'範例',meetingDate:'2026-09-14T10:30'}),'高屏區會員訪談表-新會員-範例-20260914.docx');
 for(const type of types)assert.match(domain.fileName({type,applicant:'測試/姓名',meetingDate:'2026-09-14'}),/-測試-姓名-20260914\.docx$/);
 for(const type of ['../secret','constructor','toString','other'])assert.throws(()=>domain.templateFor(type));
 assert.throws(()=>domain.fileName({type:'renewal',applicant:'範例',meetingDate:''}),/日期/);
});
test('申請人與主陪訪簽名只帶入已知姓名，勾選忠實呈現，敘述不截斷',()=>{
 const long='長答案&<符號>\n'.repeat(300);
 const values=domain.fields({businessContent:long,leadInterviewer:'主訪',companionInterviewer:'陪訪','radio:sixHours':'no',membershipTransfer:false},'範例');
 assert.equal(values.applicantSignature,'範例');assert.equal(values.witness1,'主訪');assert.equal(values.witness2,'陪訪');assert.match(values.witness3,/^_+$/);
 assert.equal(values.sixHoursYes,'□');assert.equal(values.sixHoursNo,'■');assert.equal(values.membershipTransfer,'□');
 const reconstructed=Array.from({length:11},(_,i)=>values[`businessContent.${i}`]).join('\n');assert.equal(reconstructed.replace(/\s/g,''),long.replace(/\s/g,''));
});
test('期中 GROW 所有答案、簽名與分析數據映射，内部追蹤不另加章節',()=>{
 const draft={counselor:'主訪',companionCounselor:'陪訪',summary:'訪談總結',renewalFoundationSnapshot:'僅系統內部'};
 for(const [group,count] of [['goal',5],['reality',5],['option',4],['forward',6]])for(let i=0;i<count;i++)draft[`${group}_${i}`]=`${group}答案${i}`;
 const values=domain.fields(draft,'範例','midterm',{metrics:{givenIn:2,givenOut:4},score:76,light:'綠燈'});
 for(const [key,value] of Object.entries(draft))if(/_\d$/.test(key))assert.equal(values[`${key}.0`],value);
 assert.equal(values['metric.given'],'6');assert.equal(values.scoreNote,'76分 綠燈');assert.equal(values.memberSignature,'範例');
 assert.equal(values['summary.0'],'訪談總結');assert.ok(!JSON.stringify(values).includes('僅系統內部'));
});
test('續約高低分支、回答、承諾與數據依原填答輸出，不猜測未填數值',()=>{
 const v=domain.fields({'radio:givenCompare':'high',referralsGivenAnswer:'高於平均的原因','radio:visitorCompare':'high',visitorsAnswer:'邀請經驗',amountCompareLow:true,referralAmountAnswer:'金額原因','radio:receivedBenefit':'no',mspUnderstood:true},'範例','renewal',{metrics:{givenIn:7,givenOut:11},averages:{amount:120000},score:85,light:'綠燈'});
 assert.equal(v.givenHigh,'■');assert.equal(v.givenLow,'□');assert.equal(v.givenHighAnswer,'高於平均的原因');assert.equal(v.givenLowAnswer,'');
 assert.equal(v.visitorsHighAnswer,'\n邀請經驗');assert.equal(v.visitorsLowAnswer,'');assert.equal(v.amountLowAnswer,'金額原因');
 assert.equal(v.receivedBenefitNo,'■');assert.equal(v.receivedBenefitYes,'□');assert.equal(v.mspUnderstood,'■');assert.equal(v.policyUnderstood,'□');
 assert.equal(v['metric.given'],'18');assert.equal(v['metric.education'],'');assert.equal(v['average.amount'],'120000');assert.equal(v.score,'85');
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
  const expected=domain.templateFor(type),template=fixture(type,'<w:p><w:r><w:t>{{'+(['new','industry'].includes(type)?'applicant':'member')+'}}</w:t></w:r></w:p>');
  const fetchImpl=async(url,options)=>{assert.equal(url,`/api/interview-template?type=${type}`);assert.equal(options.cache,'no-store');return{ok:true,json:async()=>({templateJson:JSON.stringify(template)})}};
  const cryptoImpl={subtle:{digest:async()=>Buffer.from(expected.sha256,'hex')}};
  const output=await service.generate({type,applicant:'範例',draft:{meetingDate:'2026-09-14'},fetchImpl,cryptoImpl});assert.equal(output.templateId,expected.id);assert.ok(output.blob.size>0);
  await assert.rejects(service.generate({type,applicant:'範例',draft:{meetingDate:'2026-09-14'},fetchImpl}),/版本驗證失敗/);
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
 for(const [file,type] of [['new-member-form','new'],['industry-change-form','industry'],['midterm-form','midterm'],['terminal-form','renewal'],['departure-form','departure']]){
  const source=await readFile(new URL(`../assets/js/${file}.js`,import.meta.url),'utf8'),html=await readFile(new URL(`../${file}.html`,import.meta.url),'utf8');
  assert.doesNotMatch(source,/new Document\(|Packer\.toBlob/);assert.match(source,new RegExp(`FulianInterviewTemplate.generate\\(\\{type:"${type}"`));
  assert.match(source,/\.failure\(\{error\}\);\s*toast\(error.message[^;]*\);\s*return;/);
  if(["midterm","renewal"].includes(type))assert.match(source,/capture\(\);[\s\S]*?renewalFoundationSnapshot:foundationSnapshot[\s\S]*?await window.FulianCaseStateStore.flush\(\)[\s\S]*?FulianInterviewTemplate.generate/);
  assert.match(html,/core\/interview-template-domain.js/);assert.match(html,/services\/interview-template.js/);assert.doesNotMatch(html,/vendor\/docx.iife/);
 }
});
