(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.FulianMonthlyMeetingDomain=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  function isNewMemberReview(card={}){
    const content=[card.title,card.detail,card.action].filter(Boolean).join(" ");
    return /新會員|在會\s*\d+\s*週|指派\s*Mentor/i.test(content);
  }

  function requiresCareAssignment(item={}){
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

  return{isNewMemberReview,requiresCareAssignment,isCareScheduleComplete,missingCareAssignments,hasCareAssignmentConflict};
});
