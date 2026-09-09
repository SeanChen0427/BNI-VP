(() => {
  'use strict';
  const root = document.querySelector('.guide-surface') || document.body;
  const chapters = [...root.querySelectorAll('[data-chapter]')];
  const home = document.getElementById('guide-home');
  const search = document.getElementById('search');
  const results = document.getElementById('results');
  const resultCount = document.getElementById('result-count');
  const identity = window.FulianAuth?.getSession()?.name || 'local-reader';
  const key = 'fulian-complete-guide-v1:' + identity;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { saved = {}; }
  if(typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  if(!saved.read || typeof saved.read !== 'object' || Array.isArray(saved.read)) saved.read = {};
  if(!saved.positions || typeof saved.positions !== 'object' || Array.isArray(saved.positions)) saved.positions = {};
  let current = null;
  let timer;
  let resuming = false;
  const persist = () => { try { localStorage.setItem(key, JSON.stringify(saved)); } catch { document.getElementById('storage-note').textContent = '此瀏覽器無法保存閱讀紀錄；仍可自由閱讀與查詢。'; } };
  const index = chapters.map(el => {
    let heading=el.id;
    const chunks=[...el.querySelector('.chapter-body').querySelectorAll('p,li,tr,h2,h3,h4,h5,pre')].map(p=>{const isHeading=/^H[2-5]$/.test(p.tagName);if(isHeading)heading=p.id;return {text:p.textContent,target:heading,isHeading};});
    return {id:el.id,title:el.querySelector('h1').textContent,chunks};
  });
  function updateRead() {
    for(const el of chapters) {
      const done = saved.read[el.id] === el.dataset.version;
      el.querySelector('[data-mark-read]').textContent = done ? '這頁已讀・再次標記為未讀' : '標記這頁已讀';
      el.querySelector('.chapter-status').textContent = done ? '已讀。實際操作與交接仍依清單另外確認。' : saved.read[el.id] ? '本頁內容已更新，請重新閱讀；先前紀錄仍保留。' : '閱讀與實際交接分開確認。';
      const nav = root.querySelector('.sidebar a[href="#'+el.id+'"] .read-dot');
      if(nav) nav.textContent = done ? '已讀' : '';
    }
    const progress = document.getElementById('guide-read-progress');
    if(progress) progress.textContent = chapters.filter(el=>saved.read[el.id]===el.dataset.version).length+' / '+chapters.length+' 主題已讀';
    const resume = document.getElementById('resume');
    const last = chapters.find(c=>c.id===saved.last);
    resume.hidden = !last;
    if(last) { resume.href='#'+last.id; resume.textContent='繼續：'+last.querySelector('h1').textContent; }
  }
  function showRoute({restore=false}={}) {
    let id='guide-home';
    try { id=decodeURIComponent(location.hash.slice(1)||id); } catch { /* Invalid links return to the guide overview. */ }
    const target = document.getElementById(id);
    const page = target?.closest('[data-chapter]') || (target?.hasAttribute('data-chapter') ? target : null);
    current = page;
    home.hidden = !!page;
    root.classList.toggle('is-map-home', !page);
    chapters.forEach(c=>{c.hidden=c!==page;});
    root.querySelectorAll('.sidebar a').forEach(a=>{if(a.hash==='#'+(page?.id||'guide-home'))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    root.querySelector('.sidebar').dataset.open='false';
    document.getElementById('nav-toggle').setAttribute('aria-expanded','false');
    if(page) {saved.last=page.id;persist();}
    document.title=(page? page.querySelector('h1').textContent+'｜':'')+(root===document.body?'富聯副主席完整工作指南':'副主席交接教學｜富聯分會');
    requestAnimationFrame(()=>{
      if(restore && page && Number.isFinite(saved.positions[page.id])) window.scrollTo(0,Math.max(0,saved.positions[page.id]));
      else if(target && target!==page && target!==home) target.scrollIntoView({block:'start'});
      else window.scrollTo(0,0);
      if(page) page.querySelector('h1').focus({preventScroll:true});
    });
  }
  function findMatches() {
    const q=search.value.trim().toLocaleLowerCase();
    results.replaceChildren();
    results.hidden=!q;
    resultCount.hidden=!q;
    if(!q) return;
    const terms=q.split(/\s+/).filter(Boolean);
    const matches=[];
    for(const page of index){
      const combined=page.title+' '+page.chunks.map(c=>c.text).join(' ');
      if(!terms.every(t=>combined.toLocaleLowerCase().includes(t)))continue;
      const relevance=c=>terms.filter(t=>c.text.toLocaleLowerCase().includes(t)).length+(c.isHeading?4:0)+(c.text.toLocaleLowerCase().startsWith(q)?2:0);
      const candidates=page.chunks.filter(c=>terms.some(t=>c.text.toLocaleLowerCase().includes(t))).sort((a,b)=>relevance(b)-relevance(a));
      const chunk=candidates[0]||page.chunks[0];
      const score=terms.filter(t=>page.title.toLocaleLowerCase().includes(t)).length*8+(chunk?relevance(chunk):0);
      matches.push({...page,chunk,score});
    }
    resultCount.textContent='找到 '+matches.length+' 個相關主題';
    for(const page of matches.sort((a,b)=>b.score-a.score)){
      const link=document.createElement('a');link.className='result';link.href='#'+(page.chunk?.target||page.id);
      const title=document.createElement('strong');title.textContent=page.title;link.append(title);
      const snippet=document.createElement('span');const txt=page.chunk?.text||'';const pos=Math.max(0,txt.toLocaleLowerCase().indexOf(terms[0]));const start=Math.max(0,pos-40);snippet.textContent=(start?'…':'')+txt.slice(start,start+170)+(txt.length>start+170?'…':'');link.append(snippet);
      link.addEventListener('click',()=>{search.value='';findMatches();});results.append(link);
    }
    if(!matches.length){const p=document.createElement('p');p.className='empty';p.textContent='沒有找到。試試「321A」「代理」「訪談」「地基」等工作名稱，或從工作總覽選主題。';results.append(p);}
  }
  const branchButtons = [...root.querySelectorAll('[data-map-branch]')];
  for(const button of branchButtons) button.addEventListener('click',()=>{
    const opening = button.getAttribute('aria-expanded') !== 'true';
    for(const branch of branchButtons) {
      const selected = branch === button && opening;
      branch.setAttribute('aria-expanded', String(selected));
      branch.querySelector('.branch-symbol').textContent = selected ? '−' : '+';
      document.getElementById(branch.getAttribute('aria-controls')).hidden = !selected;
    }
  });
  search.addEventListener('input',findMatches);
  document.getElementById('clear-search').addEventListener('click',()=>{search.value='';findMatches();search.focus();});
  root.querySelector('.skip').addEventListener('click',e=>{e.preventDefault();const main=document.getElementById('main');main.setAttribute('tabindex','-1');main.focus();main.scrollIntoView({block:'start'});});
  root.querySelectorAll('[data-mark-read]').forEach(btn=>btn.addEventListener('click',()=>{const el=btn.closest('[data-chapter]');if(saved.read[el.id]===el.dataset.version)delete saved.read[el.id];else saved.read[el.id]=el.dataset.version;persist();updateRead();}));
  document.getElementById('nav-toggle').addEventListener('click',e=>{const side=root.querySelector('.sidebar');const open=side.dataset.open!=='true';side.dataset.open=String(open);e.currentTarget.setAttribute('aria-expanded',String(open));});
  document.getElementById('resume').addEventListener('click',()=>{resuming=true;if(location.hash==='#'+saved.last){showRoute({restore:true});resuming=false;}});
  addEventListener('hashchange',()=>{showRoute({restore:resuming});resuming=false;updateRead();});
  addEventListener('scroll',()=>{clearTimeout(timer);const page=current;timer=setTimeout(()=>{if(page && page===current){saved.last=page.id;saved.positions[page.id]=window.scrollY;persist();}},180);},{passive:true});
  updateRead();showRoute();
})();
