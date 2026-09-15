(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.FulianAttendanceDomain=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  function isOperationalAbsence(record={}){
    // 未完成簡報且無代理即列作業缺席，包含整列未勾選的會員。
    // 到會勾選只記錄兩個時間點的人數，不是缺席判定的前提。
    return Boolean(record.absent)
      || (!Boolean(record.proxy)
        && !Boolean(record.speech||record.presentation_completed));
  }

  function operationalCounts(record={}){
    return{
      late:Number(Boolean(record.late))+Number(Boolean(record.early||record.left_early)),
      proxy:Number(Boolean(record.proxy)),
      absence:Number(isOperationalAbsence(record))
    };
  }

  function mergeTotals(official={},overlay={}){
    return{
      late:(Number(official.late)||0)+(Number(overlay.late)||0),
      proxy:(Number(official.proxy)||0)+(Number(overlay.proxy)||0),
      absence:(Number(official.absence)||0)+(Number(overlay.absence)||0)
    };
  }

  function cumulativeFor(record={},prior={}){
    const current=operationalCounts(record),late=(Number(prior.late)||0)+current.late;
    return{
      late,
      lateRemainder:late%3,
      proxy:(Number(prior.proxy)||0)+current.proxy,
      absence:(Number(prior.absence)||0)+current.absence+Math.floor(late/3)
    };
  }

  function isUnreconciledMeeting(meetingDate,palmsPeriodEnd,currentMeetingDate){
    return Boolean(
      /^\d{4}-\d{2}-\d{2}$/.test(String(meetingDate||""))
      && meetingDate>palmsPeriodEnd
      && meetingDate<currentMeetingDate
    );
  }

  return{isOperationalAbsence,operationalCounts,mergeTotals,cumulativeFor,isUnreconciledMeeting};
});
