import '../core/case-domain.js';
import '../core/interview-template-domain.js';
import './interview-template.js';
const domain=globalThis.FulianCaseDomain,templates=globalThis.FulianInterviewTemplateDomain;
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
export const RENEWAL_DOCUMENT_KINDS=Object.freeze(['renewal-interview','renewal-assessment']);
export const DOCUMENT_KINDS=Object.freeze([...RENEWAL_DOCUMENT_KINDS,'midterm-interview','midterm-assessment']);
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export function renewalFingerprintSource(kind,draft={}){
  if(kind.startsWith('midterm-'))return JSON.stringify(sorted(kind==='midterm-assessment'?draft.midtermAssessment||{}:{member:draft.member,profession:draft.profession,counselor:draft.counselor,companionCounselor:draft.companionCounselor,meetingDate:draft.meetingDate,midtermInterview:draft.midtermInterview||{}}));
  return JSON.stringify(sorted(kind==='renewal-assessment'?draft.renewalAssessment||{}:{member:draft.member,profession:draft.profession,counselor:draft.counselor,companionCounselor:draft.companionCounselor,meetingDate:draft.meetingDate,activation:draft.activation,expiryDate:draft.expiryDate,renewalCount:draft.renewalCount,renewalMetricsSnapshot:draft.renewalMetricsSnapshot,renewalInterview:draft.renewalInterview||{}}));
}
export function renewalStorageObjects(files=[]){
  return [...new Map(files.flatMap(file=>[file,...Object.values(file.documents||{}).flatMap(value=>Array.isArray(value)?value:[value])]).filter(file=>file?.object_path).map(file=>[file.object_path,{bucket_id:'case-files',object_path:file.object_path}])).values()];
}
export function canReadRenewalAssessment(access,context){
  return Boolean((access.leadership||access.assigned)&&String(access.task.title||'').trim()!==String(context.name||'').trim());
}
export async function validRenewalDocuments(documents={},draft={},sha256Text,type='renewal'){
  const spec=domain.documentPackSpec(type),valid={};
  for(const kind of [spec.interviewKind,spec.assessmentKind]){
    const file=documents[kind];
    if(file?.sha256&&file.draftSha256===await sha256Text(renewalFingerprintSource(kind,draft)))valid[kind]=file;
  }
  if(valid[spec.assessmentKind]?.interviewSha256!==valid[spec.interviewKind]?.sha256||valid[spec.assessmentKind]?.interviewDraftSha256!==valid[spec.interviewKind]?.draftSha256)delete valid[spec.assessmentKind];
  return valid;
}
export async function renewalWorkflow({access,workflow,draft,files,sha256Text}){
  const spec=domain.documentPackSpec(access.task.category);
  if(!spec||!domain.documentPackRequired(access.task,workflow,draft))return workflow;
  const documents=await validRenewalDocuments(files?.documents||{},draft,sha256Text,spec.type),ready=domain.documentPackReady(documents,spec.type);
  return {...workflow,[spec.versionKey]:1,[spec.documentsKey]:documents,[spec.interviewSavedKey]:Boolean(documents[spec.interviewKind]),[spec.assessmentSavedKey]:ready,wordSaved:ready,wordReal:Boolean(documents[spec.interviewKind]),wordName:documents[spec.interviewKind]?.name||workflow.wordName||'',...(spec.type==='midterm'?{closed:ready}: {})};
}
export function createRenewalDocumentSaver({db,serviceFetch,sha256Text,sha256Bytes,queueCleanup,now=()=>new Date().toISOString(),uuid=()=>crypto.randomUUID()}){
  return async function save({access,context,body,bytes,existing,state}){
    const kind=String(body.documentKind||''),spec=domain.documentPackSpec(access.task.category);
    const internal=kind===spec?.assessmentKind;
    if(!spec||![spec.interviewKind,spec.assessmentKind].includes(kind))throw fail('不支援的訪談文件類型',400);
    if(!access.leadership&&!access.assigned)throw fail('只有副主席或本案受指派人員可以保存訪談文件',403);
    if(!canReadRenewalAssessment(access,context)&&internal)throw fail('申請人本人不得填寫內部評估',403);
    if(state?.workflow?.feedbackCallId||state?.workflow?.feedbackNotified||domain.hasFeedback(state?.workflow)||state?.workflow?.votingOpen)throw fail('已進入回饋或投票的雙文件不可覆寫');
    const draft=state?.draft||{};
    if(draft[spec.versionKey]!==1)throw fail('請先保存新版訪談填答');
    const current=await validRenewalDocuments(existing?.documents||{},draft,sha256Text,spec.type);
    if(internal&&!current[spec.interviewKind])throw fail('請先成功保存本次會員訪談文件');
    const type=internal?spec.assessmentKind:spec.type;
    const provenance=await globalThis.FulianInterviewTemplate.readProvenance(new Blob([bytes]));
    if(provenance?.templateId!==templates.templateFor(type).id)throw fail('訪談文件必須使用指定的 V1.1 公版',422);
    const path=`${access.task.id}/${kind}/${uuid()}.docx`,stamp=now();
    const descriptor={name:String(body.filename).trim().slice(0,240),object_path:path,content_type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',size_bytes:bytes.length,sha256:await sha256Bytes(bytes),draftSha256:await sha256Text(renewalFingerprintSource(kind,draft)),savedAt:stamp,...(internal?{interviewSha256:current[spec.interviewKind].sha256,interviewDraftSha256:current[spec.interviewKind].draftSha256}:{})};
    await serviceFetch(`/storage/v1/object/case-files/${path}`,{method:'POST',headers:{'Content-Type':descriptor.content_type},body:bytes});
    const previous=existing?.documents?.[kind],history=existing?.documents?._history||[];
    const documents={...(existing?.documents||{}),[kind]:descriptor,...(previous?{_history:[...history,previous]}:{})};
    const payload={documents,updated_at:stamp,...(kind===spec.interviewKind?{object_path:path,original_filename:descriptor.name,content_type:descriptor.content_type,size_bytes:bytes.length,uploaded_by:context.personId}:{})};
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
    return {message:'訪談文件已獨立保存',name:descriptor.name,size:bytes.length,documents:await validRenewalDocuments(documents,draft,sha256Text,spec.type)};
  };
}
