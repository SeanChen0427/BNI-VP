(function(global){
  "use strict";

  const SCHEMA_VERSION=1;
  const STORAGE_PREFIX="fulian-system-guide-progress-v1";
  const ROLE_HISTORY_SCHEMA_VERSION=1;
  const ROLE_HISTORY_PREFIX="fulian-system-guide-role-history-v1";
  const GUIDE_STATUSES=new Set(["not_started","in_progress","completed","skipped"]);
  const ROLES=new Set(["vp","committee","public"]);
  const TRANSITION_ROLES=new Set(["vp","committee"]);

  function cleanText(value){return typeof value==="string"?value.trim():"";}

  function hash(value){
    let result=2166136261;
    for(const character of String(value||"")){
      result^=character.codePointAt(0);
      result=Math.imul(result,16777619);
    }
    return(result>>>0).toString(36);
  }

  function identityFromSession(session){
    const role=cleanText(session?.role);
    const name=cleanText(session?.name);
    const userId=cleanText(session?.userId);
    if(!ROLES.has(role)||!name)return null;
    return Object.freeze({
      role,
      name,
      key:`${role}-${hash(`${userId}|${name}`)}`
    });
  }

  function storageKey(identity){
    if(!identity?.key||!ROLES.has(identity.role))return"";
    return`${STORAGE_PREFIX}:${identity.key}`;
  }

  function roleHistoryKey(identity){
    const name=cleanText(identity?.name);
    if(!name||!TRANSITION_ROLES.has(identity?.role))return"";
    return`${ROLE_HISTORY_PREFIX}:${hash(name.normalize("NFKC").toLocaleLowerCase("zh-Hant"))}`;
  }

  function emptyProgress(identity){
    return{
      schemaVersion:SCHEMA_VERSION,
      identityKey:identity?.key||"",
      role:identity?.role||"",
      guides:{},
      updatedAt:null
    };
  }

  function normalizeGuideState(value){
    const status=GUIDE_STATUSES.has(value?.status)?value.status:"not_started";
    return{
      version:cleanText(value?.version),
      status,
      currentStep:Math.max(0,Number.isFinite(Number(value?.currentStep))?Math.floor(Number(value.currentStep)):0),
      updatedAt:cleanText(value?.updatedAt)||null,
      completedAt:cleanText(value?.completedAt)||null
    };
  }

  function normalizeProgress(value,identity){
    const result=emptyProgress(identity);
    if(!value||typeof value!=="object"||Array.isArray(value))return result;
    if(value.identityKey&&value.identityKey!==identity?.key)return result;
    const guides=value.guides&&typeof value.guides==="object"&&!Array.isArray(value.guides)?value.guides:{};
    Object.entries(guides).forEach(([guideId,guideState])=>{
      if(cleanText(guideId))result.guides[guideId]=normalizeGuideState(guideState);
    });
    result.updatedAt=cleanText(value.updatedAt)||null;
    return result;
  }

  function readProgress(storage,identity){
    const key=storageKey(identity);
    if(!key||!storage?.getItem)return emptyProgress(identity);
    try{return normalizeProgress(JSON.parse(storage.getItem(key)||"null"),identity);}
    catch{return emptyProgress(identity);}
  }

  function writeProgress(storage,identity,progress){
    const key=storageKey(identity);
    const normalized=normalizeProgress(progress,identity);
    if(!key||!storage?.setItem)return normalized;
    storage.setItem(key,JSON.stringify(normalized));
    return normalized;
  }

  function emptyRoleHistory(identity){
    return{
      schemaVersion:ROLE_HISTORY_SCHEMA_VERSION,
      personKey:roleHistoryKey(identity),
      lastRole:"",
      identities:{},
      pending:null,
      updatedAt:null
    };
  }

  function normalizeRoleHistory(value,identity){
    const result=emptyRoleHistory(identity);
    if(!value||typeof value!=="object"||Array.isArray(value))return result;
    if(value.personKey&&value.personKey!==result.personKey)return result;
    const identities=value.identities&&typeof value.identities==="object"&&!Array.isArray(value.identities)?value.identities:{};
    TRANSITION_ROLES.forEach(role=>{
      const identityKey=cleanText(identities[role]);
      if(identityKey)result.identities[role]=identityKey;
    });
    result.lastRole=TRANSITION_ROLES.has(value.lastRole)?value.lastRole:"";
    const pending=value.pending;
    if(
      pending&&typeof pending==="object"
      &&TRANSITION_ROLES.has(pending.fromRole)
      &&TRANSITION_ROLES.has(pending.toRole)
      &&pending.fromRole!==pending.toRole
      &&cleanText(pending.fromIdentityKey)
      &&cleanText(pending.toIdentityKey)
    ){
      result.pending={
        fromRole:pending.fromRole,
        toRole:pending.toRole,
        fromIdentityKey:cleanText(pending.fromIdentityKey),
        toIdentityKey:cleanText(pending.toIdentityKey),
        guideId:`role-transition:${pending.toRole}`,
        createdAt:cleanText(pending.createdAt)||null
      };
    }
    result.updatedAt=cleanText(value.updatedAt)||null;
    return result;
  }

  function readRoleHistory(storage,identity){
    const key=roleHistoryKey(identity);
    if(!key||!storage?.getItem)return emptyRoleHistory(identity);
    try{return normalizeRoleHistory(JSON.parse(storage.getItem(key)||"null"),identity);}
    catch{return emptyRoleHistory(identity);}
  }

  function writeRoleHistory(storage,identity,history){
    const key=roleHistoryKey(identity);
    const normalized=normalizeRoleHistory(history,identity);
    if(!key||!storage?.setItem)return normalized;
    storage.setItem(key,JSON.stringify(normalized));
    return normalized;
  }

  function completedGlobalGuide(progress){
    return normalizeGuideState(progress?.guides?.["global-shell"]).status==="completed";
  }

  function inheritTerminalGuides(previousProgress,currentProgress,identity,now){
    const result=normalizeProgress(currentProgress,identity);
    let inheritedCount=0;
    Object.entries(previousProgress?.guides||{}).forEach(([guideId,value])=>{
      if(guideId==="global-shell"||guideId.startsWith("role-transition:")||result.guides[guideId])return;
      const state=normalizeGuideState(value);
      if(!["completed","skipped"].includes(state.status)||!state.version)return;
      result.guides[guideId]=state;
      inheritedCount+=1;
    });
    if(inheritedCount)result.updatedAt=now;
    return{progress:result,inheritedCount};
  }

  function pendingRoleTransition(storage,identity){
    const pending=readRoleHistory(storage,identity).pending;
    return pending?.toRole===identity?.role&&pending?.toIdentityKey===identity?.key?pending:null;
  }

  function prepareRoleExperience(storage,identity,now=new Date().toISOString()){
    let progress=readProgress(storage,identity);
    if(!TRANSITION_ROLES.has(identity?.role)||!roleHistoryKey(identity))return{progress,pending:null,inheritedCount:0};
    let history=readRoleHistory(storage,identity);
    if(history.pending?.toRole===identity.role&&history.pending?.toIdentityKey===identity.key){
      return{progress,pending:history.pending,inheritedCount:0};
    }

    history.pending=null;
    const previousRole=history.lastRole;
    const previousIdentityKey=history.identities[previousRole];
    let pending=null;
    let inheritedCount=0;
    if(previousRole&&previousRole!==identity.role&&previousIdentityKey&&previousIdentityKey!==identity.key){
      const previousProgress=readProgress(storage,{role:previousRole,key:previousIdentityKey});
      if(completedGlobalGuide(previousProgress)){
        const inherited=inheritTerminalGuides(previousProgress,progress,identity,now);
        progress=writeProgress(storage,identity,inherited.progress);
        inheritedCount=inherited.inheritedCount;
        pending={
          fromRole:previousRole,
          toRole:identity.role,
          fromIdentityKey:previousIdentityKey,
          toIdentityKey:identity.key,
          guideId:`role-transition:${identity.role}`,
          createdAt:now
        };
      }
    }

    history={
      ...history,
      lastRole:identity.role,
      identities:{...history.identities,[identity.role]:identity.key},
      pending,
      updatedAt:now
    };
    history=writeRoleHistory(storage,identity,history);
    return{progress,pending:history.pending,inheritedCount};
  }

  function finishRoleTransition(storage,identity,outcome,globalGuideVersion,now=new Date().toISOString()){
    let progress=readProgress(storage,identity);
    let history=readRoleHistory(storage,identity);
    const pending=history.pending;
    if(!pending||pending.toRole!==identity?.role||pending.toIdentityKey!==identity?.key){
      return{progress,pending:null};
    }
    const status=outcome==="skipped"?"skipped":"completed";
    progress=updateGuide(progress,identity,"global-shell",globalGuideVersion,{status,currentStep:0},now);
    progress=writeProgress(storage,identity,progress);
    history=writeRoleHistory(storage,identity,{...history,pending:null,lastRole:identity.role,updatedAt:now});
    return{progress,pending:history.pending};
  }

  function guideState(progress,guideId,guideVersion){
    const saved=normalizeGuideState(progress?.guides?.[guideId]);
    if(!saved.version||saved.version!==cleanText(guideVersion)){
      return{...normalizeGuideState(null),version:cleanText(guideVersion)};
    }
    return saved;
  }

  function clampStep(step,totalSteps){
    const total=Math.max(0,Math.floor(Number(totalSteps)||0));
    if(!total)return 0;
    return Math.min(total-1,Math.max(0,Math.floor(Number(step)||0)));
  }

  function updateGuide(progress,identity,guideId,guideVersion,patch,now=new Date().toISOString()){
    const result=normalizeProgress(progress,identity);
    const previous=guideState(result,guideId,guideVersion);
    const status=GUIDE_STATUSES.has(patch?.status)?patch.status:previous.status;
    result.guides={
      ...result.guides,
      [guideId]:{
        ...previous,
        version:cleanText(guideVersion),
        status,
        currentStep:Math.max(0,Math.floor(Number(patch?.currentStep??previous.currentStep)||0)),
        updatedAt:now,
        completedAt:status==="completed"?previous.completedAt||now:null
      }
    };
    result.updatedAt=now;
    return result;
  }

  function shouldAutoStart(progress,guideId,guideVersion,dismissedForSession=false){
    if(dismissedForSession)return false;
    const state=guideState(progress,guideId,guideVersion);
    return state.status!=="completed"&&state.status!=="skipped";
  }

  function roleLabel(role){
    return role==="vp"?"副主席":role==="committee"?"會員委員":role==="public"?"公開填寫者":"使用者";
  }

  global.FulianOnboardingDomain=Object.freeze({
    SCHEMA_VERSION,
    STORAGE_PREFIX,
    ROLE_HISTORY_SCHEMA_VERSION,
    ROLE_HISTORY_PREFIX,
    identityFromSession,
    storageKey,
    roleHistoryKey,
    emptyProgress,
    normalizeProgress,
    readProgress,
    writeProgress,
    emptyRoleHistory,
    normalizeRoleHistory,
    readRoleHistory,
    writeRoleHistory,
    pendingRoleTransition,
    prepareRoleExperience,
    finishRoleTransition,
    guideState,
    clampStep,
    updateGuide,
    shouldAutoStart,
    roleLabel
  });
})(window);
