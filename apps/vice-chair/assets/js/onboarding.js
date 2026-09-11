(function(){
  "use strict";

  const domain=window.FulianOnboardingDomain;
  const catalog=window.FulianOnboardingGuides;
  const config={enabled:true,autoStart:true,...(window.FulianOnboardingConfig||{})};
  const session=window.FulianAuth?.getSession?.();
  const identity=domain?.identityFromSession(config.identity||session);
  const pageName=(location.pathname.split("/").pop()||"index.html").replace(/\.html$/i,"")||"index";
  const pageGuideId=document.body.dataset.guidePage||`page:${pageName}`;
  const existingHelpButton=document.querySelector('[data-guide-id="global.guide-help"]');
  if(!config.enabled||!domain||!catalog||!identity){existingHelpButton?.remove();return;}

  const SESSION_DISMISS_PREFIX="fulian-system-guide-session-dismiss-v1";
  const GUIDE_REQUEST_KEY="fulian-system-guide-request-v1";
  const reduceMotion=window.matchMedia("(prefers-reduced-motion: reduce)");
  const initialExperience=domain.prepareRoleExperience?.(localStorage,identity)||{progress:domain.readProgress(localStorage,identity),pending:null};
  let progress=initialExperience.progress;
  let pendingTransition=initialExperience.pending;
  let activeGuide=null;
  let activeIndex=0;
  let replaying=false;
  let returnFocus=null;
  let uiSnapshot=null;
  let contextScope=null;
  let positionFrame=0;

  const helpButton=existingHelpButton||document.createElement("button");
  const topActions=document.querySelector(".top-actions");
  const headerHost=topActions||document.querySelector("body > header.topbar, body > header.meeting-topbar, body > header.course-topbar, .shell main > header");
  if(!existingHelpButton){
    helpButton.type="button";
    helpButton.className="guide-help-button";
    helpButton.dataset.guideId="global.guide-help";
    helpButton.setAttribute("aria-label","開啟操作教學");
    helpButton.innerHTML='<span class="guide-help-icon" aria-hidden="true">?</span><span>操作教學</span>';
    if(topActions)topActions.insertBefore(helpButton,topActions.firstChild);
    else if(headerHost)headerHost.append(helpButton);
    else{helpButton.classList.add("guide-help-floating");document.body.append(helpButton);}
  }

  const introDialog=document.createElement("dialog");
  introDialog.className="guide-dialog guide-intro-dialog";
  introDialog.setAttribute("aria-labelledby","guideIntroTitle");
  document.body.append(introDialog);

  const centerDialog=document.createElement("dialog");
  centerDialog.className="guide-dialog guide-center-dialog";
  centerDialog.setAttribute("aria-labelledby","guideCenterTitle");
  document.body.append(centerDialog);

  const tourRoot=document.createElement("div");
  tourRoot.className="guide-tour-root";
  tourRoot.hidden=true;
  tourRoot.innerHTML=`
    <div class="guide-click-shield" aria-hidden="true"></div>
    <svg class="guide-mask" aria-hidden="true" preserveAspectRatio="none">
      <defs><mask id="fulianGuideMask"><rect width="100%" height="100%" fill="white"></rect><rect data-guide-hole fill="black" rx="14" ry="14"></rect></mask></defs>
      <rect width="100%" height="100%" fill="rgba(28,26,24,.68)" mask="url(#fulianGuideMask)"></rect>
    </svg>
    <div class="guide-spotlight" aria-hidden="true"></div>
    <section class="guide-card" role="dialog" aria-modal="true" aria-labelledby="guideStepTitle" aria-describedby="guideStepBody">
      <div class="guide-card-progress"></div>
      <header class="guide-card-head">
        <div><small>FULIAN PRODUCT GUIDE</small><span data-guide-step-meta></span></div>
        <button type="button" class="guide-card-close" data-guide-action="pause" aria-label="稍後繼續導覽">×</button>
      </header>
      <div class="guide-card-content">
        <h2 id="guideStepTitle" tabindex="-1"></h2>
        <p id="guideStepBody"></p>
        <div class="guide-fact" data-guide-fact hidden><b></b><span></span></div>
      </div>
      <footer class="guide-card-foot">
        <details class="guide-more">
          <summary aria-label="更多導覽選項">
            <svg class="guide-more-icon" viewBox="0 0 18 4" aria-hidden="true" focusable="false">
              <circle cx="2" cy="2" r="2"></circle>
              <circle cx="9" cy="2" r="2"></circle>
              <circle cx="16" cy="2" r="2"></circle>
            </svg>
          </summary>
          <div class="guide-more-menu">
            <button type="button" data-guide-action="restart">從頭重新開始</button>
            <button type="button" data-guide-action="skip">略過這份導覽</button>
          </div>
        </details>
        <button type="button" class="guide-step-button" data-guide-action="previous">上一步</button>
        <button type="button" class="guide-step-button primary" data-guide-action="next">下一步</button>
      </footer>
    </section>
    <div class="guide-live-region" aria-live="polite" aria-atomic="true"></div>`;
  document.body.append(tourRoot);

  const card=tourRoot.querySelector(".guide-card");
  const spotlight=tourRoot.querySelector(".guide-spotlight");
  const hole=tourRoot.querySelector("[data-guide-hole]");
  const stepTitle=tourRoot.querySelector("#guideStepTitle");
  const stepBody=tourRoot.querySelector("#guideStepBody");
  const stepMeta=tourRoot.querySelector("[data-guide-step-meta]");
  const fact=tourRoot.querySelector("[data-guide-fact]");
  const liveRegion=tourRoot.querySelector(".guide-live-region");
  const previousButton=tourRoot.querySelector('[data-guide-action="previous"]');
  const nextButton=tourRoot.querySelector('[data-guide-action="next"]');
  const moreMenu=tourRoot.querySelector(".guide-more");
  const moreMenuButton=moreMenu.querySelector("summary");

  function roleLabel(){return domain.roleLabel(identity.role);}
  function currentPageGuide(){return pageGuideId?catalog.getGuide(pageGuideId,identity.role):null;}
  function globalGuide(){return catalog.getGuide("global-shell",identity.role);}
  function transitionGuide(){return pendingTransition?catalog.getGuide(pendingTransition.guideId,identity.role):null;}
  function availableGuides(){
    const guideIds=new Set();
    return[transitionGuide(),globalGuide(),currentPageGuide()].filter(guide=>{
      if(!guide||guideIds.has(guide.id))return false;
      guideIds.add(guide.id);
      return true;
    });
  }
  function isTransitionGuide(guide){return Boolean(guide&&pendingTransition?.guideId===guide.id&&pendingTransition?.toIdentityKey===identity.key);}
  function stateFor(guide){return domain.guideState(progress,guide.id,guide.version);}
  function sessionDismissKey(guide){return`${SESSION_DISMISS_PREFIX}:${identity.key}:${guide.id}:${guide.version}`;}
  function isDismissed(guide){return sessionStorage.getItem(sessionDismissKey(guide))==="1";}
  function dismissForSession(guide){sessionStorage.setItem(sessionDismissKey(guide),"1");}

  function persistGuide(guide,patch){
    progress=domain.updateGuide(progress,identity,guide.id,guide.version,patch);
    progress=domain.writeProgress(localStorage,identity,progress);
    updateHelpState();
  }

  function finishTransition(outcome){
    if(!pendingTransition)return;
    const result=domain.finishRoleTransition?.(localStorage,identity,outcome,globalGuide()?.version||catalog.VERSION);
    if(!result)return;
    progress=result.progress;
    pendingTransition=result.pending;
    updateHelpState();
  }

  function statusCopy(guide){
    const state=stateFor(guide);
    if(state.status==="completed")return"已完成，可隨時重看";
    if(state.status==="skipped")return"已略過，可手動開始";
    if(state.status==="in_progress")return`進行中・從第 ${domain.clampStep(state.currentStep,guide.steps.length)+1} 步繼續`;
    return"尚未開始";
  }

  function updateHelpState(){
    const guides=availableGuides();
    const pending=guides.some(guide=>!["completed","skipped"].includes(stateFor(guide).status));
    helpButton.classList.toggle("has-guide-progress",pending);
    helpButton.setAttribute("aria-label",pending?"開啟操作教學，目前仍有未完成導覽":"開啟操作教學");
  }

  function openModal(dialog){
    if(typeof dialog.showModal==="function")dialog.showModal();
    else dialog.setAttribute("open","");
  }

  function closeModal(dialog){
    if(typeof dialog.close==="function"&&dialog.open)dialog.close();
    else dialog.removeAttribute("open");
  }

  function introMarkup(guide,{completion=false}={}){
    const intro=guide.intro;
    const title=completion?`${guide.page}導覽完成`:intro.title;
    const description=completion
      ?"你已看完目前角色可使用的功能。需要複習時，隨時從頁首的「操作教學」重新開啟。"
      :intro.description;
    const action=completion?"關閉":intro.action||"開始完整導覽";
    return`
      <div class="guide-dialog-shell">
        <div class="guide-dialog-visual">
          <div class="guide-brand-lockup"><span class="guide-brand-mark">富聯</span><span><strong>會員委員會工作台</strong><small>SYSTEM OPERATION GUIDE</small></span></div>
          <span class="guide-role-chip">${roleLabel()}版</span>
        </div>
        <div class="guide-dialog-content">
          <small>${completion?"GUIDE COMPLETED":intro.eyebrow}</small>
          <h2 id="guideIntroTitle">${title}</h2>
          <p>${description}</p>
          <div class="guide-overview">
            <div><small>教學版本</small><strong>${roleLabel()}版</strong></div>
            <div><small>內容段落</small><strong>${guide.sections} 個區段</strong></div>
            <div><small>完整步驟</small><strong>${guide.steps.length} 步</strong></div>
          </div>
          <p class="guide-safety-note"><b>安心閱讀</b><span>導覽只會聚焦與說明，不會替你送出、發布、投票、下載、刪除或完成任何正式操作。</span></p>
          <div class="guide-dialog-actions">
            ${completion?"":'<button type="button" class="guide-button" data-intro-action="later">稍後再看</button>'}
            <button type="button" class="guide-button primary" data-intro-action="${completion?"done":"start"}">${action}</button>
          </div>
        </div>
      </div>`;
  }

  function showIntro(guide,options={}){
    if(!guide||!guide.steps.length)return;
    activeGuide=guide;
    introDialog.innerHTML=introMarkup(guide,options);
    introDialog.dataset.completion=options.completion?"true":"false";
    returnFocus=options.returnFocus||document.activeElement;
    openModal(introDialog);
    requestAnimationFrame(()=>introDialog.querySelector(".guide-button.primary")?.focus());
  }

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  function guideCenterMarkup(){
    const guides=availableGuides();
    const rows=guides.map((guide,index)=>{
      const state=stateFor(guide);
      const label=state.status==="in_progress"?"繼續":state.status==="completed"?"重新觀看":"開始";
      return`<div class="guide-center-row">
        <i>${index+1}</i>
        <div><strong>${guide.title}</strong><small>${statusCopy(guide)}・${guide.steps.length} 步</small></div>
        <button type="button" class="guide-button" data-center-guide="${guide.id}">${label}</button>
      </div>`;
    }).join("");
    const references=(window.FulianFoundationControlGuides?.referenceSections?.()||[]).map(section=>
      `<details class="guide-reference-section"><summary>${esc(section.title)}</summary>${section.entries.map(entry=>`<article><h3>${esc(entry.title)}</h3><p>${esc(entry.body)}</p></article>`).join('')}</details>`
    ).join('');
    return`<div class="guide-dialog-shell">
      <div class="guide-dialog-visual">
        <div class="guide-brand-lockup"><span class="guide-brand-mark">富聯</span><span><strong>操作教學中心</strong><small>FULIAN PRODUCT GUIDE</small></span></div>
        <span class="guide-role-chip">${roleLabel()}版</span>
      </div>
      <div class="guide-dialog-content">
        <small>ON-DEMAND GUIDANCE</small>
        <h2 id="guideCenterTitle">需要時，從這裡繼續</h2>
        <p>系統操作教學與副主席制度課程分開保存。你可以重看目前頁面，或重新認識全站工作入口。</p>
        <div class="guide-center-list">${rows}</div>
        ${references?`<section class="guide-reference"><h2>續約地基完整操作說明</h2><p>展開需要的主題查看；實際操作時不會自動跳出教學。</p>${references}</section>`:""}
        <div class="guide-dialog-actions"><button type="button" class="guide-button primary" data-center-action="close">關閉</button></div>
      </div>
    </div>`;
  }

  function openGuideCenter(){
    returnFocus=document.activeElement;
    centerDialog.innerHTML=guideCenterMarkup();
    openModal(centerDialog);
    requestAnimationFrame(()=>centerDialog.querySelector("[data-center-guide]")?.focus());
  }

  function isMobile(){return window.matchMedia("(max-width: 800px)").matches;}
  function visible(element){
    if(!element||!element.isConnected)return false;
    const style=getComputedStyle(element);
    const rect=element.getBoundingClientRect();
    return style.display!=="none"&&style.visibility!=="hidden"&&style.opacity!=="0"&&element.getClientRects().length>0&&rect.width>2&&rect.height>2;
  }

  function snapshotInterface(){
    const sidebar=document.querySelector("#sidebar");
    const scrim=document.querySelector("#scrim");
    const ai=document.querySelector("#aiAssistant");
    const launcher=document.querySelector("#aiLauncher");
    const notificationPanel=document.querySelector("#notificationPanel");
    const notificationBell=document.querySelector("#notificationBell");
    const workspaceDrawer=document.querySelector(".workspace-menu-drawer");
    const workspaceScrim=document.querySelector(".workspace-menu-scrim");
    const workspaceButton=document.querySelector(".workspace-menu-button");
    return{
      details:[...document.querySelectorAll("details")].map(element=>({element,open:element.open})),
      sidebar:{element:sidebar,open:sidebar?.classList.contains("open")||false},
      scrim:{element:scrim,show:scrim?.classList.contains("show")||false},
      ai:{element:ai,hidden:ai?.hidden??true,expanded:launcher?.getAttribute("aria-expanded")||"false",launcher},
      notifications:{element:notificationPanel,hidden:notificationPanel?.hidden??true,expanded:notificationBell?.getAttribute("aria-expanded")||"false",bell:notificationBell},
      workspace:{drawer:workspaceDrawer,open:workspaceDrawer?.classList.contains("open")||false,scrim:workspaceScrim,show:workspaceScrim?.classList.contains("show")||false,button:workspaceButton,expanded:workspaceButton?.getAttribute("aria-expanded")||"false"},
      inert:[...document.body.children,...(contextScope?.matches("dialog[open]")?[...contextScope.children]:[])].filter(element=>element!==tourRoot&&element!==contextScope).map(element=>({element,inert:element.inert})),
      contextScroll:contextScope?{top:contextScope.scrollTop,left:contextScope.scrollLeft}:null
    };
  }

  function setTourInert(value){
    if(!uiSnapshot)return;
    uiSnapshot.inert.forEach(item=>{item.element.inert=value?true:item.inert;});
  }

  function restoreInterface(){
    if(!uiSnapshot)return;
    uiSnapshot.details.forEach(item=>{if(item.element.isConnected)item.element.open=item.open;});
    const {sidebar,scrim,ai,notifications,workspace}=uiSnapshot;
    sidebar.element?.classList.toggle("open",sidebar.open);
    scrim.element?.classList.toggle("show",scrim.show);
    if(ai.element){ai.element.hidden=ai.hidden;ai.launcher?.setAttribute("aria-expanded",ai.expanded);}
    if(notifications.element){notifications.element.hidden=notifications.hidden;notifications.bell?.setAttribute("aria-expanded",notifications.expanded);}
    workspace.drawer?.classList.toggle("open",workspace.open);
    workspace.scrim?.classList.toggle("show",workspace.show);
    workspace.drawer?.setAttribute("aria-hidden",workspace.open?"false":"true");
    workspace.button?.setAttribute("aria-expanded",workspace.expanded);
    document.body.classList.toggle("workspace-nav-open",workspace.open);
    document.body.classList.remove("guide-tour-ai");
    setTourInert(false);
    if(contextScope&&uiSnapshot.contextScroll){contextScope.scrollTop=uiSnapshot.contextScroll.top;contextScope.scrollLeft=uiSnapshot.contextScroll.left;}
    uiSnapshot=null;
  }

  function normalizeTemporaryPanels(reveal){
    if(!uiSnapshot)return;
    document.body.classList.toggle("guide-tour-ai",reveal==="ai");
    const {sidebar,scrim,ai,notifications,workspace}=uiSnapshot;
    if(isMobile()&&reveal!=="sidebar"){
      sidebar.element?.classList.toggle("open",sidebar.open);
      scrim.element?.classList.toggle("show",scrim.show);
    }
    if(reveal!=="ai"&&ai.element){ai.element.hidden=ai.hidden;ai.launcher?.setAttribute("aria-expanded",ai.expanded);}
    if(reveal!=="notifications"&&notifications.element){notifications.element.hidden=notifications.hidden;notifications.bell?.setAttribute("aria-expanded",notifications.expanded);}
    if(reveal!=="workspace-menu"&&workspace.drawer){
      workspace.drawer.classList.toggle("open",workspace.open);
      workspace.scrim?.classList.toggle("show",workspace.show);
      workspace.drawer.setAttribute("aria-hidden",workspace.open?"false":"true");
      workspace.button?.setAttribute("aria-expanded",workspace.expanded);
      document.body.classList.toggle("workspace-nav-open",workspace.open);
    }
  }

  function revealTarget(step,target){
    normalizeTemporaryPanels(step.reveal);
    const parentDetails=target?.closest("details");
    if(parentDetails)parentDetails.open=true;
    if(step.reveal==="sidebar"&&uiSnapshot){
      uiSnapshot.sidebar.element?.classList.add("open");
      if(isMobile())uiSnapshot.scrim.element?.classList.add("show");
    }
    if(step.reveal==="ai"&&uiSnapshot?.ai.element){
      uiSnapshot.ai.element.hidden=false;
      uiSnapshot.ai.launcher?.setAttribute("aria-expanded","true");
    }
    if(step.reveal==="notifications"&&uiSnapshot?.notifications.element){
      uiSnapshot.notifications.element.hidden=false;
      uiSnapshot.notifications.bell?.setAttribute("aria-expanded","true");
    }
    if(step.reveal==="workspace-menu"&&uiSnapshot?.workspace.drawer){
      uiSnapshot.workspace.drawer.classList.add("open");
      uiSnapshot.workspace.scrim?.classList.add("show");
      uiSnapshot.workspace.drawer.setAttribute("aria-hidden","false");
      uiSnapshot.workspace.button?.setAttribute("aria-expanded","true");
      document.body.classList.add("workspace-nav-open");
    }
  }

  function findTarget(step){
    const target=document.querySelector(step.target);
    revealTarget(step,target);
    return target;
  }

  function safeRect(target){
    const rect=target.getBoundingClientRect();
    const padding=8;
    const mobileTopCard=isMobile()&&card.classList.contains("guide-card-mobile-top");
    const viewportTop=mobileTopCard?Math.min(innerHeight-84,card.offsetHeight+18):4;
    const viewportBottom=isMobile()&&!mobileTopCard?Math.max(84,innerHeight-card.offsetHeight-10):innerHeight-4;
    const left=Math.max(4,rect.left-padding);
    const top=Math.min(Math.max(viewportTop,rect.top-padding),viewportBottom-1);
    const right=Math.min(innerWidth-4,rect.right+padding);
    const bottom=Math.max(top+1,Math.min(viewportBottom,rect.bottom+padding));
    return{left,top,right,bottom,width:Math.max(1,right-left),height:Math.max(1,bottom-top)};
  }

  function placeMobileCard(target){
    if(!isMobile()){card.classList.remove("guide-card-mobile-top");return;}
    const rect=target.getBoundingClientRect();
    const bottomCardTop=innerHeight-card.offsetHeight;
    const canFitAboveTarget=rect.top>card.offsetHeight+26;
    card.classList.toggle("guide-card-mobile-top",canFitAboveTarget&&rect.bottom>bottomCardTop-8);
  }

  function scrollTargetIntoView(target){
    const rect=target.getBoundingClientRect();
    const cardHeight=isMobile()?Math.min(innerHeight*.45,390):0;
    const availableBottom=innerHeight-cardHeight-18;
    const outside=rect.top<78||rect.bottom>availableBottom;
    if(!outside)return Promise.resolve();
    target.scrollIntoView({block:"center",inline:"nearest",behavior:"auto"});
    return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  }

  function positionCard(rect){
    if(isMobile())return;
    const margin=16;
    const gap=18;
    const width=card.offsetWidth;
    const height=card.offsetHeight;
    const clamp=(value,min,max)=>Math.min(Math.max(value,min),Math.max(min,max));
    const candidates=[
      {side:"right",left:rect.right+gap,top:clamp(rect.top,margin,innerHeight-height-margin)},
      {side:"left",left:rect.left-width-gap,top:clamp(rect.top,margin,innerHeight-height-margin)},
      {side:"below",left:clamp(rect.left,margin,innerWidth-width-margin),top:rect.bottom+gap},
      {side:"above",left:clamp(rect.left,margin,innerWidth-width-margin),top:rect.top-height-gap}
    ];
    const fits=candidate=>candidate.left>=margin&&candidate.top>=margin&&candidate.left+width<=innerWidth-margin&&candidate.top+height<=innerHeight-margin;
    const chosen=candidates.find(fits)||{
      left:rect.left+rect.width/2<innerWidth/2?innerWidth-width-margin:margin,
      top:clamp(rect.top+rect.height/2<innerHeight/2?innerHeight-height-margin:margin,margin,innerHeight-height-margin)
    };
    card.style.left=`${Math.round(chosen.left)}px`;
    card.style.top=`${Math.round(chosen.top)}px`;
  }

  function positionFor(target){
    if(!activeGuide||tourRoot.hidden||!target)return;
    placeMobileCard(target);
    const rect=safeRect(target);
    [spotlight].forEach(element=>{
      element.style.left=`${rect.left}px`;
      element.style.top=`${rect.top}px`;
      element.style.width=`${rect.width}px`;
      element.style.height=`${rect.height}px`;
    });
    hole.setAttribute("x",String(rect.left));
    hole.setAttribute("y",String(rect.top));
    hole.setAttribute("width",String(rect.width));
    hole.setAttribute("height",String(rect.height));
    const radius=Math.min(18,Math.max(9,parseFloat(getComputedStyle(target).borderRadius)||12));
    hole.setAttribute("rx",String(radius));
    hole.setAttribute("ry",String(radius));
    spotlight.style.borderRadius=`${radius}px`;
    positionCard(rect);
  }

  function schedulePosition(){
    cancelAnimationFrame(positionFrame);
    positionFrame=requestAnimationFrame(()=>{
      if(!activeGuide||tourRoot.hidden)return;
      const target=document.querySelector(activeGuide.steps[activeIndex]?.target);
      if(target)positionFor(target);
    });
  }

  async function renderStep(direction=1){
    if(!activeGuide)return;
    let step=activeGuide.steps[activeIndex];
    let target=findTarget(step);
    while((!target||!visible(target))&&activeIndex>=0&&activeIndex<activeGuide.steps.length){
      if(["localhost","127.0.0.1"].includes(location.hostname))console.warn(`[操作導覽] 已略過不存在或不可見的步驟：${activeGuide.id}/${step.id}`);
      activeIndex+=direction;
      if(activeIndex<0||activeIndex>=activeGuide.steps.length){
        if(direction<0){activeIndex=0;return renderStep(1);}
        return completeTour();
      }
      step=activeGuide.steps[activeIndex];
      target=findTarget(step);
    }
    if(!step||!target)return;
    if(!replaying)persistGuide(activeGuide,{status:"in_progress",currentStep:activeIndex});
    stepMeta.textContent=`${step.section}・${activeIndex+1}／${activeGuide.steps.length}`;
    stepTitle.textContent=step.title;
    stepBody.textContent=step.body;
    fact.hidden=!step.fact;
    if(step.fact){fact.querySelector("b").textContent=step.fact.label;fact.querySelector("span").textContent=step.fact.text;}
    previousButton.disabled=activeIndex===0;
    nextButton.textContent=activeIndex===activeGuide.steps.length-1?"完成導覽":"下一步";
    card.style.setProperty("--guide-progress",`${(activeIndex+1)/activeGuide.steps.length*100}%`);
    card.querySelector(".guide-more").open=false;
    await scrollTargetIntoView(target);
    if(!activeGuide||tourRoot.hidden)return;
    positionFor(target);
    stepTitle.focus({preventScroll:true});
    liveRegion.textContent=`${activeGuide.page}，${step.section}，第 ${activeIndex+1} 步，共 ${activeGuide.steps.length} 步：${step.title}。${step.body}`;
  }

  function startGuide(guide,{restart=false}={}){
    if(!guide||!guide.steps.length)return;
    closeModal(introDialog);
    closeModal(centerDialog);
    returnFocus=returnFocus||document.activeElement;
    const state=stateFor(guide);
    const transitionReset=isTransitionGuide(guide)&&["completed","skipped"].includes(state.status);
    replaying=state.status==="completed"&&!isTransitionGuide(guide);
    activeGuide=guide;
    activeIndex=restart||replaying||transitionReset?0:domain.clampStep(state.currentStep,guide.steps.length);
    uiSnapshot=snapshotInterface();
    if(contextScope?.matches("dialog[open]"))contextScope.append(tourRoot);
    setTourInert(true);
    document.body.classList.add("guide-tour-active");
    tourRoot.hidden=false;
    renderStep(1);
  }

  function endTour({restoreFocus=true}={}){
    cancelAnimationFrame(positionFrame);
    restoreInterface();
    document.body.classList.remove("guide-tour-active");
    card.classList.remove("guide-card-mobile-top");
    tourRoot.hidden=true;
    document.body.append(tourRoot);
    contextScope=null;
    const focusTarget=returnFocus?.isConnected?returnFocus:helpButton;
    activeGuide=null;
    activeIndex=0;
    replaying=false;
    if(restoreFocus)requestAnimationFrame(()=>focusTarget?.focus?.());
  }

  function pauseTour(){
    if(activeGuide&&!replaying)persistGuide(activeGuide,{status:"in_progress",currentStep:activeIndex});
    endTour();
  }

  function skipTour(){
    const transition=isTransitionGuide(activeGuide);
    if(activeGuide&&(!replaying||transition))persistGuide(activeGuide,{status:"skipped",currentStep:activeIndex});
    if(transition)finishTransition("skipped");
    endTour();
  }

  function completeTour(){
    const completedGuide=activeGuide;
    if(!completedGuide)return;
    const transition=isTransitionGuide(completedGuide);
    if(!replaying||transition)persistGuide(completedGuide,{status:"completed",currentStep:completedGuide.steps.length-1});
    if(transition)finishTransition("completed");
    endTour();
  }

  function moveStep(amount){
    if(!activeGuide)return;
    const next=activeIndex+amount;
    if(next>=activeGuide.steps.length)return completeTour();
    if(next<0)return;
    activeIndex=next;
    renderStep(amount>=0?1:-1);
  }

  function trapFocus(event,container){
    if(event.key!=="Tab")return;
    const focusable=[...container.querySelectorAll('button:not([disabled]),summary:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(visible);
    if(!focusable.length){event.preventDefault();return;}
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }

  introDialog.addEventListener("click",event=>{
    const action=event.target.closest("[data-intro-action]")?.dataset.introAction;
    if(!action)return;
    if(action==="start")startGuide(activeGuide);
    if(action==="later"){
      dismissForSession(activeGuide);
      closeModal(introDialog);
      requestAnimationFrame(()=>returnFocus?.focus?.());
    }
    if(action==="done"){
      closeModal(introDialog);
      requestAnimationFrame(()=>helpButton.focus());
    }
  });

  introDialog.addEventListener("cancel",event=>{
    event.preventDefault();
    if(activeGuide&&introDialog.dataset.completion!=="true")dismissForSession(activeGuide);
    closeModal(introDialog);
    requestAnimationFrame(()=>returnFocus?.focus?.());
  });

  centerDialog.addEventListener("click",event=>{
    const guideId=event.target.closest("[data-center-guide]")?.dataset.centerGuide;
    if(guideId){
      if(guideId==="global-shell"&&pageName!=="index"){
        sessionStorage.setItem(GUIDE_REQUEST_KEY,"global-shell");
        location.replace("index.html");
        return;
      }
      const guide=catalog.getGuide(guideId,identity.role);
      returnFocus=helpButton;
      startGuide(guide,{restart:stateFor(guide).status!=="in_progress"});
      return;
    }
    if(event.target.closest('[data-center-action="close"]')){
      closeModal(centerDialog);
      requestAnimationFrame(()=>returnFocus?.focus?.());
    }
  });

  centerDialog.addEventListener("cancel",event=>{
    event.preventDefault();
    closeModal(centerDialog);
    requestAnimationFrame(()=>returnFocus?.focus?.());
  });

  tourRoot.addEventListener("click",event=>{
    event.stopPropagation();
    if(!event.target.closest(".guide-more"))moreMenu.open=false;
    const action=event.target.closest("[data-guide-action]")?.dataset.guideAction;
    if(action==="next")moveStep(1);
    if(action==="previous")moveStep(-1);
    if(action==="pause")pauseTour();
    if(action==="skip")skipTour();
    if(action==="restart"){activeIndex=0;renderStep(1);}
  });

  document.addEventListener("keydown",event=>{
    if(!tourRoot.hidden){
      if(event.key==="Escape"&&moreMenu.open){
        event.preventDefault();
        moreMenu.open=false;
        moreMenuButton.focus();
        return;
      }
      if(event.key==="Escape"){event.preventDefault();pauseTour();return;}
      if(event.key==="ArrowRight"&&!event.metaKey&&!event.ctrlKey&&!event.altKey){event.preventDefault();moveStep(1);return;}
      if(event.key==="ArrowLeft"&&!event.metaKey&&!event.ctrlKey&&!event.altKey){event.preventDefault();moveStep(-1);return;}
      trapFocus(event,card);
      return;
    }
    if(introDialog.open)trapFocus(event,introDialog);
    if(centerDialog.open)trapFocus(event,centerDialog);
  },true);

  helpButton.addEventListener("click",openGuideCenter);
  addEventListener("resize",schedulePosition,{passive:true});
  addEventListener("scroll",schedulePosition,{passive:true,capture:true});

  function noForeignModalOpen(){
    return![...document.querySelectorAll("dialog[open]")].some(dialog=>dialog!==introDialog&&dialog!==centerDialog);
  }

  function autoStart(){
    if(!config.autoStart||!noForeignModalOpen())return false;
    const shell=globalGuide();
    const transition=transitionGuide();
    if(pendingTransition){
      sessionStorage.removeItem(GUIDE_REQUEST_KEY);
      if(pageName!=="index"){
        location.replace("index.html?guide=role-change");
        return true;
      }
      if(transition&&!isDismissed(transition)){showIntro(transition,{returnFocus:helpButton});return true;}
      return false;
    }
    const requested=sessionStorage.getItem(GUIDE_REQUEST_KEY);
    if(requested){
      sessionStorage.removeItem(GUIDE_REQUEST_KEY);
      const requestedGuide=catalog.getGuide(requested,identity.role);
      if(requestedGuide&&requested==="global-shell"&&pageName==="index"){showIntro(requestedGuide,{returnFocus:helpButton});return true;}
    }
    if(shell&&domain.shouldAutoStart(progress,shell.id,shell.version,isDismissed(shell))){
      if(pageName!=="index"){
        sessionStorage.setItem(GUIDE_REQUEST_KEY,"global-shell");
        location.replace("index.html?guide=welcome");
        return true;
      }
      showIntro(shell,{returnFocus:helpButton});
      return true;
    }
    const pageGuide=currentPageGuide();
    if(pageGuide&&domain.shouldAutoStart(progress,pageGuide.id,pageGuide.version,isDismissed(pageGuide))){showIntro(pageGuide,{returnFocus:helpButton});return true;}
    return false;
  }

  function scheduleAutoStart(){
    const attempt=()=>{
      if(autoStart())return;
      const modal=[...document.querySelectorAll("dialog[open]")].find(dialog=>dialog!==introDialog&&dialog!==centerDialog);
      if(modal)modal.addEventListener("close",()=>setTimeout(autoStart,180),{once:true});
    };
    Promise.resolve(document.fonts?.ready).catch(()=>{}).finally(()=>setTimeout(attempt,700));
  }

  // Context tours point at the already-open form; never open, fill or submit it.
  window.FulianOnboarding=Object.freeze({
    openContext(guide,scope,{automatic=false}={}){
      if(!scope?.isConnected||!tourRoot.hidden||introDialog.open||centerDialog.open)return false;
      if(!guide?.steps?.length||!guide.roles?.includes(identity.role))return false;
      if(automatic)return false;
      const modal=scope.closest("dialog");
      if(modal&&!modal.open)return false;
      contextScope=modal||null;
      returnFocus=document.activeElement;
      startGuide(guide,{restart:true});
      return true;
    }
  });
  document.addEventListener("close",event=>{if(contextScope===event.target)endTour({restoreFocus:false});},true);
  document.addEventListener("cancel",event=>{if(contextScope===event.target){event.preventDefault();pauseTour();}},true);
  window.dispatchEvent(new CustomEvent("fulian:guide-ready"));
  updateHelpState();
  scheduleAutoStart();
})();
