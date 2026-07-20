const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};

const accountEmails={
  admin:"fulian0857+admin@gmail.com",
  vp:"fulian0857+vp@gmail.com",
  committee:"fulian0857+committee@gmail.com"
} as const;

function respond(status:number,body:Record<string,unknown>){
  return new Response(JSON.stringify(body),{
    status,
    headers:{...corsHeaders,"Content-Type":"application/json"}
  });
}

Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(request.method!=="POST")return respond(405,{message:"只允許 POST"});

  const supabaseUrl=Deno.env.get("SUPABASE_URL");
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization=request.headers.get("Authorization");
  if(!supabaseUrl||!anonKey||!serviceRoleKey)return respond(500,{message:"伺服器登入設定不完整"});
  if(!authorization?.startsWith("Bearer "))return respond(401,{message:"請先登入"});

  try{
    const userResponse=await fetch(`${supabaseUrl}/auth/v1/user`,{
      headers:{apikey:anonKey,Authorization:authorization}
    });
    const user=await userResponse.json();
    if(!userResponse.ok||!user.id)return respond(401,{message:"登入工作階段無效"});

    const accountResponse=await fetch(`${supabaseUrl}/rest/v1/app_accounts?auth_user_id=eq.${encodeURIComponent(user.id)}&select=role,enabled`,{
      headers:{apikey:anonKey,Authorization:authorization}
    });
    const accounts=await accountResponse.json();
    const account=Array.isArray(accounts)?accounts[0]:null;
    if(!accountResponse.ok||!account?.enabled||account.role!=="admin"){
      return respond(403,{message:"只有 Admin 可以更新登入密碼"});
    }

    const payload=await request.json().catch(()=>null);
    const passwords=payload?.passwords;
    for(const role of ["admin","vp","committee"] as const){
      if(typeof passwords?.[role]!=="string"||passwords[role].length<12||passwords[role].length>128){
        return respond(400,{message:"三組新密碼都必須是 12 至 128 個字元"});
      }
    }

    const adminHeaders={
      apikey:serviceRoleKey,
      Authorization:`Bearer ${serviceRoleKey}`,
      "Content-Type":"application/json"
    };
    const listResponse=await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`,{headers:adminHeaders});
    const listPayload=await listResponse.json();
    if(!listResponse.ok)return respond(502,{message:"無法讀取共用登入帳號"});

    const users=Array.isArray(listPayload?.users)?listPayload.users:[];
    const targets=Object.fromEntries(Object.entries(accountEmails).map(([role,email])=>[
      role,
      users.find((candidate:{email?:string})=>candidate.email?.toLowerCase()===email.toLowerCase())
    ]));
    if(Object.values(targets).some(target=>!target?.id)){
      return respond(500,{message:"共用登入帳號設定不完整，未執行更新"});
    }

    // Admin 最後更新；若前一組發生暫時性錯誤，Admin 仍可登入後重試。
    for(const role of ["committee","vp","admin"] as const){
      const updateResponse=await fetch(`${supabaseUrl}/auth/v1/admin/users/${targets[role].id}`,{
        method:"PUT",
        headers:adminHeaders,
        body:JSON.stringify({password:passwords[role]})
      });
      if(!updateResponse.ok)return respond(502,{message:`${role} 密碼更新失敗，請由 Admin 重新執行三組更新`});
    }

    return respond(200,{ok:true,updated:["admin","vp","committee"]});
  }catch(error){
    console.error(error);
    return respond(500,{message:"密碼更新服務暫時無法使用"});
  }
});
