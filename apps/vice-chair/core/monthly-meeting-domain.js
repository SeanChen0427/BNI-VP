(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.FulianMonthlyMeetingDomain=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  const FOLLOW_UP_DISPOSITION="follow_up";
  const NON_RENEWAL_DISPOSITION="non_renewal";
  const RENEWAL_RESUMED_AMENDMENT="renewal_resumed";

  function isNewMemberReview(card={}){
    const content=[card.title,card.detail,card.action].filter(Boolean).join(" ");
    return /新會員|在會\s*\d+\s*週|指派\s*Mentor/i.test(content);
  }

  function decisionAmendments(item={}){
    return Array.isArray(item.decisionAmendments)?item.decisionAmendments:[];
  }

  function isValidIsoDate(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||"")))return false;
    const[year,month,day]=String(value).split("-").map(Number),date=new Date(Date.UTC(year,month-1,day));
    return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
  }

  function isValidRenewalDecisionAmendment(amendment={}){
    const reason=String(amendment.reason||"").trim(),owner=String(amendment.owner||"").trim(),companion=String(amendment.companion||"").trim(),correctedBy=String(amendment.correctedBy||"").trim(),correctedAt=String(amendment.correctedAt||"").trim();
    return amendment.type===RENEWAL_RESUMED_AMENDMENT
      &&amendment.fromDisposition===NON_RENEWAL_DISPOSITION
      &&amendment.toDisposition===FOLLOW_UP_DISPOSITION
      &&/^[A-Za-z0-9._:-]{8,120}$/.test(String(amendment.id||""))
      &&reason.length>=2&&reason.length<=500
      &&Boolean(owner)&&owner.length<=100
      &&companion.length<=100
      &&isValidIsoDate(amendment.dueDate)
      &&Boolean(correctedAt)&&Number.isFinite(Date.parse(correctedAt))
      &&Boolean(correctedBy)&&correctedBy.length<=160
      &&(!companion||companion!==owner);
  }

  function latestRenewalDecisionAmendment(item={}){
    const amendments=decisionAmendments(item).filter(isValidRenewalDecisionAmendment);
    return amendments[amendments.length-1]||null;
  }

  function effectiveCareDisposition(item={}){
    const amendment=latestRenewalDecisionAmendment(item);
    return amendment?.toDisposition||String(item.disposition||"");
  }

  function isConfirmedNonRenewal(item={}){
    return item.taskType==="renewal"&&effectiveCareDisposition(item)===NON_RENEWAL_DISPOSITION;
  }

  function hasRenewalDecisionCorrection(item={}){
    return item.taskType==="renewal"
      &&item.disposition===NON_RENEWAL_DISPOSITION
      &&effectiveCareDisposition(item)===FOLLOW_UP_DISPOSITION;
  }

  function isValidCareDisposition(item={}){
    const disposition=String(item.disposition||"");
    const baseValid=!disposition||disposition===FOLLOW_UP_DISPOSITION||(item.taskType==="renewal"&&disposition===NON_RENEWAL_DISPOSITION);
    const amendments=decisionAmendments(item);
    return (item.decisionAmendments===undefined||Array.isArray(item.decisionAmendments))
      &&baseValid
      &&amendments.length<=1
      &&(!amendments.length||(item.taskType==="renewal"&&disposition===NON_RENEWAL_DISPOSITION&&amendments.every(isValidRenewalDecisionAmendment)));
  }

  function applyRenewalDecisionCorrection(item={},correction={}){
    if(!isValidCareDisposition(item))throw new Error("原續約決議資料不完整，請重新整理後再試");
    if(!isConfirmedNonRenewal(item))throw new Error("只有目前仍為確認不續約的續約項目可以更正");
    const amendment={
      id:String(correction.id||"").trim().slice(0,120),
      type:RENEWAL_RESUMED_AMENDMENT,
      fromDisposition:NON_RENEWAL_DISPOSITION,
      toDisposition:FOLLOW_UP_DISPOSITION,
      reason:String(correction.reason||"").trim().slice(0,500),
      owner:String(correction.owner||"").trim().slice(0,100),
      companion:String(correction.companion||"").trim().slice(0,100),
      dueDate:String(correction.dueDate||"").trim().slice(0,10),
      correctedAt:String(correction.correctedAt||"").trim(),
      correctedBy:String(correction.correctedBy||"").trim().slice(0,160)
    };
    if(!isValidRenewalDecisionAmendment(amendment))throw new Error("更正資料缺少原因、主責委員、日期或稽核資訊");
    return{
      ...item,
      assignmentRequired:true,
      state:"scheduled",
      owner:amendment.owner,
      companion:amendment.companion,
      dueDate:amendment.dueDate,
      taskId:String(item.taskId||"").trim().slice(0,160),
      taskCreatedByMeeting:Boolean(item.taskCreatedByMeeting),
      taskDeleted:false,
      syncMissing:false,
      decisionAmendments:[...decisionAmendments(item),amendment]
    };
  }

  function normalizeCareItem(item={}){
    if(isConfirmedNonRenewal(item))return{...item,assignmentRequired:false,state:"done",owner:"",companion:"",dueDate:"",taskDeleted:false,syncMissing:false};
    if(effectiveCareDisposition(item)===FOLLOW_UP_DISPOSITION)return{...item,assignmentRequired:true};
    return{...item};
  }

  function requiresCareAssignment(item={}){
    if(isConfirmedNonRenewal(item))return false;
    if(effectiveCareDisposition(item)===FOLLOW_UP_DISPOSITION)return true;
    return item.assignmentRequired!==false;
  }

  function isCareScheduleComplete(item={}){
    return !requiresCareAssignment(item)||(Boolean(String(item.owner||"").trim())&&Boolean(String(item.dueDate||"").trim()));
  }

  function missingCareAssignments(items=[]){
    return items.filter(item=>!isCareScheduleComplete(item));
  }

  function hasCareAssignmentConflict(items=[]){
    return items.some(item=>requiresCareAssignment(item)&&item.owner&&item.owner===item.companion);
  }

  return{FOLLOW_UP_DISPOSITION,NON_RENEWAL_DISPOSITION,RENEWAL_RESUMED_AMENDMENT,isNewMemberReview,decisionAmendments,isValidRenewalDecisionAmendment,latestRenewalDecisionAmendment,effectiveCareDisposition,isConfirmedNonRenewal,hasRenewalDecisionCorrection,isValidCareDisposition,applyRenewalDecisionCorrection,normalizeCareItem,requiresCareAssignment,isCareScheduleComplete,missingCareAssignments,hasCareAssignmentConflict};
});
