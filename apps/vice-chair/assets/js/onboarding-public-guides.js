(function(global){
  "use strict";
  const catalog=global.FulianOnboardingGuides;
  if(!catalog?.registerGuides)return;
  const VERSION="1.0.1";
  const roles=["public"];
  const step=(id,section,target,title,body,fact)=>({id,section,target,title,body,...(fact?{fact}: {})});
  const intro=(page,title,description)=>({public:{eyebrow:"公開填寫版・"+page+"導覽",title,description}});

  catalog.registerGuides({
    "page:public-feedback":{
      id:"page:public-feedback",
      version:VERSION,
      title:"委員回饋填寫導覽",
      page:"會員委員回饋",
      roles,
      intro:intro("會員委員回饋","確認案件與姓名後，再送出正式回饋","這個連結只處理當次案件回饋，不需要登入，也不會取得你的 LINE 帳號。"),
      steps:[
        step("case","確認案件",".case-card","先核對案件對象","確認案件類型、申請人、專業別、訪談日期與訪談人員；資訊不符時不要送出，請回群組聯絡副主席。"),
        step("status","確認案件","#feedbackStatus","查看連結狀態","只有顯示回饋已開放時才能填寫；失效、尚未開放或案件結案時，頁面會說明原因。"),
        step("responses","閱讀回饋","#responsesCard","查看目前委員回饋","此區會顯示目前已有的正式回饋；重新整理只抓取最新內容，不會送出你的表單。"),
        step("identity","填寫回饋",".identity-field","第一步：選擇你是誰","完整欄位會一起顯示姓名選擇與身份規則；請選擇本人，同一姓名原則上只能送出一次，共用連結不會自動辨認你的身份。"),
        step("feedback","填寫回饋",".feedback-field","第二步：填寫具體回饋","完整欄位包含撰寫區、字數與限制；引用訪談內容、數據或具體觀察並提出建議，避免加入無關敏感資訊。"),
        step("submit","正式送出","#submitFeedback","確認送出並同步系統","按下後還會要求確認；完成後會直接寫入正式案件，其他有權限的委員可查看。",{label:"正式資料",text:"送出前再次核對姓名、對象與內容。"}),
        step("share","送出後","#shareCard","分享回委員會群","送出成功後可用 LINE 分享或複製自己的回饋；這不會再次建立回饋。"),
        step("privacy","安全提醒",".privacy-note","只在會員委員會內使用連結","此頁不登入也不讀取 LINE 帳號；不要把案件連結轉傳給無關人員。")
      ]
    },
    "page:public-vote":{
      id:"page:public-vote",
      version:VERSION,
      title:"委員投票操作導覽",
      page:"會員委員投票",
      roles,
      intro:intro("會員委員投票","核對案件、姓名與票向後，送出唯一一票","這個連結只處理當次案件投票；系統不會預選票向，也不會向你顯示其他人的個別選擇。"),
      steps:[
        step("case","確認案件",".ballot-card","先核對投票案件","確認類型、申請人、專業別、截止時間與目前票數；資訊不符時不要投票。"),
        step("status","確認案件","#ballotStatus","查看投票是否開放","只有顯示投票已開放時可送出；截止、失效或尚未開放會有明確說明。"),
        step("identity","選擇身份",".identity-field","第一步：選擇本人姓名","完整欄位會一起顯示姓名選擇與投票規則；請選擇本人，已投票姓名會停用，共用連結不會自動判斷你是誰。"),
        step("choice","選擇票向","#ballotForm fieldset","第二步：選擇一項","依訪談與回饋自行判斷同意或不同意；系統不會建議、預選或替你投票。"),
        step("submit","正式送出","#submitVote","確認送出這一票","按下後還會顯示確認訊息；正式送出後不能自行修改，請再次核對姓名與票向。",{label:"正式資料",text:"同一姓名只記錄一票。"}),
        step("privacy","安全提醒",".privacy-note","保護投票連結","此頁不需要登入、不取得 LINE 帳號；連結只留在會員委員會群組內。")
      ]
    }
  });
})(window);
