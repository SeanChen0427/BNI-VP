import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../assets/js/case-creator.js',import.meta.url),'utf8');
function fixture(){
 const nodes=new Map();const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',innerHTML:'',textContent:'',hidden:false,required:false});return nodes.get(selector);};
 const values=new Map();let saved=0;
 const context={members:[{memberId:'active-a',name:'測試甲',profession:'法律服務'},{memberId:'active-b',name:'測試乙',profession:'IT服務'}],departureMembers:[{memberId:'departed-c',name:'離會丙',status:'departed',profession:'過往業別'}],types:{midterm:{existing:true,stage:'待訪談',form:'midterm-form.html'},new:{},departure:{existing:true}},esc:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),document:{querySelector:node,querySelectorAll:()=>[]},localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},KEY:'tasks',session:{name:'測試主責'},window:{FulianCaseDomain:{createTaskId:()=> 'synthetic-task'},FulianTaskStore:{flush:async()=>saved++}},location:{href:''},alert:message=>assert.fail(message)};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  function memberOptionValue'),source.indexOf('  async function open(')),context);
 vm.runInContext(source.slice(source.indexOf('  async function submit('),source.indexOf('  async function init(')),context);
 node('#createType').value='midterm';return{context,node,values,get saved(){return saved;}};
}
test('既有會員案件使用原生下拉選單；新申請者與離會欄位各自驗證',()=>{
 const f=fixture();f.context.configureMemberField();assert.equal(f.node('#createExistingMemberField').hidden,false);assert.equal(f.node('#createExistingMember').required,true);assert.equal(f.node('#createMember').required,false);
 f.node('#createType').value='new';f.context.configureMemberField();assert.equal(f.node('#createExistingMemberField').hidden,true);assert.equal(f.node('#createExistingMember').required,false);assert.equal(f.node('#createMember').required,true);
 f.node('#createType').value='departure';f.context.configureMemberField('departed-c');assert.equal(f.node('#createDepartureMember').required,true);assert.equal(f.node('#createExistingMember').required,false);assert.equal(f.node('#createProfession').value,'過往業別');
 assert.match(source,/<select id="createExistingMember"/);assert.doesNotMatch(source,/<datalist|\/api\/bni-analysis/);
});
test('可按姓名或專業搜尋；清除不匹配選擇與專業，不自選第一個或混入離會者',()=>{
 const f=fixture();f.context.configureMemberField();assert.match(f.node('#createExistingMember').innerHTML,/測試甲/);assert.match(f.node('#createExistingMember').innerHTML,/測試乙/);assert.doesNotMatch(f.node('#createExistingMember').innerHTML,/離會丙/);assert.equal(f.node('#createExistingMember').value,'');
 f.node('#createExistingMember').value='active-a';f.context.syncProfession();assert.equal(f.node('#createProfession').value,'法律服務');
 f.node('#createMemberSearch').value='it';f.context.renderExistingMembers();assert.match(f.node('#createExistingMember').innerHTML,/測試乙/);assert.doesNotMatch(f.node('#createExistingMember').innerHTML,/測試甲/);assert.equal(f.node('#createExistingMember').value,'');assert.equal(f.node('#createProfession').value,'');
 f.node('#createMemberSearch').value='不存在';f.context.renderExistingMembers();assert.match(f.node('#createMemberCount').textContent,/找不到/);
 f.context.members=[];f.context.renderExistingMembers();assert.match(f.node('#createMemberCount').textContent,/沒有可選/);
});
test('期中案件必須實際選取會員，保存正式識別碼並導到同一案件訪談',async()=>{
 const f=fixture();f.node('#createMember').value='測試甲';await f.context.submit({preventDefault(){}});assert.equal(f.saved,0);
 f.node('#createExistingMember').value='forged-id';await f.context.submit({preventDefault(){}});assert.equal(f.saved,0);
 f.node('#createExistingMember').value='active-b';f.context.syncProfession();await f.context.submit({preventDefault(){}});assert.equal(f.saved,1);
 const task=JSON.parse(f.values.get('tasks'))[0];assert.equal(task.member,'測試乙');assert.equal(task.memberRecordId,'active-b');assert.equal(task.profession,'IT服務');assert.equal(f.context.location.href,'midterm-form.html?task=synthetic-task');
});
