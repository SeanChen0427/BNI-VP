import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

// Build from the single reviewed manuscript; no membership or backend data is read.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const app=join(root,'apps/vice-chair');
const markedPath=process.env.FULIAN_MARKED_PATH || join(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/marked/lib/marked.esm.js');
if(!existsSync(markedPath))throw new Error('Set FULIAN_MARKED_PATH to the installed marked ES module.');
const {marked}=await import(pathToFileURL(markedPath).href);
const source=await readFile(join(app,'docs/vice-chair-complete-guide.md'),'utf8');
const digest=s=>createHash('sha256').update(s).digest('hex').slice(0,10);
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const sections=[...source.matchAll(/^## (\d+)\. ([^\n]+)\n([\s\S]*?)(?=^## \d+\. |$(?![\s\S]))/gm)].map(m=>({n:Number(m[1]),title:m[2],body:m[3]}));
if(sections.length!==22)throw new Error(`Expected 22 complete topics, got ${sections.length}`);
const routeMap={'vice-chair-handover-playbook.md':0,'vice-chair-complete-guide.md':1,'vice-chair-work-map.md':0,'vice-chair-handover-checklist.md':21,'monthly-committee-meeting.md':6,'monthly-leadership-report.md':7,'meeting-scripts.md':17,'meeting-ceremony-templates.md':18,'closed-handover-script.md':19,'bod-speaking-template.md':20,'321a-review.md':9,'renewal-review.md':10,'renewal-foundation-tracking.md':12,'voting-rules.md':11,'task-management.md':5,'interview-forms.md':8,'OPEN_QUESTIONS.md':22,'workflows.md':8,'accountability-email-workflow.md':12};
const groups=[['接任與工作全貌',[1,2,3]],['每週與每月',[4,5,6,7]],['訪談與會員案件',[8,9,10,11,12]],['協調與偶發工作',[13,14]],['換屆與實作確認',[15,16,21]],['主持與報告參考稿',[17,18,19,20]],['接任資料',[22]]];
const titles=new Map(sections.map(s=>[s.n,s.title]));
function renderSection(s){
  const readable=s.body.replace(/\*\*([^*\n]+)\*\*(?=[\u4e00-\u9fff])/g,'**$1** ');
  let html=marked.parse(readable,{gfm:true}).replace(/<(\/?)(h[3-6])(?=>)/g,(_,slash,tag)=>'<'+slash+'h'+(Number(tag[1])-1));
  const toc=[];
  const ids=new Set();
  html=html.replace(/<h([2-5])>([\s\S]*?)<\/h\1>/g,(match,level,text)=>{
    const label=text.replace(/<[^>]+>/g,'');
    let id=`chapter-${s.n}-${digest(label)}`;
    if(ids.has(id))id+='-'+ids.size;
    ids.add(id);if(Number(level)<=3)toc.push({id,label});
    return `<h${level} id="${id}">${text}</h${level}>`;
  });
  html=html.replace(/<table>/g,'<div class="table-scroll"><table>').replace(/<\/table>/g,'</table></div>');
  html=html.replace(/<a href="([^"]+\.md)(?:#[^"]*)?">([\s\S]*?)<\/a>/g,(_,href,label)=>{
    const file=href.split('/').pop();const n=file==='workflows.md' && label.includes('專業別')?9:routeMap[file];
    return n===undefined?`<span class="source-text" title="來源：${escape(file)}">${label}</span>`:`<a href="#${n?'chapter-'+n:'guide-home'}">${label}</a>`;
  });
  if(s.n===4){html+=`<section class="media-guide"><h2>PALMS 登錄操作教材</h2><p>中心區 V1.0，2022-05-05。教材共六頁，畫面請對照現行 Connect。<a href="assets/docs/training/palms-entry-guide-v1.0-20220505.pdf" target="_blank" rel="noopener">開啟原始 PDF</a></p>${Array.from({length:6},(_,i)=>`<details><summary>閱讀教材第 ${i+1} 頁</summary><img loading="lazy" src="assets/images/training/palms/page-${i+1}.png" alt="PALMS 登錄歷史教材第 ${i+1} 頁"></details>`).join('')}</section>`;}
  const prev=s.n>1?`<a class="secondary" href="#chapter-${s.n-1}">← 上一主題</a>`:'<a class="secondary" href="#guide-home">回工作總覽</a>';
  const next=s.n<22?`<a class="primary" href="#chapter-${s.n+1}">下一主題 →</a>`:'<a class="primary" href="#chapter-21">回交接清單</a>';
  return `<section data-chapter data-version="${digest(s.body)}" id="chapter-${s.n}" hidden><div class="eyebrow">工作指南 ／ ${s.n} · ${sections.length}</div><h1 tabindex="-1">${escape(s.title)}</h1><nav class="chapter-toc" aria-label="本頁內容"><strong>本頁內容</strong><ul>${toc.map(t=>`<li><a href="#${t.id}">${escape(t.label)}</a></li>`).join('')}</ul></nav><div class="chapter-body">${html}</div><footer class="chapter-end"><div class="actions">${prev}<button type="button" class="secondary" data-mark-read>標記這頁已讀</button>${next}</div><p class="chapter-status" aria-live="polite"></p></footer></section>`;
}
const nav=groups.map(([label,ns])=>`<p class="label">${label}</p>${ns.map(n=>`<a href="#chapter-${n}">${escape(titles.get(n))}<span class="read-dot"></span></a>`).join('')}`).join('');
const mapThemes=['#a8caff','#8ce4c5','#ffcc8b','#d5b3ff','#b9d98c','#ffa7bc','#a5dcea'];
const mapDescriptions=['認識角色、接好入口，開始第一輪工作。','從例會到月會，把每一週的責任接起來。','先辨識案件，再進入訪談、判斷與後續追蹤。','掌握協調原則，也知道臨時狀況怎麼接手。','把未完成的工作交清楚，確認能獨立執行。','找到當次需要的講稿，整理成自己的說法。','接任前，一起打開檔案、核對窗口與待辦。'];
const mapShortTitles={1:'認識副主席的角色',2:'取得工作的入口',3:'掌握工作節奏',4:'點名、例會與公告',5:'追蹤關懷與訪談',6:'會員委員會月會',7:'月度領導團隊報告',8:'辨識五種訪談',9:'新會員入會',10:'會員續約',11:'回饋、投票與結案',12:'地基、當責信與資料審閱',13:'會員衝突與三長協作',14:'離會與偶發需求',15:'移交正在進行的責任',16:'判斷交接是否成功',17:'每週報告與宣導',18:'入會、續約與畢業主持',19:'封閉交接與保密承諾',20:'BOD 講解',21:'交接清單與情境驗收',22:'取得資料與確認事項'};
const map=groups.map(([label,ns],i)=>`<section class="map-group" style="--branch-color:${mapThemes[i]}"><h3><button type="button" class="map-branch" id="map-branch-${i}" aria-expanded="${i===1}" aria-controls="map-panel-${i}" data-map-branch="${i}"><span class="branch-number">0${i+1}</span><span>${label}</span><span class="branch-symbol" aria-hidden="true">${i===1?'−':'+'}</span></button></h3><div class="map-panel" id="map-panel-${i}" role="region" aria-labelledby="map-branch-${i}" ${i===1?'':'hidden'}><header class="map-panel-heading"><span class="map-kicker">工作分支 0${i+1} / 07</span><h3>${label}</h3><p>${mapDescriptions[i]}</p><span class="map-topic-count">${ns.length} 個工作入口</span></header><div class="map-nodes">${ns.map((n,j)=>{const section=sections.find(s=>s.n===n);const allHeadings=[...section.body.matchAll(/^#{3,5} ([^\n]+)/gm)];const heading=n===9?allHeadings.filter(h=>h[1]==='321A 完整內部指引'||h[1].startsWith('9.2 ')):allHeadings.filter(h=>section.body.includes('\n### '+h[1]+'\n')).slice(0,2);return `<article class="map-node" style="--node-order:${j}"><span class="node-pin" aria-hidden="true"></span><div class="node-copy"><a class="node-title" href="#chapter-${n}"><span>${mapShortTitles[n]}</span><span aria-hidden="true">↗</span></a><div class="node-shortcuts">${heading.map(h=>`<a href="#chapter-${n}-${digest(h[1])}">${escape(h[1].replace(/^\d+\.\d+\s*/,''))}</a>`).join('')}</div></div></article>`;}).join('')}</div><p class="map-panel-foot">點選工作名稱閱讀完整教學，也可直接進入下方的小節。</p></div></section>`).join('');
const homeHtml=`<section id="guide-home"><header class="guide-hero"><div><div class="eyebrow">富聯分會 · 副主席交接指南</div><h1>把每一項責任，<br><span>接起來。</span></h1><p class="lede">從工作全貌，走進每一步實務。<br>選一個分支，找到你現在需要的做法。</p></div><div class="hero-actions"><a class="primary" href="#chapter-1">第一次接任，從這裡開始 ↗</a><a class="secondary" id="resume" href="#chapter-1" hidden>繼續閱讀</a><span>22 個主題 · 實務心得 · 完整參考稿</span></div></header><section class="work-map" aria-label="副主席工作心智圖"><div class="map-topline"><span class="map-kicker">工作心智圖</span><span class="map-status"><i aria-hidden="true"></i> 點選主幹，展開工作</span></div><div class="map-hub"><span class="hub-mark" aria-hidden="true">聯</span><div><h2>副主席的工作全貌</h2><p>帶領會員委員會，接住會員與分會的需要。</p></div><span class="hub-count" aria-hidden="true">07 <small>工作分支</small></span></div><div class="mindmap">${map}</div></section><details class="reading-route"><summary>第一次閱讀：先接起一輪工作 <span aria-hidden="true">＋</span></summary><ol class="route"><li><a href="#chapter-2">取得入口、窗口與正在進行的案件</a>，說得出下一步由誰做。</li><li><a href="#chapter-4">完成每週點名、報告、公告與 Connect 登錄</a>，接上會前和會後協作。</li><li><a href="#chapter-5">追蹤所有關懷與訪談</a>，再準備<a href="#chapter-6">第一週月會</a>與<a href="#chapter-7">第二週目標方案報告</a>。</li><li>用<a href="#chapter-21">實際交接清單</a>確認能獨立完成，並核對<a href="#chapter-22">接任要取得的資料</a>。</li></ol></details></section>`;
const body=`<a class="skip" href="#main">跳到閱讀內容</a><header class="top"><a class="brand" href="#guide-home"><span>富聯</span>副主席完整工作指南</a><div class="meta">整合閱讀版 · 2026-09-09</div></header><div class="shell"><aside class="sidebar"><button type="button" class="nav-toggle" id="nav-toggle" aria-controls="guide-nav" aria-expanded="false">開啟／收合工作目錄</button><nav id="guide-nav" aria-label="工作目錄"><a href="#guide-home">工作總覽與閱讀路線</a>${nav}</nav></aside><main class="main" id="main"><div class="main-inner"><div class="search-wrap"><label for="search">查工作、判斷方式或參考稿</label><div class="search-line"><input type="search" id="search" placeholder="例如：321A、GROW、代理、續約地基" autocomplete="off"><button type="button" id="clear-search">清除</button></div></div><p id="result-count" class="meta" aria-live="polite" hidden></p><div id="results" class="results" hidden></div>${homeHtml}${sections.map(renderSection).join('')}<div class="bottom"><a href="#guide-home">回工作總覽</a><p id="storage-note">閱讀紀錄只保存在此瀏覽器，與正式案件及交接完成狀態分開。</p></div></div></main></div>`;
const css=await readFile(join(app,'assets/css/handover-guide.css'),'utf8');
const js=await readFile(join(app,'assets/js/handover-guide.js'),'utf8');
function doc(standalone){return `<!doctype html>\n<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#a91419"><title>富聯副主席完整工作指南</title><link rel="icon" type="image/png" sizes="512x512" href="assets/images/fulian-favicon.png"><link rel="apple-touch-icon" href="assets/images/fulian-favicon.png">${standalone?'':'<script src="assets/js/supabase-config.js?v=1"></script><script src="assets/js/auth.js?v=8"></script><script>if(FulianAuth.getSession()?.role==="committee")location.replace("index.html")</script>'}${standalone?'<style>'+css+'</style>':'<link rel="stylesheet" href="assets/css/handover-guide.css">'}</head><body>${body.replaceAll('关懷','關懷')}${standalone?'<script>'+js+'</script>':'<script src="assets/js/handover-guide.js"></script>'}</body></html>\n`;}
// Reuse the workbench's actual navigation and toolbar when building the course.
const workbench=await readFile(join(app,'index.html'),'utf8');
let systemSidebar=workbench.match(/<aside class="sidebar"[\s\S]*?<\/aside>/)[0]
  .replace('nav-item active','nav-item')
  .replace(/<em id="nav(?:Case|Vote)Count">[^<]*<\/em>/g,'')
  .replace('class="vp-only" href="course.html"','class="vp-only active" aria-current="page" href="course.html"')
  .replace('<details class="nav-group"><summary class="nav-item" data-guide-id="nav.learning">','<details class="nav-group" open><summary class="nav-item" data-guide-id="nav.learning">');
const releaseDialog=workbench.match(/<dialog class="release-dialog"[\s\S]*?<\/dialog>/)[0];
const systemToolbar=workbench.match(/<header class="topbar">[\s\S]*?<\/header>/)[0].replace('<strong>工作總覽</strong>','<strong>副主席交接教學</strong>');
const guideBody=body.replace(/<header class="top">[\s\S]*?<\/header>/,'').replace('<main class="main" id="main">','<div class="main" id="main" role="region" aria-label="副主席教學內容">').replace('</main>','</div>').replace('<button type="button" class="nav-toggle"','<div class="course-tools"><button type="button" class="nav-toggle"').replace('開啟／收合工作目錄</button>','章節目錄</button><a href="#guide-home">工作心智圖</a><span id="guide-read-progress" data-guide-id="course.progress" aria-live="polite">0 / 22 主題已讀</span></div>');
const systemHead=`<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="assets/css/dashboard.css?v=4"><link rel="stylesheet" href="assets/css/brand-logo.css?v=1"><link rel="stylesheet" href="assets/css/notification-center.css?v=1"><link rel="stylesheet" href="assets/css/release-notes.css?v=2"><link rel="stylesheet" href="assets/css/onboarding.css?v=7"><link rel="stylesheet" href="assets/css/handover-embedded.css?v=1"><link rel="stylesheet" href="assets/css/handover-course.css?v=1">`;
const systemScripts=`<script src="assets/js/supabase-data.js?v=3"></script><script src="core/calendar-domain.js?v=5"></script><script src="core/case-domain.js?v=9"></script><script src="assets/js/task-store.js?v=8"></script><script src="assets/js/case-state-store.js?v=12"></script><script src="core/accountability-email-domain.js?v=1"></script><script src="core/renewal-foundation-domain.js?v=5"></script><script src="assets/js/renewal-foundation-summary.js?v=3"></script><script src="assets/js/notification-center.js?v=9"></script><script src="assets/js/release-notes.js?v=36"></script><script src="core/onboarding-domain.js?v=3"></script><script src="assets/js/onboarding-guides.js?v=7"></script><script src="assets/js/onboarding-page-guides.js?v=9"></script><script src="assets/js/onboarding.js?v=10"></script><script src="assets/js/handover-course.js?v=1"></script><script src="assets/js/handover-guide.js?v=2"></script>`;
const integrated=doc(false).replace('<title>富聯副主席完整工作指南</title>','<title>副主席交接教學｜富聯分會</title>').replace('<link rel="stylesheet" href="assets/css/handover-guide.css">',systemHead).replace(/<body>[\s\S]*<\/body>/,`<body class="handover-course" data-guide-page="page:course"><div class="app-shell">${systemSidebar}<main class="workspace">${systemToolbar}<div class="guide-surface">${guideBody}</div></main></div><div class="scrim" id="scrim"></div>${releaseDialog}${systemScripts}</body>`);
await writeFile(join(app,'course.html'),integrated);
await writeFile(join(app,'handover-guide.html'),`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>副主席交接教學｜富聯分會</title><link rel="icon" type="image/png" sizes="512x512" href="assets/images/fulian-favicon.png"><link rel="apple-touch-icon" href="assets/images/fulian-favicon.png"><script>location.replace('course.html'+location.search+location.hash)</script></head><body><a href="course.html">進入副主席交接教學</a></body></html>`);
function scopeCss(input){
  const text=input.replace(/\/\*[\s\S]*?\*\//g,'');let out='',pos=0;
  while(pos<text.length){const start=text.indexOf('{',pos);if(start<0){out+=text.slice(pos);break;}const selector=text.slice(pos,start).trim();let end=start+1,depth=1;while(end<text.length&&depth){if(text[end]==='{')depth++;if(text[end]==='}')depth--;end++;}const inner=text.slice(start+1,end-1);
    if(selector.startsWith('@'))out+=selector+'{'+(selector.startsWith('@media')?scopeCss(inner):inner)+'}\n';
    else{let level=0,parts=[],chunk='';for(const c of selector){if(c==='('||c==='[')level++;if(c===')'||c===']')level--;if(c===','&&!level){parts.push(chunk);chunk='';}else chunk+=c;}parts.push(chunk);out+=parts.map(part=>{part=part.trim();if(part===':root'||part==='body'||part==='html')return '.guide-surface';if(part.startsWith('.is-map-home'))return '.guide-surface'+part;if(part.startsWith('body.'))return part.replace(/^body/,'.guide-surface');return '.guide-surface '+part;}).join(',')+'{'+inner+'}\n';}pos=end;
  }return out;
}
await writeFile(join(app,'assets/css/handover-embedded.css'),scopeCss(css));
await writeFile(join(app,'assets/js/handover-catalog.js'),'window.FulianGuideTopics = '+JSON.stringify(sections.map(s=>({id:'chapter-'+s.n,version:digest(s.body)})))+';\n');

const output=join(root,'artifacts/handover-guide');await mkdir(output,{recursive:true});
await writeFile(join(output,'index.html'),doc(true));
const files=['assets/images/fulian-favicon.png','assets/docs/training/palms-entry-guide-v1.0-20220505.pdf',...Array.from({length:6},(_,i)=>`assets/images/training/palms/page-${i+1}.png`)];
for(const file of files){await mkdir(dirname(join(output,file)),{recursive:true});await copyFile(join(app,file),join(output,file));}
const metadata={source:'apps/vice-chair/docs/vice-chair-complete-guide.md',sourceHash:digest(source),chapters:sections.map(s=>({id:s.n,title:s.title,characters:s.body.length,version:digest(s.body)})),originalCourseLessons:26,generatedAt:'2026-09-09',systemEntry:"course.html"};
await writeFile(join(output,'build-info.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(`Built ${sections.length} topics; ${source.length} manuscript characters. Integrated course.html and standalone reader generated.`);
