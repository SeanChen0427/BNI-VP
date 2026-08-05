(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.FulianInterviewWordDomain=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  const DEFAULT_CHAPTER_NOTES=[
    "1. 3次遲到及早退轉為一次缺席",
    "2. 紅燈有條件續約，灰燈不予續約",
    "3. 續約須於續約到期日前2個月的當月15日前完成申請及繳費，逾期代表放棄續約權益。",
  ].join("\n");

  function checkboxMark(input){
    return input?.checked?"■":"□";
  }

  return{DEFAULT_CHAPTER_NOTES,checkboxMark};
});
