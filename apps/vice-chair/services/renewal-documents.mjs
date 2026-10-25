import '../core/case-domain.js';
import '../core/interview-template-domain.js';
import './interview-template.js';
const domain=globalThis.FulianCaseDomain,templates=globalThis.FulianInterviewTemplateDomain;
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
export const RENEWAL_DOCUMENT_KINDS=Object.freeze(['renewal-interview','renewal-assessment']);
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export function renewalFingerprintSource(kind,draft={}){
  return JSON.stringify(sorted(kind==='renewal-assessment'?draft.renewalAssessment||{}:{member:draft.member,profession:draft.profession,counselor:draft.counselor,companionCounselor:draft.companionCounselor,meetingDate:draft.meetingDate,activation:draft.activation,expiryDate:draft.expiryDate,renewalCount:draft.renewalCount,renewalMetricsSnapshot:draft.renewalMetricsSnapshot,renewalInterview:draft.renewalInterview||{}}));
}
export function renewalStorageObjects(files=[]){
  return [...new Map(files.flatMap(file=>[file,...Object.values(file.documents||{}).flatMap(value=>Array.isArray(value)?value:[value])]).filter(file=>file?.object_path).map(file=>[file.object_path,{bucket_id:'case-files',object_path:file.object_path}])).values()];
}
export function canReadRenewalAssessment(access,context){
  return Boolean((access.leadership||access.assigned)&&String(access.task.title||'').trim()!==String(context.name||'').trim());
}
export async function validRenewalDocuments(documents={},draft={},sha256Text){
  const valid={};
  for(const kind of RENEWAL_DOCUMENT_KINDS){
    const file=documents[kind];
    if(file?.sha256&&file.draftSha256===await sha256Text(renewalFingerprintSource(kind,draft)))valid[kind]=file;
  }
  if(valid['renewal-assessment']?.interviewSha256!==valid['renewal-interview']?.sha256||valid['renewal-assessment']?.interviewDraftSha256!==valid['renewal-interview']?.draftSha256)delete valid['renewal-assessment'];
  return valid;
}
export async function renewalWorkflow({access,workflow,draft,files,sha256Text}){
  if(!domain.renewalPackRequired(access.task,workflow,draft))return workflow;
  const documents=await validRenewalDocuments(files?.documents||{},draft,sha256Text),ready=domain.renewalDocumentsReady(documents);
  return {...workflow,renewalPackVersion:1,renewalDocuments:documents,renewalInterviewSaved:Boolean(documents['renewal-interview']),renewalAssessmentSaved:ready,wordSaved:ready,wordReal:Boolean(documents['renewal-interview']),wordName:documents['renewal-interview']?.name||workflow.wordName||''};
}
export function createRenewalDocumentSaver({db,serviceFetch,sha256Text,sha256Bytes,queueCleanup,now=()=>new Date().toISOString(),uuid=()=>crypto.randomUUID()}){
  return async function save({access,context,body,bytes,existing,state}){
    const kind=String(body.documentKind||'');
    if(!RENEWAL_DOCUMENT_KINDS.includes(kind)||access.task.category!=='renewal')throw fail('不支援的續約文件類型',400);
    if(!access.leadership&&!access.assigned)throw fail('只有副主席或本案受指派人員可以保存續約文件',403);
    if(!canReadRenewalAssessment(access,context)&&kind==='renewal-assessment')throw fail('申請人本人不得填寫內部評估',403);
    if(state?.workflow?.feedbackCallId||state?.workflow?.feedbackNotified||domain.hasFeedback(state?.workflow)||state?.workflow?.votingOpen)throw fail('已進入回饋或投票的續約雙文件不可覆寫');
    const draft=state?.draft||{};
    if(draft.renewalPackVersion!==1)throw fail('請先保存新版續約填答');
    const current=await validRenewalDocuments(existing?.documents||{},draft,sha256Text);
    if(kind==='renewal-assessment'&&!current['renewal-interview'])throw fail('請先成功保存本次會員續約訪談文件');
    const type=kind==='renewal-interview'?'renewal':kind;
    const provenance=await globalThis.FulianInterviewTemplate.readProvenance(new Blob([bytes]));
    if(provenance?.templateId!==templates.templateFor(type).id)throw fail('續約文件必須使用指定的 V1.1 公版',422);
    const path=`${access.task.id}/${kind}/${uuid()}.docx`,stamp=now();
    const descriptor={name:String(body.filename).trim().slice(0,240),object_path:path,content_type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',size_bytes:bytes.length,sha256:await sha256Bytes(bytes),draftSha256:await sha256Text(renewalFingerprintSource(kind,draft)),savedAt:stamp,...(kind==='renewal-assessment'?{interviewSha256:current['renewal-interview'].sha256,interviewDraftSha256:current['renewal-interview'].draftSha256}:{})};
    await serviceFetch(`/storage/v1/object/case-files/${path}`,{method:'POST',headers:{'Content-Type':descriptor.content_type},body:bytes});
    const previous=existing?.documents?.[kind],history=existing?.documents?._history||[];
    const documents={...(existing?.documents||{}),[kind]:descriptor,...(previous?{_history:[...history,previous]}:{})};
    const payload={documents,updated_at:stamp,...(kind==='renewal-interview'?{object_path:path,original_filename:descriptor.name,content_type:descriptor.content_type,size_bytes:bytes.length,uploaded_by:context.personId}:{})};
    try{
      if(existing){
        const saved=await db(`task_case_files?task_id=eq.${access.task.id}&updated_at=eq.${encodeURIComponent(existing.updated_at)}`,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)});
        if(!saved?.length)throw fail('文件已由其他裝置更新，請重新整理後再保存');
      }else await db('task_case_files',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({...payload,task_id:access.task.id,bucket_id:'case-files'})});
    }catch(error){
      try{await serviceFetch('/storage/v1/object/case-files',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[path]})});}
      catch(cleanupError){
        try{if(!queueCleanup)throw cleanupError;await queueCleanup(access.task,path);}
        catch{throw fail(`${error.message}；新附件清理失敗，請聯絡副主席處理，案件未完成保存`,error.status||500);}
        throw fail(`${error.message}；新附件已排入清理重試，案件未完成保存`,error.status||500);
      }
      throw error;
    }
    return {message:'續約文件已獨立保存',name:descriptor.name,size:bytes.length,documents:await validRenewalDocuments(documents,draft,sha256Text)};
  };
}
