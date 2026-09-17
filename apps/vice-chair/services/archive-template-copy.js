(function(root,factory){
  const api=factory(root);
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.FulianArchiveTemplateCopy=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(root){
  const supported=["new","industry","midterm","renewal","departure"];
  const answers={
    new:["businessContent","advantages","joinReason","annualGoal","otherQuestions","chapterNotes"],
    industry:["businessContent","advantages","joinReason","annualGoal","otherQuestions","chapterNotes"],
    midterm:["summary",...Array.from({length:5},(_,i)=>`goal_${i}`),...Array.from({length:5},(_,i)=>`reality_${i}`),...Array.from({length:4},(_,i)=>`option_${i}`),...Array.from({length:6},(_,i)=>`forward_${i}`)],
    renewal:["summary","referralsGivenAnswer","referralsReceivedAnswer","visitorsAnswer","attendanceAnswer","educationAnswer","chapterFeelingAnswer","nextActionsAnswer","interviewerOpinion"],
    departure:["gains","likes","departureReason","dislikes","improvementAttempts"]
  };
  const text=value=>typeof value==="string"?value.trim():"";
  async function eligible({task,role,file}){
    // The saved attachment is the boundary: feedback/voting need not be closed.
    if(!["vp","admin"].includes(role)||!supported.includes(task?.type)||!file)return false;
    return !(await root.FulianInterviewTemplate.readProvenance(file));
  }
  function prepare({task,draft}){
    if(!supported.includes(task?.type))throw new Error("此案件沒有對應的中心區公版");
    if(!draft||!answers[task.type].some(key=>text(draft[key])))throw new Error("舊案未保存可重製的訪談填答，請下載原保存檔核對。");
    const applicant=text(task.member),savedName=text(draft.applicant||draft.member);
    if(savedName&&savedName!==applicant)throw new Error("保存的填答姓名與案件不一致，已停止產生副本。");
    const date=text(draft.meetingDate||draft.interviewDate);
    const day=date.slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?$/.test(date)||Number.isNaN(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)throw new Error("舊案缺少有效的原訪談日期，請使用原保存檔；不以結案日或今天補填。");
    const copy=structuredClone(draft);
    // Do not use the current session, member directory, assignment or analysis API.
    delete copy.login;delete copy.loginUser;
    const context={historicalCopy:true,profession:text(draft.profession||task.profession)};
    const warnings=["依案件保存的填答重製，可能與最後上傳的 Word 不同；請對照原保存檔核對。", "使用目前指定公版；新舊公版聲明可能不同，原未填的承諾與簽名不補填。"];
    const snapshot=copy.renewalMetricsSnapshot;
    if(task.type==="renewal"&&copy.renewalRuleVersion===2&&snapshot?.member?.name===applicant&&snapshot?.period?.start&&snapshot?.period?.end){
      context.metrics=structuredClone(snapshot.member.metrics||{});
      context.averages=structuredClone(snapshot.averages||{});
      context.palmsPeriod=`${snapshot.period.start} 至 ${snapshot.period.end}`;
    }
    if(["midterm","renewal"].includes(task.type))warnings.push(context.metrics?"PALMS 使用本案保存的歷史快照；未保存的燈號、分數與期間留空。":"本案未保存可核對的歷史數據，PALMS、燈號、分數與期間留空。");
    return{type:task.type,applicant,draft:copy,context,warnings,date};
  }
  async function generate(options){
    if(!await eligible(options))throw new Error("僅已保存舊版訪談 Word 的案件可產生公版副本");
    const prepared=prepare(options);
    const result=await root.FulianInterviewTemplate.generate(prepared);
    return{...result,fileName:result.fileName.replace(/\.docx$/,"-公版副本-待核對.docx"),warnings:prepared.warnings};
  }
  // Deliberately has no upload, localStorage, IndexedDB or case-state write path.
  return Object.freeze({eligible,prepare,generate});
});
