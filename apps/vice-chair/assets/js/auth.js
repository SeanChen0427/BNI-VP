(function(){
  const CONFIG_KEY="fulian-auth-config-v1",SESSION_KEY="fulian-auth-session-v1";
  const INACTIVITY_MS=8*60*60*1000,REFRESH_EARLY_MS=2*60*1000;
  const accountDefinitions=Object.freeze({
    admin:Object.freeze({username:"admin",email:"fulian0857+admin@gmail.com",role:"admin"}),
    vp:Object.freeze({username:"vice",email:"fulian0857+vp@gmail.com",role:"vp"}),
    committee:Object.freeze({username:"Fulian",email:"fulian0857+committee@gmail.com",role:"committee"})
  });
  const defaults={
    version:4,
    accounts:{
      admin:{username:accountDefinitions.admin.username},
      vp:{username:accountDefinitions.vp.username},
      committee:{username:accountDefinitions.committee.username}
    },
    vpName:"",
    committee:[],
    updatedAt:"2026-07-20T00:00:00+08:00"
  };
  const supabase=window.FulianSupabaseConfig||{};
  let refreshTimer=0,lastActivityWrite=0,refreshPromise=null,sessionEpoch=0;

  function clone(value){return JSON.parse(JSON.stringify(value));}
  function sanitizedAccounts(){return clone(defaults.accounts);}
  function sanitizeConfig(value={}){
    return{
      ...defaults,
      ...value,
      version:defaults.version,
      accounts:sanitizedAccounts(),
      vpName:typeof value.vpName==="string"?value.vpName:"",
      committee:Array.isArray(value.committee)?value.committee.filter(name=>typeof name==="string"&&name).slice():[]
    };
  }
  function getConfig(){
    try{
      const saved=JSON.parse(localStorage.getItem(CONFIG_KEY)||"null");
      if(!saved)return clone(defaults);
      const clean=sanitizeConfig(saved);
      if(Number(saved.version||0)<defaults.version||JSON.stringify(saved.accounts)!==JSON.stringify(clean.accounts)){
        clean.updatedAt=new Date().toISOString();
        localStorage.setItem(CONFIG_KEY,JSON.stringify(clean));
      }
      return clean;
    }catch{return clone(defaults);}
  }
  function saveConfig(config){
    const clean=sanitizeConfig(config);
    clean.updatedAt=new Date().toISOString();
    localStorage.setItem(CONFIG_KEY,JSON.stringify(clean));
    return clean;
  }
  function getSession(){
    try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||"null");}
    catch{return null;}
  }
  function setSession(session){sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));}
  function clearSession(){sessionEpoch+=1;clearTimeout(refreshTimer);sessionStorage.removeItem(SESSION_KEY);}
  function apiHeaders(accessToken){
    const headers={apikey:supabase.publishableKey,"Content-Type":"application/json"};
    if(accessToken)headers.Authorization=`Bearer ${accessToken}`;
    return headers;
  }
  function authReady(){return /^https:\/\//.test(supabase.url||"")&&/^sb_publishable_/.test(supabase.publishableKey||"");}
  async function jsonRequest(path,options={}){
    const response=await fetch(`${supabase.url}${path}`,options);
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      const error=new Error(data.msg||data.message||data.error_description||data.error||"伺服器驗證失敗");
      error.status=response.status;
      throw error;
    }
    return data;
  }
  async function loadAccount(accessToken,userId){
    const rows=await jsonRequest(`/rest/v1/app_accounts?auth_user_id=eq.${encodeURIComponent(userId)}&select=role,label,enabled`,{
      headers:apiHeaders(accessToken)
    });
    const account=Array.isArray(rows)?rows[0]:null;
    if(!account||!account.enabled)throw new Error("此帳號目前未啟用");
    return account;
  }
  async function loadCommitteeRoster(accessToken){
    const today=new Date().toISOString().slice(0,10);
    const rows=await jsonRequest(`/rest/v1/committee_terms?status=eq.active&starts_on=lte.${today}&or=(ends_on.is.null,ends_on.gte.${today})&people.status=eq.active&select=role,people!inner(display_name,status)&order=created_at.asc`,{
      headers:apiHeaders(accessToken)
    });
    const active=Array.isArray(rows)?rows:[];
    const vpName=active.find(row=>row.role==="vp")?.people?.display_name||"";
    const committee=active
      .filter(row=>row.role==="committee")
      .map(row=>row.people?.display_name)
      .filter(Boolean);
    return saveConfig({...getConfig(),vpName,committee});
  }
  function resolveAccount(username){
    return Object.values(accountDefinitions).find(account=>account.username===username)||null;
  }
  function sessionName(role,committeeName){
    const config=getConfig();
    if(role==="admin")return"系統開發人員 Admin";
    if(role==="vp")return config.vpName;
    if(role==="committee"&&config.committee.includes(committeeName))return committeeName;
    return"";
  }
  async function login(username,password,committeeName){
    const expected=resolveAccount(username);
    if(!expected||!password)return{ok:false,message:"帳號或密碼不正確"};
    if(!authReady())return{ok:false,message:"登入服務尚未設定完成"};
    try{
      const token=await jsonRequest("/auth/v1/token?grant_type=password",{
        method:"POST",
        headers:apiHeaders(),
        body:JSON.stringify({email:expected.email,password})
      });
      const account=await loadAccount(token.access_token,token.user.id);
      if(account.role!==expected.role)throw new Error("帳號角色設定不一致，請聯絡 Admin");
      const roster=await loadCommitteeRoster(token.access_token);
      const name=sessionName(expected.role,committeeName);
      if(expected.role==="vp"&&!name)throw new Error("Supabase 尚未設定現任副主席");
      if(expected.role==="committee"&&!name){
        try{await fetch(`${supabase.url}/auth/v1/logout?scope=local`,{method:"POST",headers:apiHeaders(token.access_token)});}catch{}
        return{ok:false,needsMember:true,committee:roster.committee,message:"請選擇你的會員委員姓名"};
      }
      const now=Date.now();
      const session={
        role:account.role,
        name,
        userId:token.user.id,
        accessToken:token.access_token,
        refreshToken:token.refresh_token,
        expiresAt:now+Number(token.expires_in||3600)*1000,
        loginAt:new Date(now).toISOString(),
        lastActiveAt:now
      };
      setSession(session);
      scheduleRefresh(session);
      return{ok:true,session};
    }catch(error){
      return{ok:false,message:error.status===400?"帳號或密碼不正確":error.message};
    }
  }
  function validate(session=getSession()){
    if(!session||!session.accessToken||!session.refreshToken||!session.userId)return false;
    const now=Date.now(),lastActive=Number(session.lastActiveAt||0);
    if(!lastActive||now-lastActive>INACTIVITY_MS)return false;
    const name=sessionName(session.role,session.name);
    if(!name)return false;
    if(name!==session.name){session.name=name;setSession(session);}
    return["admin","vp","committee"].includes(session.role);
  }
  function can(permission,session=getSession()){
    if(!validate(session))return false;
    const map={manageCredentials:["admin"],setVicePresident:["admin"],manageCommittee:["admin","vp"],finalConfirm:["vp"],feedback:["vp","committee"],vote:["vp","committee"],view:["admin","vp","committee"]};
    return(map[permission]||[]).includes(session.role);
  }
  async function refreshSession(expectedAccessToken=""){
    const latest=getSession();
    if(expectedAccessToken&&latest?.accessToken&&latest.accessToken!==expectedAccessToken)return latest;
    if(refreshPromise)return refreshPromise;
    refreshPromise=(async()=>{
      const current=getSession();
      const refreshEpoch=sessionEpoch;
      if(!current||!current.refreshToken)throw new Error("登入已逾時");
      if(Date.now()-Number(current.lastActiveAt||0)>INACTIVITY_MS)throw new Error("登入已逾時");
      const token=await jsonRequest("/auth/v1/token?grant_type=refresh_token",{
        method:"POST",
        headers:apiHeaders(),
        body:JSON.stringify({refresh_token:current.refreshToken})
      });
      const account=await loadAccount(token.access_token,current.userId);
      if(account.role!==current.role)throw new Error("帳號權限已變更，請重新登入");
      if(refreshEpoch!==sessionEpoch||!getSession())throw new Error("登入已登出");
      const updated={
        ...current,
        accessToken:token.access_token,
        refreshToken:token.refresh_token||current.refreshToken,
        expiresAt:Date.now()+Number(token.expires_in||3600)*1000
      };
      setSession(updated);
      scheduleRefresh(updated);
      return updated;
    })();
    try{return await refreshPromise;}
    finally{refreshPromise=null;}
  }
  function expireSession(){
    clearSession();
    const page=location.pathname.split("/").pop()||"index.html";
    const next=encodeURIComponent(page+location.search+location.hash);
    location.replace(`login.html?reason=session-expired&next=${next}`);
  }
  function scheduleRefresh(session=getSession()){
    clearTimeout(refreshTimer);
    if(!session)return;
    const delay=Math.max(1000,Number(session.expiresAt)-Date.now()-REFRESH_EARLY_MS);
    refreshTimer=setTimeout(()=>refreshSession().catch(expireSession),delay);
  }
  function recordActivity(){
    const now=Date.now();
    if(now-lastActivityWrite<60000)return;
    const session=getSession();
    if(!session)return;
    if(now-Number(session.lastActiveAt||0)>INACTIVITY_MS)return expireSession();
    session.lastActiveAt=now;
    lastActivityWrite=now;
    setSession(session);
  }
  async function logout(){
    const session=getSession();
    clearSession();
    if(session?.accessToken&&authReady()){
      try{await fetch(`${supabase.url}/auth/v1/logout?scope=local`,{method:"POST",headers:apiHeaders(session.accessToken)});}catch{}
    }
    location.href="login.html";
  }
  async function updateSharedPasswords(passwords){
    const session=getSession();
    if(!validate(session)||session.role!=="admin")throw new Error("只有 Admin 可以更新登入密碼");
    const response=await jsonRequest("/functions/v1/manage-shared-credentials",{
      method:"POST",
      headers:apiHeaders(session.accessToken),
      body:JSON.stringify({passwords})
    });
    return response;
  }
  async function authorizedFetch(path,options={}){
    let session=getSession();
    if(!validate(session))throw new Error("登入已逾時");
    if(Number(session.expiresAt)-Date.now()<30000)session=await refreshSession(session.accessToken);
    const request=()=>fetch(`${supabase.url}${path}`,{
      ...options,
      headers:{...apiHeaders(session.accessToken),...(options.headers||{})}
    });
    let response=await request();
    if(response.status===401){
      session=await refreshSession(session.accessToken);
      response=await fetch(`${supabase.url}${path}`,{
        ...options,
        headers:{...apiHeaders(session.accessToken),...(options.headers||{})}
      });
    }
    return response;
  }
  window.FulianAuth={
    getConfig,saveConfig,getSession,login,logout,validate,can,refreshSession,updateSharedPasswords,authorizedFetch,
    defaults:()=>clone(defaults)
  };

  const page=location.pathname.split("/").pop()||"index.html";
  if(page!=="login.html"){
    const session=getSession();
    if(!validate(session)){
      clearSession();
      const next=encodeURIComponent(page+location.search+location.hash);
      location.replace(`login.html?next=${next}`);
      return;
    }
    scheduleRefresh(session);
    ["click","keydown","touchstart"].forEach(eventName=>addEventListener(eventName,recordActivity,{passive:true}));
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)recordActivity();});
    document.addEventListener("DOMContentLoaded",()=>{
      document.documentElement.dataset.sessionRole=session.role;
      document.querySelectorAll("[data-auth-name]").forEach(node=>node.textContent=session.name);
      document.querySelectorAll("[data-auth-role]").forEach(node=>node.textContent=session.role==="admin"?"系統開發人員 Admin":session.role==="vp"?"副主席":"會員委員");
      document.querySelectorAll("[data-auth-logout]").forEach(node=>{if(!node.hasAttribute("onclick"))node.addEventListener("click",event=>{event.preventDefault();logout();});});
    });
  }
})();
