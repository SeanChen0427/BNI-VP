(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.FulianMonthlyAwardsDomain=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  function monthLabel(month){
    const match=String(month).match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if(!match)throw new Error("公告月份不正確");
    return `${match[1]} 年 ${Number(match[2])} 月`;
  }
  function resultText(award){
    if(award.status==="no-records")return "本月無紀錄";
    return `${award.winners.join("、")}｜${Number(award.value).toLocaleString("zh-TW")} ${award.unit}${award.winners.length>1?"（並列第一）":""}`;
  }
  function announcement(data){
    return [`富聯分會｜${monthLabel(data.month)}績優公告`,"",
      ...data.awards.map(award=>`${award.label}第一名\n${resultText(award)}`),
      "",`統計期間：${data.period.start} 至 ${data.period.end}`,
      "評比範圍：目前仍在會且當月有資料的會員。",
      ...(data.missingMemberCount?[`另有 ${data.missingMemberCount} 位現役會員當月無資料，未列入評比。`]:[]),
      "感謝每位夥伴的付出與貢獻！"].join("\n");
  }
  const centerOrder=["oneToOne","amount","given","visitors","education"];
  const centerLabels={oneToOne:"一對一（會面次數）",amount:"引薦價值（累計最高金額）",given:"業務引薦（提供引薦）",visitors:"來賓邀約",education:"培訓積分"};
  function centerAwardLine(award,index){
    if(!award)throw new Error("中心區回覆資料不完整");
    const label=`${index+1}．${centerLabels[award.key]}第一名：`;
    if(award.status==="no-records")return label+"本期無紀錄";
    if(!award.winners?.length||!Number.isFinite(award.value))throw new Error("中心區回覆成績不完整");
    const tied=award.winners.length>1;
    return `${label}${award.winners.join("、")}（${tied?"並列，各 ":""}${award.value.toLocaleString("zh-TW")} ${award.unit}）`;
  }
  function centerReply(data){
    const term=data.halfYear;
    if(term?.status!=="ready")throw new Error("近半年資料尚未齊全，暫時無法複製完整回覆");
    const dates=period=>`${period.start.replaceAll("-","/")}–${period.end.replaceAll("-","/")}`;
    const lines=(awards,keys)=>keys.map((key,i)=>centerAwardLine(awards.find(a=>a.key===key),i));
    return ["您好～以下是富聯分會優秀會員名單，請查收。","",
      `【${monthLabel(data.month)}】優秀會員`,...lines(data.awards,centerOrder.slice(0,4)),"",
      `【近半年 ${dates(term.period)}】優秀會員`,...lines(term.awards,centerOrder),
      `6．全勤獎：${term.attendance.winners.length?term.attendance.winners.join("、"):"本期無"}`,
      `全勤條件：${term.attendance.criteria}`,"",
      "數據來源：PALMS；僅評比目前仍在會的會員。",
      "一對一採 PALMS 會面次數；業務引薦為提供內部＋外部引薦。",
      ...(data.missingMemberCount?[`單月有 ${data.missingMemberCount} 位現役會員無資料，未列入評比。`]:[]),
      ...(term.missingMemberCount?[`近半年有 ${term.missingMemberCount} 位現役會員無資料，未列入評比。`]:[]),
      "如有問題再麻煩告知，謝謝您！","— 富聯分會副主席"].join("\n");
  }
  return {monthLabel,resultText,announcement,centerReply};
});
