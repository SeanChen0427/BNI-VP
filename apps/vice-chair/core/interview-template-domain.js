(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.FulianInterviewTemplateDomain=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  const TEMPLATE=Object.freeze({id:"kp-membership-v1.1-20261012",schema:"fulian.interview-template.v1",sha256:"01bc970c4221622014fef0e4eff89b5d840d1dee13e872f427457a05b1db95cb",sourceSha256:"f85c689b2b61508d5d0ebf94a7f54b0fb5a005e7c20716b6b0f2a6386f1a68c9",types:Object.freeze(["new","industry"])});
  const registry=(id,sha256,sourceSha256)=>Object.freeze({id,sha256,sourceSha256,schema:TEMPLATE.schema});
  const TEMPLATES=Object.freeze({new:TEMPLATE,industry:TEMPLATE,
    midterm:registry("kp-midterm-v4-20241121","a34b8d5e1953c413f47e8778588e820a2651dc1736158300780c8042647362e4","12307bba2a51714f520b13800cd6ae290c1609af83b55783490ca27369cdb082"),
    renewal:registry("kp-renewal-interview-v1.1-20261012","51e4e2bd022284b172f029cdf1871ea8010cb4c6a6158c5fb72f6a1680f813dc","7113a0e133dea14c044a1b6ccd653175d2c469a0cdbcdf5be54f8700560e6214"),
    "renewal-assessment":registry("kp-renewal-assessment-v1.1-20261012","008ce9e8362bf3e86d0c5cb14cfac36a07724a55d567595ab77daf06f5717961","e7f7116b594f5959ddb8d4a6c814f55a446df933a6a9a9193e8d85e428fc30dd"),
    departure:registry("kp-departure-v2.1-20230428","511f910bf2c9db1a45604f2a6aad243b2d279e380038de158749928f4ea55a4c","774e7a95b2dc4cf8942aea0a6bdfedbc1aafc5ed7c5c82877bc105324eaedf88")});
  function templateFor(type){if(!Object.hasOwn(TEMPLATES,type))throw new Error("此訪談類型尚未建立已驗證的中心區模板");return TEMPLATES[type]}
  const NARRATIVES=Object.freeze({businessContent:[6,42],advantages:[6,42],successStories:[7,42],annualBreakthrough:[3,42],growthVision:[3,42],threeYearVision:[5,42],targetMarkets:[5,42],cooperationIndustries:[5,42]});
  const MEMBERSHIP=Object.freeze({version:TEMPLATE.id,
    joinOptions:Object.freeze(["穩定轉介紹","增加品牌曝光","建立合作關係","認識更多關鍵人脈","擴大市場","建立團隊資源","提升商務能力","建立產業合作鏈"]),
    goalOptions:Object.freeze(["業績成長","品牌建立","客戶來源","團隊建立","合作資源","市場拓展"]),
    cooperationOptions:Object.freeze(["信任","專業","關係","服務","回應速度","價值觀"]),
    yesNo:Object.freeze(["growthPlan","participation","learning","giving","visitorCulture","rightsOrganization","pledgeGuests"]),
    confirmations:Object.freeze(["trustUnderstood","successUnderstood","engagementUnderstood","rightsCategory","rightsQualification","rightsPolicyFour","rightsMsp","rightsSession","rightsAttendance","rightsProxy","rightsGreen","rightsFees","rightsEthics"])
  });
  const RENEWAL=Object.freeze({
    gains:["建立人脈","增加合作","增加引薦","提升品牌曝光","建立信任圈","提升表達能力","商業思維成長","個人成長","領導力提升"],
    underused:["一對一","咖啡會議","每週簡報","來賓邀約","引薦能力","建立信任","培訓參與","產業服務鏈","團隊合作","活動參與"],
    partnerStatus:["已有穩定合作夥伴","有部分合作","尚未形成","不知道如何建立"],advocates:["0–2位","3–5位","6–10位","10位以上"],
    barriers:["不知道邀請誰","不知道如何邀約","擔心被拒絕","時間安排問題","沒有邀約習慣","不知道如何篩選適合來賓","對邀約沒有明確目標"],
    values:["長期人脈資產","穩定轉介紹","商業合作平台","個人品牌曝光","團隊支持","領導力成長","學習平台"],
    commitments:[["invite","邀請優質來賓"],["oneToOne","積極一對一交流"],["cooperate","協助會員合作"],["learn","參與培訓學習"],["trust","建立長期信任關係"],["events","參與分會活動"]],
    ratings:[["systemUse","系統使用度"],["cultureFit","文化適配度"],["longTerm","長期主義"],["cooperation","合作意願"],["chapterGrowth","幫助分會成長意願"]],
    improvements:["出席率","一對一","培訓參與","嘉賓邀約","團隊參與","建立合作圈","平台使用度","每週簡報優化"],
    rejectReasons:["長期低投入","不願使用系統","不願合作","不認同核心價值","長期負能量","持續破壞團隊文化","無改善意願"],
    narratives:{personalGrowth:4,businessChallenge:4,usageReason:4,earlierActions:5,partnerStory:5,chapterGrowthReason:4,nextYearPlan:3,teamSupportPlan:3,chapterSuggestions:4}
  });
  function renewalFields(type,draft,applicant,context){
    const interview=draft.renewalInterview||{},assessment=draft.renewalAssessment||{},values={};
    const checked=key=>key===true?"■":"□";
    const choices=(key,selected,list)=>list.forEach(value=>{values[key+value]=checked(String(selected)===String(value))});
    if(type==="renewal-assessment"){
      for(const [key] of RENEWAL.ratings)for(const choice of ["high","medium","low"])values[`rating.${key}.${choice}`]=checked(assessment[key]===choice);
      for(const [key,value] of [["Normal","normal"],["Conditional","conditional"],["Reject","reject"]])values["recommend"+key]=checked(assessment.recommendation===value);
      RENEWAL.improvements.forEach((_,i)=>values["improvement"+(i+1)]=checked(assessment["improvement"+(i+1)]));
      RENEWAL.rejectReasons.forEach((_,i)=>values["rejectReason"+(i+1)]=checked(assessment["rejectReason"+(i+1)]));
      values.coach=text(assessment.coach);fillLines(values,"improvementGoal",assessment.improvementGoal,14,11);fillLines(values,"notes",assessment.notes,1,11);
      values.assessmentSignatures=[assessment.interviewer,assessment.companion].map(text).filter(Boolean).join("／")||"____________________";values.assessmentDate=chineseDate(assessment.assessmentDate);
      return values;
    }
    const m=context.metrics||draft.renewalMetricsSnapshot?.member?.metrics||{};
    Object.assign(values,{member:text(applicant||draft.member),chapter:"富聯",profession:text(context.profession||draft.profession),meetingDate:text(draft.meetingDate).replace("T"," "),counselors:[draft.counselor,draft.companionCounselor].map(text).filter(Boolean).join("／"),activation:text(draft.activation),expiryDate:text(draft.expiryDate)});
    choices("cycle",interview.renewalCycle,[1,2,3]);
    for(const key of ["absence","substitutes","oneToOne","education","visitors"])values["metric."+key]=text(m[key]);
    values["metric.referrals"]=Number.isFinite(m.givenIn)&&Number.isFinite(m.givenOut)?String(m.givenIn+m.givenOut):"";
    values["metric.amountGiven"]=text(m.amount);values["metric.amountReceived"]=text(interview.amountReceived);
    for(const key of ["oneToOneStatus","educationStatus","visitorsStatus","referralsStatus","chapterVisitorsStatus"]){values[key+"Met"]=checked(interview[key]==="met");values[key+"Unmet"]=checked(interview[key]==="unmet")}
    for(const key of ["eventInw","eventTaiwan","eventInternational","gainOtherSelected","underusedOtherSelected","visitorBarrierOtherSelected","valueOtherSelected","mspUnderstood"])values[key]=checked(interview[key]);
    for(const key of ["eventCountry","gainOther","underusedOther","visitorBarrierOther","valueOther","chapterVisitorMinimum"])values[key]=text(interview[key]);
    for(const [group,items] of [["gain",RENEWAL.gains],["underused",RENEWAL.underused],["visitorBarrier",RENEWAL.barriers],["value",RENEWAL.values]])items.forEach((_,i)=>values[group+(i+1)]=checked(interview[group+(i+1)]));
    for(const [key,selected,list] of [["usageScore",interview.usageScore,[5,4,3,2,1]],["partnerStatus",interview.partnerStatus,[1,2,3,4]],["advocates",interview.advocates,[1,2,3,4]],["culture",interview.culture,[1,2,3,4]],["teamSupport",interview.teamSupport,[1,2,3]],["trust",interview.trust,[1,2,3]]])choices(key,selected,list);
    for(const choice of ["High","Medium","Low"])values["growth"+choice]=checked(interview.chapterGrowth===choice.toLowerCase());
    for(const [key] of RENEWAL.commitments)for(const choice of ["willing","uncertain","unwilling"])values[`commit.${key}.${choice}`]=checked(interview["commit_"+key]===choice);
    for(const [key,count] of Object.entries(RENEWAL.narratives))fillLines(values,key,interview[key],count,38);
    values.mspUp=chineseDate(interview.mspUp);values.mspDown=chineseDate(interview.mspDown);
    values.memberSignature=text(interview.memberSignature)||"_______________________";values.interviewerSignatures=[interview.interviewer,interview.companion].map(text).filter(Boolean).join("／")||"____________________";values.signatureDate=chineseDate(interview.signatureDate);
    return values;
  }
  function text(value){return String(value??"").trim()}
  function relation(draft,key){return draft[key]==="其他"?text(draft[key+"Other"]):text(draft[key])}
  function dateParts(value){const match=text(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2})?)?$/);return match?match.slice(1):null}
  function chineseDate(value){const p=dateParts(value);return p?`${p[0]}年${p[1]}月${p[2]}日`:"      年     月      日"}
  // Use existing blank paragraphs as line slots. Overflow expands the final paragraph;
  // never abbreviate, discard answers, shrink the official font, or remove questions.
  function lines(value,width){
    const result=[];
    for(const paragraph of text(value).split(/\r?\n/)){
      let current="",used=0;
      for(const char of paragraph){const size=char.codePointAt(0)>255?1:.5;if(current&&used+size>width){result.push(current);current="";used=0}current+=char;used+=size}
      result.push(current);
    }
    return result;
  }
  function membershipFields(draft={},applicant=""){
    const values={applicant:text(applicant||draft.applicant),chapter:"富聯",meetingDate:text(draft.meetingDate).replace("T"," ")};
    for(const key of ["profession","companyName","experienceYears","teamSize","joinReasonOther","annualGoalOther","cooperationOther","rightsExperienceYears","rightsOrganizationName"])values[key]=text(draft[key]);
    values.interviewers=[draft.leadInterviewer||draft.login,draft.companionInterviewer,draft.secondCompanion].map(text).filter(Boolean).join("／");
    values.applicantSignature=text(draft.applicantSignature);
    values.interviewerSignatures=[draft.witness1,draft.witness2,draft.witness3].map(text).filter(Boolean).join("／");
    values.rightsApplicantSignature=text(draft.rightsApplicantSignature);
    values.rightsInterviewerSignatures=[draft.rightsWitness1,draft.rightsWitness2,draft.rightsWitness3].map(text).filter(Boolean).join("／");
    values.interviewSignatureDate=chineseDate(draft.signatureDate);
    values.rightsSignatureDate=chineseDate(draft.rightsSignatureDate);
    for(const [prefix,key] of [["employment","employmentType"],["rightsEmployment","rightsEmploymentType"]]){
      values[prefix+"Full"]=draft[key]==="全職"?"■":"□";values[prefix+"Part"]=draft[key]==="兼職"?"■":"□";
    }
    for(const key of MEMBERSHIP.yesNo)for(const [suffix,answer] of [["Yes","yes"],["No","no"]])values[key+suffix]=draft[`radio:${key}`]===answer?"■":"□";
    for(const key of MEMBERSHIP.confirmations)values[key]=draft[key]===true?"■":"□";
    for(const [group,options] of [["join",MEMBERSHIP.joinOptions],["goal",MEMBERSHIP.goalOptions],["cooperation",MEMBERSHIP.cooperationOptions]]){
      for(let i=1;i<=options.length;i++)values[group+"Option"+i]=draft[group+"Option"+i]===true?"■":"□";
      values[group+"OtherSelected"]=draft[group+"OtherSelected"]===true?"■":"□";
    }
    for(const key of ["mspUpDate","mspDownDate","mspUpDate2","mspDownDate2","sessionDate1"])values[key]=chineseDate(draft[key]);
    for(const key of ["guest1Name","guest2Name"])values[key]=text(draft[key]);
    for(const key of ["guest1Relation","guest2Relation"])values[key]=relation(draft,key);
    for(const [key,[count,width]] of Object.entries(NARRATIVES))fillLines(values,key,draft[key],count,width);
    for(let i=1;i<=20;i++)for(const key of ["contactName","contactIndustry","contactRelation"])values[key+i]=text(draft[key+i]);
    return values;
  }
  function fillLines(values,key,value,count,width=42){
    const content=text(value);if(content.length>20000)throw new Error("訪談單一欄位超過可輸出長度，請先檢查內容；系統未刪減任何答案");
    const chunks=lines(content,width);for(let i=0;i<count;i++)values[`${key}.${i}`]=i===count-1?chunks.slice(i).join("\n"):(chunks[i]||"");
  }
  function careFields(type,draft,applicant,context){
    const values={chapter:"富聯",member:text(applicant||draft.member),profession:text(context.profession),meetingDate:text(draft.meetingDate||draft.interviewDate).replace("T"," "),counselor:text(draft.counselor||draft.interviewer||draft.login||draft.loginUser),companionCounselor:text(draft.companionCounselor)};
    values.counselors=[values.counselor,values.companionCounselor].filter(Boolean).join("／");
    values.memberSignature=text(draft.memberSignature)||values.member;
    values.signatureDate=text(draft.meetingDate).slice(0,10);
    const m=context.metrics||{},averages=context.averages||{};
    for(const key of ["absence","substitutes","late","early","givenIn","givenOut","receivedIn","receivedOut","amount","visitors","education","oneToOne"]){
      values[`metric.${key}`]=text(m[key]);values[`average.${key}`]=text(averages[key]);
    }
    for(const [key,a,b] of [["given","givenIn","givenOut"],["received","receivedIn","receivedOut"]])values[`metric.${key}`]=Number.isFinite(m[a])&&Number.isFinite(m[b])?String(m[a]+m[b]):"";
    if(type==="midterm"){
      values.scoreNote=context.score==null?"":`${context.score}分 ${text(context.light)}`;values.periodNote=text(context.palmsPeriod);
      for(const [key,counts] of Object.entries({goal:[2,2,2,2,2],reality:[3,3,3,3,3],option:[3,3,3,3],forward:[3,3,2,3,2,3]}))counts.forEach((count,i)=>fillLines(values,`${key}_${i}`,draft[`${key}_${i}`],count));
      fillLines(values,"summary",draft.summary,3);
    }else{
      values.departureDate=text(draft.departureDate);values.interviewers=[values.counselor,text(draft.companion)].filter(Boolean).join("／");
      for(const key of ["gains","likes","departureReason","dislikes","improvementAttempts"])values[key]=text(draft[key])||"_".repeat(66);
      for(const [key,radio,note] of [["training","trainingUnderstood","trainingUnderstandingNotes"],["msp","mspAttended","mspNotes"],["procedure","procedureDone","emailNoticeDate"]])values[key]=[text(draft[`radio:${radio}`]),text(draft[note])].filter(Boolean).join("；")||"____________________";
      const ruled=(value,width)=>{const content=text(value);const used=Array.from(content).reduce((n,c)=>n+(c.codePointAt(0)>255?2:1),0);return content+"_".repeat(Math.max(0,width-used))};
      for(const [key,width] of [["chapter",24],["member",24],["departureDate",23],["interviewers",24],["meetingDate",23]])values[key]=ruled(values[key],width);
      for(const [key,width] of [["presidentSignature",21],["vicePresidentSignature",20],["directorSignature",19]])values[key]=ruled(draft[key],width);
    }
    return values;
  }
  function fields(draft={},applicant="",type="new",context={}){
    templateFor(type);
    if(["renewal","renewal-assessment"].includes(type))return renewalFields(type,draft,applicant,context);
    const values=["new","industry"].includes(type)?membershipFields(draft,applicant):careFields(type,draft,applicant,context);
    if(context.historicalCopy){
      // Typed names, consent and dates must come from the original saved fields.
      // A case assignment or login identity is not evidence of a historical signature.
      for(const key of ["applicantSignature","memberSignature","witness1","witness2","witness3"]){
        if(Object.hasOwn(values,key))values[key]=text(draft[key])||"________________";
      }
      if(Object.hasOwn(values,"signatureDate"))values.signatureDate=text(draft.signatureDate);
    }
    return values;
  }
  function fileName({type,applicant,meetingDate}){
    templateFor(type);
    const day=dateParts(meetingDate);if(!day)throw new Error("請先填寫訪談日期再產生 Word");
    const name=text(applicant).replace(/[\\/:*?"<>|\x00-\x1f]/g,"-");if(!name)throw new Error("請先填寫申請人姓名");
    const prefix={new:"高屏區會員成功訪談表暨權利義務確認書-新會員",industry:"高屏區會員成功訪談表暨權利義務確認書-轉換行業別",midterm:"363留員計畫-期中輔導",renewal:"高屏區會員續約訪談表","renewal-assessment":"高屏區續約會員委員會內部評估表",departure:"離會訪談表"}[type];
    return `${prefix}-${name}-${day.join("")}.docx`;
  }
  return Object.freeze({TEMPLATE,TEMPLATES,templateFor,NARRATIVES,MEMBERSHIP,RENEWAL,fields,fileName});
});
