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
  return {monthLabel,resultText,announcement};
});
