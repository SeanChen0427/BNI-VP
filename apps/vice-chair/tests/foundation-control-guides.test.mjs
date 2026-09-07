import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const code=read('assets/js/foundation-control-guides.js');
function fixture(role='vp'){
  const elements=new Map(),requests=[],buttons=[{hidden:false}];
  function element(selector,{hidden=false,value='',options=[]}={}){
    const attrs=new Map();const item={value,hidden,options,textContent:selector,
      closest:s=>s==='[hidden]'&&hidden?{}:null,getClientRects:()=>[{}],
      setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),attrs};
    elements.set(selector,item);return item;
  }
  const document={querySelectorAll:selector=>selector==='[data-foundation-guide]'?buttons:[...elements.values()].filter(x=>x.attrs.has('data-guide-id')),addEventListener:()=>{}};
  const window={FulianAuth:{getSession:()=>({role})},FulianOnboarding:{openContext:(...args)=>requests.push(args)}};
  vm.runInNewContext(code,{window,document});
  const scope={querySelector:s=>elements.get(s)||null,querySelectorAll:s=>s==='#action option'?elements.get('#action')?.options||[]:[]};
  return{api:window.FulianFoundationControlGuides,element,scope,elements,requests,buttons};
}
test('紀錄教學按當前動作顯示欄位，所有動作說明都指到同一個有效選單',()=>{
  const f=fixture();
  f.element('#action',{value:'reminder',options:[{value:'reminder',textContent:'已實際提醒'},{value:'note',textContent:'補充紀錄'},{value:'resolve',textContent:'人工確認結果'}]});
  f.element('#contactedOn');f.element('#note');f.element('#recordStatus',{hidden:true});f.element('#periodKey',{hidden:true});
  const guide=f.api.build(f.scope,'record');
  assert.equal(guide.steps.filter(x=>x.target===guide.steps[0].target).length,3);
  assert.ok(guide.steps.some(x=>x.title.startsWith('實際提醒日期')));
  assert.ok(!guide.steps.some(x=>x.title.startsWith('確認哪一期')));
  for(const step of guide.steps){const id=step.target.match(/="([^"]+)"/)[1];assert.equal([...f.elements.values()].filter(x=>x.attrs.get('data-guide-id')===id).length,1);}
  f.elements.get('#action').value='confirm-quarter';f.elements.get('#action').options=[{value:'confirm-quarter',textContent:'確認本期工作坊'}];
  f.element('#periodKey');f.element('#completedCount');f.element('#attendedOn');f.element('#contactedOn',{hidden:true});
  const workshop=f.api.build(f.scope,'record');assert.ok(workshop.steps.some(x=>x.title.startsWith('確認哪一期')));assert.notEqual(guide.id,workshop.id);
});
test('教學不改輸入，取消／保存／新增下一項與更正原因均有明確說明',()=>{
  const f=fixture();for(const selector of ['#kind','#target','#amendReason','#saveAndAddFoundation','#definitionForm button.primary[type="submit"]','#definitionForm footer [data-close]'])f.element(selector,{value:selector==='#target'?'4':'flexible'});
  const guide=f.api.build(f.scope,'definition');assert.equal(f.elements.get('#target').value,'4');
  assert.ok(guide.steps.some(x=>x.title.includes('修改原因')));assert.ok(guide.steps.some(x=>x.body.includes('取消只放棄尚未保存')));assert.ok(guide.steps.some(x=>x.body.includes('沒有自動保存')));
  f.api.open(f.scope,'definition',true);assert.equal(f.requests.length,1);assert.equal(f.requests[0][2].automatic,true);
});
test('會員卡只解說已顯示的可用操作，Admin 不載入操作教學',()=>{
  const f=fixture('committee');f.element('summary');f.element('[data-detail]');f.element('[data-record]');
  const guide=f.api.build(f.scope,'card');assert.equal(guide.steps.length,3);assert.ok(!guide.steps.some(x=>x.title.includes('刪除')));
  const admin=fixture('admin');assert.equal(admin.api,undefined);assert.equal(admin.buttons[0].hidden,true);
});
test('主選單遮罩的 hover 樣式勝過頁面通用 button:hover，保持半透明',()=>{
  const css=read('assets/css/renewal-foundations.css')+'\n'+read('assets/css/workspace-nav.css');
  function color(hover){
    const matching=new Set(['button','.workspace-menu-scrim',...(hover?['button:hover','.workspace-menu-scrim:hover']:[])]);
    const candidates=[];for(const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
      const bg=match[2].match(/(?:^|;)\s*background:([^;]+);/);if(!bg)continue;
      for(const selector of match[1].trim().split(',').map(x=>x.trim()))if(matching.has(selector))candidates.push({color:bg[1].trim(),specificity:(selector.match(/[.:]/g)||[]).length*10+(selector.startsWith('button')?1:0)});
    }
    candidates.sort((a,b)=>a.specificity-b.specificity);return candidates.at(-1).color;
  }
  assert.equal(color(false),'#19110e73');assert.equal(color(true),color(false));
});
test('表單導覽留在原生對話框上層，結束時移回並恢復原介面',()=>{
  const engine=read('assets/js/onboarding.js');
  assert.match(engine,/contextScope\.append\(tourRoot\)/);assert.match(engine,/element!==contextScope/);
  assert.match(engine,/contextScope\.scrollTop=uiSnapshot\.contextScroll\.top/);
  assert.match(engine,/document\.body\.append\(tourRoot\);\s+contextScope=null/);
  assert.match(engine,/if\(contextScope===event\.target\)\{event\.preventDefault\(\);pauseTour\(\);\}/);
});
