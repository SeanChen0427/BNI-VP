(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.FulianAnnualHandoverDomain=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  const ROLES=new Set(["vp","committee"]);

  function isoDateParts(value){
    const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||""));
    if(!match)return null;
    const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
    const date=new Date(Date.UTC(year,month-1,day));
    if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
    return{year,month,day,date};
  }

  function formatIsoDate(date){
    return date.toISOString().slice(0,10);
  }

  function termEndsOn(effectiveOn){
    const parts=isoDateParts(effectiveOn);
    if(!parts)return"";
    const exclusiveEnd=new Date(Date.UTC(parts.year+1,parts.month-1,parts.day));
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate()-1);
    return formatIsoDate(exclusiveEnd);
  }

  function nextOctoberFirst(today){
    const parts=isoDateParts(today);
    if(!parts)return"";
    const thisYear=`${parts.year}-10-01`;
    return today<thisYear?thisYear:`${parts.year+1}-10-01`;
  }

  function normalizeRoster(entries=[]){
    if(!Array.isArray(entries))return[];
    const seen=new Set();
    return entries.map(entry=>({
      personId:String(entry?.personId||"").trim(),
      name:String(entry?.name||"").trim(),
      role:String(entry?.role||"").trim()
    })).filter(entry=>{
      if(!entry.personId||!ROLES.has(entry.role)||seen.has(entry.personId))return false;
      seen.add(entry.personId);
      return true;
    });
  }

  function validateRoster(entries=[]){
    const input=Array.isArray(entries)?entries:[];
    const roster=normalizeRoster(input);
    const errors=[];
    if(roster.length!==input.length)errors.push("名單包含重複人員或無效角色");
    if(roster.filter(entry=>entry.role==="vp").length!==1)errors.push("下一屆必須指定且只能指定一位副主席");
    if(!roster.some(entry=>entry.role==="committee"))errors.push("下一屆至少需要一位會員委員");
    return{valid:errors.length===0,errors,roster};
  }

  function rosterDiff(currentEntries=[],nextEntries=[]){
    const current=normalizeRoster(currentEntries),next=normalizeRoster(nextEntries);
    const currentById=new Map(current.map(entry=>[entry.personId,entry]));
    const nextById=new Map(next.map(entry=>[entry.personId,entry]));
    const retained=[],roleChanges=[],outgoing=[],incoming=[];
    for(const entry of current){
      const target=nextById.get(entry.personId);
      if(!target)outgoing.push(entry);
      else if(target.role===entry.role)retained.push(target);
      else roleChanges.push({personId:entry.personId,name:target.name||entry.name,fromRole:entry.role,toRole:target.role});
    }
    for(const entry of next){
      if(!currentById.has(entry.personId))incoming.push(entry);
    }
    return{retained,roleChanges,outgoing,incoming};
  }

  function assignmentNames(assignments=[]){
    return(Array.isArray(assignments)?assignments:[]).map(item=>String(item?.name||"").trim()).filter(Boolean);
  }

  return{isoDateParts,termEndsOn,nextOctoberFirst,normalizeRoster,validateRoster,rosterDiff,assignmentNames};
});
