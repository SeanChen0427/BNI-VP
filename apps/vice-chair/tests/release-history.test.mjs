import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source = readFileSync(new URL('../assets/js/release-notes.js', import.meta.url), 'utf8');
function setup(role = 'vp', storage = new Map()) {
  const nodes = new Map();
  const document = {readyState:'complete', activeElement:null, querySelector:selector=>nodes.get(selector)||null};
  for (const id of ['releaseNotesHistory','releaseSearch','clearReleaseSearch','loadMoreReleases','releaseResultCount','releaseEmpty','markReleaseRead','currentReleaseVersion','currentReleaseDate']) {
    const node={innerHTML:'',textContent:'',value:'',hidden:false,disabled:false,events:{},attrs:{},addEventListener(event,handler){this.events[event]=handler;},insertAdjacentHTML(position,html){this.innerHTML+=html;},setAttribute(key,value){this.attrs[key]=value;},focus(){document.activeElement=this;}};
    nodes.set('#'+id,node);
  }
  const window={FulianAuth:{getSession:()=>({role,name:'測試使用者'})}};
  vm.runInNewContext(source,{window,document,localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}});
  const get=id=>nodes.get('#'+id);
  const versions=()=>[...get('releaseNotesHistory').innerHTML.matchAll(/<b>v([\d.]+)<\/b>/g)].map(match=>match[1]);
  return {get,versions,window,document,storage,search(value){get('releaseSearch').value=value;get('releaseSearch').events.input();}};
}
test('更新歷史每次十版、追加不重建已展開內容、末頁不重複且恢復焦點',()=>{
  const ui=setup();
  const releases=ui.window.FulianReleaseNotes.releases;
  assert.equal(ui.versions().length,10);
  assert.match(ui.get('releaseNotesHistory').innerHTML, /current" open/);
  const initial=ui.get('releaseNotesHistory').innerHTML;
  ui.get('loadMoreReleases').events.click();
  assert.equal(ui.versions().length,20);
  assert.ok(ui.get('releaseNotesHistory').innerHTML.startsWith(initial));
  ui.get('loadMoreReleases').focus();
  while(!ui.get('loadMoreReleases').hidden)ui.get('loadMoreReleases').events.click();
  assert.deepEqual(ui.versions(),Array.from(releases,r=>r.version));
  assert.equal(new Set(ui.versions()).size,releases.length);
  assert.equal(ui.document.activeElement,ui.get('releaseResultCount'));
});
test('搜尋全部歷史而非已載入十筆，支援日期、大小寫、無結果與清除',()=>{
  const ui=setup();
  const last=ui.window.FulianReleaseNotes.releases.at(-1);
  ui.search(' V'+last.version+' ');
  assert.ok(ui.versions().includes(last.version));
  ui.search('地基');
  assert.ok(ui.versions().length>0);
  ui.search('無此功能<>');
  assert.equal(ui.versions().length,0);
  assert.equal(ui.get('releaseEmpty').hidden,false);
  assert.equal(ui.get('loadMoreReleases').hidden,true);
  ui.search('2026/09/08');
  assert.ok(ui.versions().length>0);
  ui.get('clearReleaseSearch').events.click();
  assert.equal(ui.versions().length,10);
  assert.equal(ui.get('clearReleaseSearch').disabled,true);
  assert.equal(ui.get('releaseEmpty').hidden,true);
  assert.equal(ui.document.activeElement,ui.get('releaseSearch'));
  assert.equal(ui.get('currentReleaseVersion').textContent,'v1.7.2');
});
test('只按明確已讀按鈕才保存提示，三角色可閱讀且已讀狀態隔離',()=>{
  const storage=new Map();
  const vp=setup('vp',storage);
  assert.equal(storage.size,0);
  vp.get('markReleaseRead').events.click();
  assert.equal(storage.size,1);
  assert.equal(vp.get('markReleaseRead').disabled,true);
  assert.equal(setup('vp',storage).get('markReleaseRead').disabled,true);
  for(const role of ['committee','admin']){
    const ui=setup(role,storage);
    assert.equal(ui.versions().length,10);
    assert.equal(ui.get('markReleaseRead').disabled,false);
  }
});
