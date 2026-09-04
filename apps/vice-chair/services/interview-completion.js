(function exposeInterviewCompletion(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.FulianInterviewCompletion=api;
})(typeof globalThis!=="undefined"?globalThis:this,function createInterviewCompletion(){
  function escapeHtml(value=""){
    return String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  }

  function feedbackUrl(caseId){
    return`case-workflow.html?case=${encodeURIComponent(caseId||"")}`;
  }

  function completionRecord({caseId="",fileName="",memberName="",now=new Date()}={}){
    return{
      caseId,
      fileName,
      memberName,
      completedAt:now.toISOString(),
      completedAtLabel:now.toLocaleString("zh-TW",{timeZone:"Asia/Taipei"}),
      feedbackUrl:feedbackUrl(caseId)
    };
  }

  function triggerDownload(blob,fileName){
    const anchor=document.createElement("a");
    anchor.href=URL.createObjectURL(blob);
    anchor.download=fileName;
    anchor.click();
    setTimeout(()=>URL.revokeObjectURL(anchor.href),2000);
  }

  function setup({buttonSelector="#downloadWord",actionsSelector=".actions",formLabel="訪談",requiresDecision=true}={}){
    const button=document.querySelector(buttonSelector),actions=document.querySelector(actionsSelector);
    if(!button||!actions)throw new Error("找不到訪談完成操作區");
    button.textContent="完成訪談並產生 Word";
    const reset=actions.querySelector("#resetDraft");
    if(reset){reset.textContent="清除未完成草稿";reset.classList.add("draft-reset")}

    const panel=document.createElement("section");
    panel.className="interview-completion";
    panel.hidden=true;
    panel.setAttribute("aria-live","polite");
    actions.insertAdjacentElement("afterend",panel);
    let lastFile=null;

    function begin(){
      button.disabled=true;
      button.textContent="正在完成並產生 Word…";
      panel.hidden=true;
    }

    function success({blob,fileName,caseId,memberName,now=new Date()}){
      const record=completionRecord({caseId,fileName,memberName,now});
      lastFile={blob,fileName};
      triggerDownload(blob,fileName);
      button.disabled=false;
      button.textContent="重新產生並更新完成檔";
      panel.dataset.tone="success";
      const nextCopy=requiresDecision
        ?"案件已進入「訪談已完成・待發送委員回饋」階段。"
        :"本案不需委員回饋與投票，已完成結案。";
      const primaryAction=requiresDecision
        ?`<a class="completion-primary" href="${escapeHtml(record.feedbackUrl)}">前往回饋流程 →</a>`
        :`<a class="completion-primary" href="case-board.html#closed">查看已完成案件 →</a>`;
      panel.innerHTML=`<div class="completion-icon" aria-hidden="true">✓</div><div class="completion-copy"><small>INTERVIEW COMPLETED</small><h2>${escapeHtml(formLabel)}階段已完成</h2><p><b>${escapeHtml(memberName)}</b> 的訪談紀錄與 Word 已保存，${nextCopy}</p><dl><div><dt>完成時間</dt><dd>${escapeHtml(record.completedAtLabel)}</dd></div><div><dt>保存檔案</dt><dd>${escapeHtml(fileName)}</dd></div></dl><div class="completion-actions">${primaryAction}<a href="case-board.html">返回進行中案件</a><button type="button" data-redownload>再次下載 Word</button></div></div>`;
      panel.hidden=false;
      panel.querySelector("[data-redownload]").onclick=()=>lastFile&&triggerDownload(lastFile.blob,lastFile.fileName);
      panel.scrollIntoView({behavior:"smooth",block:"center"});
      return record;
    }

    function failure({blob,fileName,error}={}){
      if(blob&&fileName){lastFile={blob,fileName};triggerDownload(blob,fileName)}
      button.disabled=false;
      button.textContent="重試完成訪談並產生 Word";
      panel.dataset.tone="warning";
      panel.innerHTML=`<div class="completion-icon" aria-hidden="true">!</div><div class="completion-copy"><small>SAVE INCOMPLETE</small><h2>尚未完成案件保存</h2><p>Word 已產生${blob?"並下載":""}，但附件或案件階段未成功保存。請不要關閉頁面，確認後再次按下完成。</p><p class="completion-error">${escapeHtml(error?.message||"案件保存失敗")}</p>${lastFile?`<div class="completion-actions"><button type="button" data-redownload>再次下載 Word</button></div>`:""}</div>`;
      panel.hidden=false;
      const redownload=panel.querySelector("[data-redownload]");
      if(redownload)redownload.onclick=()=>lastFile&&triggerDownload(lastFile.blob,lastFile.fileName);
      panel.scrollIntoView({behavior:"smooth",block:"center"});
    }

    return{begin,success,failure};
  }

  return Object.freeze({feedbackUrl,completionRecord,setup});
});
