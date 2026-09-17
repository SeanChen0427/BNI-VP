import "../core/interview-template-domain.js";
const {TEMPLATES}=globalThis.FulianInterviewTemplateDomain;
const fail=(message,status)=>Object.assign(new Error(message),{status});
export function createInterviewTemplateApi({loadTemplate}){
  return async function interviewTemplateApi(request,url,context){
    if(!["admin","vp","committee"].includes(context?.role))throw fail("請先登入再取得中心區公版",403);
    if(request.method!=="GET")throw fail("中心區公版只提供讀取",405);
    const type=url.searchParams.get("type");
    if(!Object.hasOwn(TEMPLATES,type))throw fail("此訪談類型尚未建立已驗證的中心區公版",400);
    const TEMPLATE=TEMPLATES[type];
    let templateJson;
    try{templateJson=await loadTemplate(`${TEMPLATE.id}.json`)}catch{throw fail("中心區公版尚未就緒，已停止產生 Word，請聯絡副主席更新模板",503)}
    if(typeof templateJson!=="string"||templateJson.length>2*1024*1024)throw fail("中心區公版內容無效",503);
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(templateJson))),byte=>byte.toString(16).padStart(2,"0")).join("");
    if(digest!==TEMPLATE.sha256)throw fail("中心區公版版本不符，已停止產生 Word",503);
    return{templateJson};
  };
}
