import assert from "node:assert/strict";
import { readFileSync,readdirSync } from "node:fs";
import vm from "node:vm";

const appUrl=new URL("../",import.meta.url);
const html=readFileSync(new URL("../login.html",import.meta.url),"utf8");
const source=readFileSync(new URL("../assets/js/auth.js",import.meta.url),"utf8");
const loginSource=readFileSync(new URL("../assets/js/login.js",import.meta.url),"utf8");
const settingsSource=readFileSync(new URL("../assets/js/settings.js",import.meta.url),"utf8");
const supabaseConfig=readFileSync(new URL("../assets/js/supabase-config.js",import.meta.url),"utf8");
const supabaseData=readFileSync(new URL("../assets/js/supabase-data.js",import.meta.url),"utf8");
const memberDirectory=readFileSync(new URL("../assets/js/member-directory.js",import.meta.url),"utf8");
const edgeFunction=readFileSync(new URL("../../../supabase/functions/manage-shared-credentials/index.ts",import.meta.url),"utf8");
const appApiFunction=readFileSync(new URL("../../../supabase/functions/app-api/index.ts",import.meta.url),"utf8");

assert.doesNotMatch(html,/查看初版測試帳密|demo-accounts/);
assert.match(source,/version:4/);
assert.match(source,/username:"admin"/);
assert.match(source,/username:"vice"/);
assert.match(source,/username:"Fulian"/);
assert.doesNotMatch(source,/password:"[^"]+"/,"前端不得含任何預設密碼");
assert.match(source,/grant_type=password/);
assert.match(source,/\/rest\/v1\/app_accounts/);
assert.match(source,/INACTIVITY_MS=8\*60\*60\*1000/);
assert.match(loginSource,/await FulianAuth\.login/);
assert.doesNotMatch(settingsSource,/config\.accounts\[key\]\.password/);
assert.match(settingsSource,/FulianAuth\.updateSharedPasswords/);
assert.match(settingsSource,/type="password"[^>]+autocomplete="new-password"/);
assert.match(supabaseConfig,/sb_publishable_/);
assert.doesNotMatch(supabaseConfig,/service_role|sb_secret_/);
assert.match(supabaseData,/analysis_snapshots/);
assert.match(supabaseData,/monthly_attendance_summaries/);
assert.match(supabaseData,/\/functions\/v1\/app-api/);
for(const endpoint of ["monthly-data","committee-meetings","analysis-draft","analysis-snapshots","ai-settings","ai-chat","member-departure","company","test-data-reset","attendance"]){
  assert.match(appApiFunction,new RegExp(`/api/${endpoint}`),`Edge API 必須接管 /api/${endpoint}`);
}
assert.match(appApiFunction,/authenticate\(request, identity\)/);
assert.match(appApiFunction,/account\.role/);
assert.match(appApiFunction,/FULIAN_AI_ENCRYPTION_KEY/);
assert.match(appApiFunction,/const text = await response\.text\(\)/);
assert.match(appApiFunction,/if \(!text\) return null/,"PostgREST return=minimal 的空回應不得再被強制解析為 JSON");
assert.match(memberDirectory,/FulianData\.getMemberNames/);
assert.doesNotMatch(memberDirectory,/members\s*[:=]\s*\[[^\]]+\]/s);
assert.match(edgeFunction,/account\.role!=="admin"/);
assert.match(edgeFunction,/SUPABASE_SERVICE_ROLE_KEY/);
assert.match(edgeFunction,/passwords\[role\]\.length<12/);

for(const file of readdirSync(appUrl).filter(name=>name.endsWith(".html"))){
  const page=readFileSync(new URL(file,appUrl),"utf8");
  const authIndex=page.indexOf("assets/js/auth.js?v=5");
  if(authIndex<0)continue;
  const configIndex=page.indexOf("assets/js/supabase-config.js?v=1");
  assert.ok(configIndex>=0&&configIndex<authIndex,`${file} 必須先載入 Supabase 公開設定`);
}

function makeStorage(){
  const values=new Map();
  return{
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key)
  };
}
function response(status,data){
  return{ok:status>=200&&status<300,status,json:async()=>data};
}
function authSandbox(fetchImpl){
  const sandbox={
    console,
    Date,
    JSON,
    encodeURIComponent,
    localStorage:makeStorage(),
    sessionStorage:makeStorage(),
    fetch:fetchImpl,
    setTimeout:()=>1,
    clearTimeout:()=>{},
    addEventListener:()=>{},
    location:{pathname:"/login.html",search:"",hash:"",href:"https://example.test/login.html",replace:()=>{}},
    document:{addEventListener:()=>{},querySelectorAll:()=>[]},
    FulianSupabaseConfig:{url:"https://project.supabase.co",publishableKey:"sb_publishable_test"}
  };
  sandbox.window=sandbox;
  vm.runInNewContext(source,sandbox,{filename:"auth.js"});
  return sandbox;
}

const successfulFetch=async url=>{
  if(url.includes("/auth/v1/token"))return response(200,{
    access_token:"access-token",
    refresh_token:"refresh-token",
    expires_in:3600,
    user:{id:"admin-user"}
  });
  if(url.includes("/rest/v1/app_accounts"))return response(200,[{role:"admin",label:"Admin",enabled:true}]);
  if(url.includes("/rest/v1/committee_terms"))return response(200,[]);
  throw new Error(`unexpected URL ${url}`);
};
const sandbox=authSandbox(successfulFetch);
const loginResult=await sandbox.FulianAuth.login("admin","not-stored-in-source","");
assert.equal(loginResult.ok,true);
assert.equal(sandbox.FulianAuth.validate(),true);
assert.equal(sandbox.FulianAuth.getSession().role,"admin");
assert.doesNotMatch(JSON.stringify(sandbox.FulianAuth.getSession()),/not-stored-in-source|fulian0857/);

let fetchCount=0;
const unknownSandbox=authSandbox(async()=>{fetchCount+=1;return response(500,{})});
const unknownResult=await unknownSandbox.FulianAuth.login("unknown","anything","");
assert.equal(unknownResult.ok,false);
assert.equal(unknownResult.message,"帳號或密碼不正確");
assert.equal(fetchCount,0,"未知帳號不得送到 Supabase");

const committeeSandbox=authSandbox(async url=>{
  if(url.includes("/auth/v1/token"))return response(200,{
    access_token:"committee-access-token",
    refresh_token:"committee-refresh-token",
    expires_in:3600,
    user:{id:"committee-user"}
  });
  if(url.includes("/rest/v1/app_accounts"))return response(200,[{role:"committee",label:"Committee",enabled:true}]);
  if(url.includes("/rest/v1/committee_terms"))return response(200,[
    {role:"vp",people:{display_name:"測試副主席"}},
    {role:"committee",people:{display_name:"測試委員甲"}},
    {role:"committee",people:{display_name:"測試委員乙"}}
  ]);
  if(url.includes("/auth/v1/logout"))return response(204,{});
  throw new Error(`unexpected URL ${url}`);
});
const committeeResult=await committeeSandbox.FulianAuth.login("Fulian","anything","");
assert.equal(committeeResult.ok,false);
assert.equal(committeeResult.needsMember,true);
assert.deepEqual(Array.from(committeeResult.committee),["測試委員甲","測試委員乙"]);
assert.equal(committeeSandbox.FulianAuth.getConfig().vpName,"測試副主席");

console.log("auth login tests passed");
