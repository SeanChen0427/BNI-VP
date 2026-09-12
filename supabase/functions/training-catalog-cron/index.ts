import { syncTrainingCatalog } from "../_shared/training-catalog-sync.mjs";

const url=Deno.env.get("SUPABASE_URL")||"";
const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const secret=Deno.env.get("TRAINING_CATALOG_CRON_SECRET")||"";
async function db(path:string,options:RequestInit={}){
  const response=await fetch(`${url}/rest/v1/${path}`,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,...options.headers}});
  if(!response.ok)throw new Error(`課表資料庫 HTTP ${response.status}`);
  const text=await response.text();
  return text?JSON.parse(text):null;
}
Deno.serve(async request=>{
  const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
  if(request.method!=="POST")return reply(405,{message:"Method not allowed"});
  if(!secret||request.headers.get("x-cron-secret")!==secret)return reply(401,{message:"Unauthorized"});
  if(!url||!key)return reply(503,{message:"課表同步環境未設定"});
  try{return reply(200,await syncTrainingCatalog({db}));}
  catch(error){console.error("training-catalog-sync",error);return reply(502,{message:"官方課表同步失敗，已保留既有資料"});}
});
