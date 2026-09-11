(function(global){
  "use strict";

  const catalog=global.FulianOnboardingGuides;
  if(!catalog?.registerGuides)return;

  const PAGE_VERSION="1.0.1";
  const BOTH=["vp","committee"];
  const VP=["vp"];
  const COMMITTEE=["committee"];
  const s=(id,section,target,title,body,options)=>({id,section,target,title,body,...(options||{})});
  const note=(label,text)=>({label,text});
  const chrome=()=>[
    s("workspace-menu","頁首工具",'[data-guide-id="workspace.menu"]',"主選單","離開首頁後，仍可從這裡開啟完整工作選單。選擇項目只會切換頁面，不會送出或修改資料。"),
    s("back","頁首工具",'[data-guide-id="workspace.back"]',"回上一頁","按下後返回原頁面。表單會依既有規則保留草稿，但未完成的正式送出不會被當成已完成。")
  ];
  const intros=(page,title,vpDescription,committeeDescription)=>({
    vp:{eyebrow:"副主席版・"+page+"導覽",title,description:vpDescription},
    committee:{eyebrow:"會員委員版・"+page+"導覽",title,description:committeeDescription||vpDescription}
  });
  const page=({key,name,roles=BOTH,title,vp,committee,steps,version=PAGE_VERSION})=>({
    id:"page:"+key,
    version,
    title:name+"完整導覽",
    page:name,
    roles,
    intro:intros(name,title,vp,committee),
    steps:[...chrome(),...steps]
  });

  catalog.registerGuides({
    "page:partners":page({
      key:"partners",name:"夥伴名錄",version:"1.1.0",title:"依月份與欄位整理夥伴近況",
      vp:"查看會籍、單月或累計 PALMS，搜尋、篩選、排序，再開啟個人詳情。這裡只查閱資料。",
      steps:[
        s("refresh","資料更新","#refresh","重新讀取正式資料","每月匯入後重新載入：單月讀最新匯入報表；半年、一年與會籍沿用目前已生效的正式快照。失敗時按重試，不會以上次數字冒充新資料。"),
        s("source","資料來源",".source-note","先核對資料期間","展開查看各期間與名錄更新時間。會籍不是即時同步；日期已過不代表未續約。"),
        s("search","篩選夥伴","#filterPanel","點選夥伴，可一次選多位","點擊搜尋展開名單，輸入姓名或專業別縮小選項，點選加入；已選標籤按叉號移除，未選人顯示全部。可搭配到期與數值篩選，收合本區會保留條件摘要。"),
        s("period","選擇期間","#period","可看單月，也可看半年與一年","只列實際已匯入的月份。切換月份改變活動數字，會籍與名單仍是目前快照；當月沒有的夥伴顯示尚無資料。"),
        s("view","顯示欄位",".view-bar","總覽、會籍、交流、出席四種檢視","先選常用欄位，再到進階區勾選增減。重設會恢復預設欄位並清除所有篩選。"),
        s("sort","排序",".sort-bar","各項數據都可升降冪排列","例如一對一由多到少，或會籍到期由早到晚。也可直接點表頭切換；缺資料固定排最後。"),
        s("advanced","進階篩選",".advanced","自訂日期範圍、數值範圍與顯示欄位","展開後設定到期日起迄，或一對一、來賓等數值的最少／最多。勾選顯示欄位，姓名固定保留。瀏覽器只記住欄位、期間及排序，不保存名錄資料。"),
        s("detail","表格與匯出","#resultsPanel","展開表格、匯出名單或查看個人資料","按展開表格使用大畫面，收回或 Escape 離開。複製文字與匯出圖片均採目前結果、排序與欄位，圖片多頁可逐頁下載。點姓名看完整資料，叉號或 Escape 關閉；空結果可清除篩選。")
      ]
    }),
    "page:renewal-foundations":page({
      key:"renewal-foundations",name:"續約地基追蹤",version:"1.2.0",
      title:"把續約約定拆成可逐期核對的目標",
      vp:"例如同一位會員約定每月 1 位來賓、每 3 個月 1 場工作坊，就設定兩項地基，集中在同一張會員卡追蹤。",
      committee:"先找自己受指派的會員，核對目前進度與目標，再記錄實際聯繫及回覆。未受指派者只看必要摘要。",
      steps:[
        s("legacy","設定入口","#importLegacyFoundation","新約定與既有地基從哪裡設定","新約定先進入該會員的續約訪談，在地基區設定。以前已有約定、沒有系統案件時，按這裡補登既有地基，填原起算日，不必補建訪談。",{roles:VP}),
        s("definition","設定目標","#foundationList","先選指標，再選期間與數量","可選來賓人數、培訓積分（PALMS 教育單位）或工作坊場次；期間可選會籍／指定期間累計、每月、每 3 個月、半年、每年或自訂月數。改善項目與補充說明可留白；其他人工條件才需寫完成標準。",{roles:VP}),
        s("multiple","設定目標","#foundationList","一位會員可以同時有多項地基","每月 1 位來賓和每 3 個月 1 場工作坊要各存一項。「儲存並新增下一項」沿用會員、日期及追蹤人；畫面仍集中在同一張會員卡，各項進度互不抵用。",{roles:VP}),
        s("periods","追蹤週期","#foundationList","每 3 個月從續約日起算","10/1 起算時，每 3 個月依序檢視 10/1–12/31、1/1–3/31，以此類推；不是按曆季切割。新地基結束日包含當日，一年會籍可填 10/1 到翌年 9/30。"),
        s("lead","追蹤週期","#foundationList","半年內達標與半年前提醒不同","若約定半年內累計 4 位來賓，填半年起訖、累計目標 4；若約定續約前累計 4 位，填整年期間並選期限前 6 個月開始提醒。每月、每 3 個月等週期地基則持續逐期檢視。",{roles:VP}),
        s("form-help","表單教學","#importLegacyFoundation","從右上角查看完整欄位說明","右上角「操作教學」集中提供設定、紀錄與歷程的完整操作說明。先展開需要的主題查看，再回到功能填寫；點功能按鈕只開啟對應視窗，教學不會自動跳出或代填保存。",{roles:VP}),
        s("add-member","同會員新增","#foundationList","會員卡右上角「新增地基」","在正確姓名下按新增地基，沿用這位會員的日期與追蹤人，再設定另一個指標或期間。最後仍須按儲存才會新增；各項條件與歷程分開保存。",{roles:VP}),
        s("summary","追蹤概況",".summary","資料待補不等於零人或未達成","四個數字計算地基項數：持續列管、目前需跟進、仍無實際提醒紀錄，以及副主席已確認達成。來賓與培訓由正式 PALMS 核對；缺資料要先補，不能當零人。培訓採教育單位，尚未起算不算逾期。"),
        s("filter","查找會員",".toolbar","先找自己要跟進的會員","可選「我負責／陪同」或「需要跟進」，再搜尋姓名。會員卡集中列出多項地基；展開「各期進度與操作」查看每期目前數量、目標及差額。"),
        s("search","搜尋會員",".toolbar label:nth-child(2)","搜尋只縮小清單，不修改地基","輸入姓名或改善項目找會員；清除文字可恢復目前範圍的清單。從指定會員連結進入時，按清單上方「查看全部追蹤」才會解除會員限制。"),
        s("refresh","重新同步","#refresh","重新整理：取得最新進度與紀錄","按下會重新讀取正式資料與追蹤結果，不會新增地基或重算 BNI 分數。剛保存卻提示清單更新失敗時，使用這裡核對，避免重複新增。"),
        s("action-help","逐項操作","#foundationList","展開後直接使用實際操作","「查看歷程」開啟過去紀錄；「記錄提醒／進度」新增聯繫與回覆；「調整條件／指派」修改設定。操作區只放實際功能，開啟視窗不會自動播放教學；需要說明可從頁面的操作教學重看。"),
        s("workshop","核對完成","#foundationList","工作坊由副主席逐期確認","核對實際參加日期與證據後，確認對應期間。單一期完成不代表往後各期完成；同一期多場，備註列出各場日期與內容。",{roles:VP}),
        s("remind","留下提醒","#foundationList","實際聯繫後再記錄已提醒","在姓名旁按「複製提醒文字」，一次整理這位夥伴全部可查閱地基與進度；實際聯繫後記錄日期、管道及回覆。複製文字或通知已讀不算已提醒；地基會繼續列管到確認結果。"),
        s("edit","修正與復原","#foundationList","日期填錯可調整並留下原因","展開「各期進度與操作」，選「調整條件／指派」修正起算日、期限或目標並填原因。期間改變的工作坊須重新確認；原歷程仍保留。指標或週期類型改變時另建正確地基。",{roles:VP}),
        s("delete","修正與復原","#foundationList","誤建地基可以刪除與復原","同一操作區選「刪除地基」並填原因，只移除這一項。誤刪時切到「已刪除（可復原）」找回；同會員其他地基與已封存的月會、Word 不受影響。",{roles:VP}),
        s("contexts","交接追蹤","#foundationList","首頁、月會與訪談接續提醒","首頁待處理事項下方持續顯示地基；月會帶出需跟進摘要，期中與續約訪談帶出既有地基，Word 保存當時快照。逾期會提醒人工檢視，不會自動開放專業類別。")
      ]
    }),
    "page:case-board":page({
      key:"case-board",
      name:"進行中案件",
      title:"從階段找到每件案件的下一步",
      vp:"這裡是五種訪談案件的集中入口，可建立案件、依階段篩選、搜尋會員並進入正確的後續動作。",
      committee:"這裡集中顯示可查看的進行中案件，並依階段帶你進入訪談、回饋或投票。",
      steps:[
        s("new","建立案件","#newCase","建立新案件","由這裡建立新會員、期中輔導、續約、轉換行業別或離會案件。完成必填資料前不會產生正式案件。",{roles:VP,fact:note("資料影響","最後確認後才會建立案件。")}),
        s("summary","案件概況","#summary","五階段案件數","快速查看待訪談、待回饋、待投票、待確認及已結案數量；數字會隨正式流程更新。"),
        s("stages","篩選與搜尋","#stageTabs","依階段篩選","切換階段只改變清單顯示，不會變更任何案件狀態。"),
        s("search","篩選與搜尋",'[data-guide-id="cases.search"]',"搜尋會員或專業別","完整搜尋欄位會保留功能名稱與輸入區；輸入姓名、類型或專業別縮小清單，清除文字即可恢復目前階段的全部案件。"),
        s("cards","案件清單","#caseList","案件卡與下一步","每張卡片整理類型、階段、負責人、時程與下一個可執行動作；點選後才會進入案件。"),
        s("committee-actions","案件清單","#caseList","只顯示可執行的動作","委員會看到訪談、回饋、投票或查看進度；結案、刪除與董顧確認不會出現在委員版。",{roles:COMMITTEE,fact:note("權限","畫面和導覽同時依角色過濾。")}),
        s("delete","高影響操作","#caseList","刪除錯誤建立的案件","副主席在條件允許時可刪除，並有二次確認；確認後會連同草稿、回饋、投票與附件移除且無法復原。",{roles:VP,fact:note("注意","只有明確誤建的案件才應刪除。")})
      ]
    }),

    "page:case-workflow":page({
      key:"case-workflow",
      name:"案件工作區",
      title:"依流程完成訪談、回饋與決議",
      vp:"工作區會依案件類型與階段開啟正確區塊，並清楚區分閱讀、儲存、正式發送與結案。",
      committee:"你會學會查看訪談 Word、填寫回饋、完成投票並掌握進度；副主席專屬確認與結案不會出現。",
      steps:[
        s("facts","案件資料",'[data-guide-id="workflow.case-profile"]',"案件基本資料","先核對類型、會員、專業別、日期、主訪、陪訪、投票期限與迴避人員；導覽會框住整張案件資料卡，方便確認正在操作正確案件。"),
        s("workflow","案件資料","#workflowStrip","流程階段條","顯示案件從訪談、回饋、投票、確認到結案的位置；階段只能由正式動作推進，不能點選跳關。"),
        s("word","訪談文件","#wordSection","訪談 Word 狀態","查看已保存檔案、上傳更新或下載；單純閱讀與下載不會改變案件階段。"),
        s("upload","訪談文件","#fileZone","選擇訪談附件","只上傳本案正確 Word，先核對會員與訪談類型，避免將其他會員的敏感內容放錯案件。",{fact:note("隱私","只保存本案必要文件。")}),
        s("download","訪談文件","#downloadWord","下載訪談 Word","只會下載目前案件的已保存檔案，不會修改案件；未開放表示尚無可下載附件。"),
        s("feedback-notice","委員回饋",'[data-guide-id="workflow.feedback-destination"]',"選擇回饋通知環境","完整欄位會顯示目的群選項與資料影響；副主席選擇正式或測試環境，再產生相應的回饋連結。",{roles:VP}),
        s("feedback-copy","委員回饋","#copyFeedbackNotice","複製回饋通知","只複製文案與連結，不會自動發到 LINE；貼上前請再次核對案件對象。",{roles:VP,fact:note("資料影響","只寫入剪貼簿。")}),
        s("feedback-status","委員回饋",'[data-guide-id="workflow.feedback-threshold"]',"回饋人數與門檻","這個完整摘要區顯示已回饋數、應回饋人數與是否達到進入投票的條件。"),
        s("feedback-editor","委員回饋",'[data-guide-id="workflow.feedback-editor"]',"填寫我的回饋","這個工作區包含回饋歸屬、撰寫欄位與保存入口；以具體訪談內容、觀察與建議填寫，共用帳號下送出前務必核對目前姓名。"),
        s("feedback-save","委員回饋","#saveFeedback","儲存正式回饋","按下後會以目前姓名寫入案件並影響完成數，並非只留在本機的草稿。",{fact:note("正式儲存","導覽不會替你按下。")}),
        s("feedback-list","委員回饋","#feedbackList","閱讀已送出回饋","依權限閱讀團隊回饋；內容只限案件必要協作，不要轉傳給無關人員。"),
        s("open-vote","開啟投票","#openVote","確認回饋後開啟投票","只有副主席在條件滿足時可開啟；按下會正式推進案件，不應為測試畫面而操作。",{roles:VP,fact:note("正式階段","開啟後投票者才能投票。")}),
        s("vote-status","委員投票","#voteSection","投票狀態與門檻","顯示是否開放、截止時間、可投票人員、已投數與目前決議狀態。"),
        s("vote-notice","委員投票","#copyVoteNotice","複製投票通知","只複製最新投票連結與文案，不會自動發送。",{roles:VP}),
        s("ballot","委員投票",'[data-guide-id="workflow.ballot"]',"選擇本人票向","這個投票工作區會顯示目前姓名、兩個票向與送出入口；核對姓名後選擇一項，系統不會建議或預選。"),
        s("submit-vote","委員投票","#submitVote","確認送出這一票","會寫入正式票紀錄；送出前再次核對姓名、票向與案件對象。",{fact:note("重要","正式送出後不應自行修改。")}),
        s("decision","委員投票","#decisionBox","投票結果與是否成案","依有效基數、最低參與人數及多數決顯示結果；同票不形成決議，仍保留人工確認。"),
        s("voters","委員投票","#voterStatus","查看已投與待投人員","用於中性提醒尚未完成者；不應對外揭露個別票向。"),
        s("leadership","副主席確認","#resultSection","三長群與董顧確認","整理文案、投票圖及完整訪談內容；先預覽，再複製或發送。",{roles:VP}),
        s("advisor","副主席確認",'[data-guide-id="workflow.advisor-box"]',"記錄董顧結果","完整工作區包含說明、確認狀態、備註與保存按鈕；只能記錄已實際取得的確認。",{roles:VP}),
        s("announcement","副主席確認","#resultAnnouncementBox","決議公告預覽與發送","先核對介紹人、結果與對象；預覽本身不會發送，正式發送按鈕才會。",{roles:VP}),
        s("close","結案","#closeSection","結案前最後確認","確認 Word、決議、董顧與公告紀錄都正確後才結案；完成後移入歷史資料。",{roles:VP,fact:note("正式操作","結案後由已結案資料頁查閱。")}),
        s("status","案件追蹤",'[data-guide-id="workflow.status-card"]',"右側案件狀態","整張狀態卡會整理階段、進度、編號、門檻、權限與重設入口；重置不是日常回上一步工具。",{roles:VP}),
        s("history","案件追蹤",'[data-guide-id="workflow.activity-card"]',"案件歷程","正式儲存、開票、確認與結案都會在這張歷程卡留下時間與操作人，供交接與查證。",{roles:VP})
      ]
    }),

    "page:case-archive":page({
      key:"case-archive",
      name:"已結案資料",
      roles:VP,
      title:"在同一處查驗完整結案證據",
      vp:"這是副主席專用的唯讀結案頁，集中保存訪談 Word、回饋、投票、董顧確認與歷程。",
      steps:[
        s("facts","結案概要",'[data-guide-id="archive.facts-card"]',"案件身份與結案狀態","先從完整案件資料卡核對會員、類型、訪談日期、責任人與結案狀態。"),
        s("word","訪談文件","#downloadWord","重新下載訪談 Word","只會匯出已保存文件，不會重開或改寫案件。"),
        s("departure","訪談重點","#departureInsightsSection","離會訪談摘要","離會案件會整理原因、改善過程與後續；只在必要範圍內查閱與交接。",{fact:note("隱私","離會原因可能含敏感內容，請最小揭露。")}),
        s("decision","決議資料","#decisionSection","決議摘要與結果圖","需要投票的案件會保留參與數、票數、成案狀態與結果圖下載。"),
        s("feedback","決議資料","#feedbackList","委員回饋","閱讀結案當時的回饋脈絡，不能在此事後改寫。"),
        s("votes","決議資料","#voteList","投票紀錄","僅依內部權限使用，不向無關人員揭露個別票向。"),
        s("advisor","確認與歷程","#advisorSection","董顧確認","查閱保存的狀態、備註與確認時間，本頁不提供修改。"),
        s("activity","確認與歷程",'[data-guide-id="archive.activity-card"]',"完整案件歷程","這張卡片會依時間整理訪談、回饋、開票、決議、董顧與結案留痕，即使尚無項目也能辨識查驗位置。")
      ]
    }),

    "page:member-care":page({
      key:"member-care",
      name:"會員關懷儀表板",
      title:"先看整體趨勢，再安排適當關懷",
      vp:"儀表板只讀取 BNI 分析核心的版本化快照，不在工作台重算燈號；副主席可從建議項目安排後續工作。",
      committee:"你可以從燈號、趨勢與提示掌握團隊現況，再依自己的指派參與後續關懷。",
      steps:[
        s("source","資料來源","#sourceCard","分析快照同步狀態","先確認是否已同步最新分析；中斷時系統會顯示錯誤，不會假裝資料完整。"),
        s("retry","資料來源","#retryButton","重新讀取分析","只在橋接中斷時出現；不會修改 PALMS 或重算分數。"),
        s("overview","整體概況",'[data-guide-id="care.overview"]',"分會整體摘要","這個摘要區集中會員數、綠燈率、續約預警與審計觀察；它們是工作提示，不是自動處置。"),
        s("traffic","整體概況",'[data-guide-id="care.traffic-panel"]',"燈號分布","完整區塊會顯示燈號說明、各燈號人數與比例，再從下方深入個別項目。"),
        s("section-nav","深入分析","#sectionNav","分析區段導覽","選擇主題只會捲動到對應區段，不會改變數據。"),
        s("sections","深入分析","#analysisSections","診斷、依據與建議","閱讀會員、指標、趨勢及建議；保留人工判斷，不把燈號當成對人的標籤。"),
        s("schedule","安排關懷","#analysisSections","排定期中關懷或續約訪談","副主席核對會員、日期、主責與陪訪後儲存，才會建立或更新工作。",{roles:VP,fact:note("資料影響","會同步到首頁與案件清單。")}),
        s("committee-use","安排關懷","#analysisSections","依團隊分工參與","委員版以閱讀趨勢與已指派工作為主，不顯示副主席排定按鈕。",{roles:COMMITTEE}),
        s("provenance","資料查驗",'[data-guide-id="care.provenance"]',"快照來源、時間與指紋","用完整的來源資訊區確認大家查看的是同一版本，也能辨識規則仍由分析核心負責。")
      ]
    }),

    "page:analysis-review":page({
      key:"analysis-review",
      name:"月度分析審閱",
      roles:VP,
      title:"讓 AI 協助解讀，由副主席決定發佈",
      vp:"先由分析核心產生可對帳草稿，再用個人 AI 協助審視；駁回或發佈都必須由副主席明確確認。",
      steps:[
        s("generate","產生草稿","#generatePanel","選擇月份並產生分析","讀取分析核心已計算的結果，不在此重算燈號或續約。"),
        s("reconcile","產生草稿","#reconcileIssues","先解決對帳異常","會員主檔、PALMS 或人數無法對齊時會停止，不能繞過異常發佈。"),
        s("departure","產生草稿","#departureResolution","確認離會者排除","選擇正確人員與確認日後保存，才可產生一致草稿。"),
        s("draft","草稿對帳","#draftPanel","閱讀可驗證摘要","檢查人數、燈號、續約、警示與結構化資料；此時尚未發佈。"),
        s("renewal","草稿對帳","#renewalResolution","補齊續約完成依據","只用已查證對象與日期補正，不用推測填值。"),
        s("raw","草稿對帳",'[data-guide-id="analysis.raw-result"]',"結構化原始草稿","展開這個完整區段可查看引擎結果，供深入除錯與對帳；它不是手動編輯報告的欄位。"),
        s("provider","AI 審閱",'[data-guide-id="analysis.provider-select"]',"選擇個人 AI 平台","完整欄位會顯示目前可用的平台選項；只列出已安全綁定的平台，審閱使用個人 API 額度。"),
        s("review","AI 審閱","#reviewButton","送出完整草稿審視","會使用個人 token；AI 只解讀既有結果，不能改寫分數。",{fact:note("額度","每月低頻、品質優先。")}),
        s("codex","AI 審閱",'[data-guide-id="analysis.codex-entry"]',"貼上並保存 Codex 審閱結果","完整區段包含規格說明、內容欄位、保存按鈕與狀態；確認內容屬於本月草稿，不貼入 API Key 或無關敏感資料。"),
        s("output","AI 審閱","#reviewOutput","人工查核 AI 輸出","檢查是否忠實、有無過度推論與遺漏；AI 不是核准者。"),
        s("reject","人工決定",'[data-guide-id="analysis.reject-card"]',"駁回並留下原因","這張決定卡包含原因欄位與退回按鈕；保存具體原因後不會發佈到儀表板。"),
        s("publish","人工決定",'[data-guide-id="analysis.publish-card"]',"確認發佈月度快照","這張決定卡會一併顯示生效影響與正式按鈕；完成對帳、AI 審閱及人工核對後才執行。",{fact:note("正式發佈","這是高影響操作。")}),
        s("history","版本管理","#historyList","歷次草稿與決定","查看產生、審閱、駁回與發佈時間，追溯目前正式版本。")
      ]
    }),

    "page:attendance":page({
      key:"attendance",
      name:"點名與出席",
      title:"先完成點名，再預覽公告與正式確認",
      vp:"每週建立出席紀錄，完成人員狀態、公告預覽、記錄人及副主席確認後才鎖定當週。",
      committee:"你可依分工完成點名、核對公告，並以記錄人身分完成第一層確認。",
      steps:[
        s("meeting","例會設定",'[data-guide-id="attendance.meeting-date"]',"選擇本次例會日期","日期決定目前編輯與保存的週次；切換前先留意頁首儲存狀態。"),
        s("history-session","例會設定",'[data-guide-id="attendance.history-session"]',"選擇最近週次或查歷史","下拉選單保留最近 8 個已保存週次；較早資料請按「查歷史」依年月選擇，查完可按「回到本週」。切換前會先保存編輯中的草稿。"),
        s("primary-recorder","例會設定",'[data-guide-id="attendance.primary-recorder"]',"指定主要紀錄委員","請選擇實際負責核對的人員；主要紀錄委員負責第一層確認。"),
        s("assistant-recorder","例會設定",'[data-guide-id="attendance.assistant-recorder"]',"指定協助點名委員","有共同點名者時選擇實際協作者，沒有則保持未選；不會改變主要紀錄人的確認責任。"),
        s("speech","例會設定",'[data-guide-id="attendance.speech-seconds"]',"設定會員分享秒數","公告預覽會使用此數字，但它不影響出席計分。"),
        s("summary","點名摘要",'[data-guide-id="attendance.stats"]',"即時出席統計","完整摘要區會同步顯示總人數、到場、遲到、代理與缺席，方便送出前發現異常。"),
        s("roster","逐人點名",'[data-guide-id="attendance.roster-table"]',"填寫每位會員狀態","這個完整表格列出所有狀態欄；依當日事實勾選到場、遲到、早退、代理、缺席、發言與會務紀律，必要時補充備註。"),
        s("bulk","逐人點名",'[data-guide-id="attendance.bulk-tools"]',"批次勾選與清除本週","這排工具可套用常見狀態；清除本週會移除目前週次未確認輸入，使用前先核對日期。",{fact:note("注意","批次後仍要逐人檢查例外。")}),
        s("preview","公告","#announcementPreview","預覽 LINE 出席公告","用預覽檢查名單、數字、代理與缺席是否一致；預覽不會發送。"),
        s("copy","公告","#copyAnnouncement","複製公告","只寫入剪貼簿，不會發送或鎖定點名。"),
        s("send","公告","#sendLineAnnouncement","發送到 LINE 公告群","群組連線完成且當週已確認後才可用；按下會正式發送。",{roles:VP,fact:note("正式發送","發送前再讀一次預覽與目的群。")}),
        s("recorder","確認與鎖定",'[data-guide-id="attendance.recorder-confirm"]',"主記錄人確認","這一列會同時顯示確認項目與適用角色；勾選表示第一層核對完成，不等同副主席最終確認。"),
        s("vp-confirm","確認與鎖定",'[data-guide-id="attendance.vp-confirm"]',"副主席最終確認","核對記錄人、統計與公告後勾選；兩層確認都完成才可鎖定。",{roles:VP}),
        s("confirm","確認與鎖定","#confirmWeek","正式確認本週點名","會保存並鎖定本週資料，供後續 PALMS、當責信與歷史紀錄使用。",{roles:VP,fact:note("資料影響","後續通知與統計會以此為準。")}),
        s("reopen","確認與鎖定","#reopenWeek","重開已確認週次","只在發現確定錯誤時使用；更正後必須重新完成兩層確認。",{roles:VP})
      ]
    }),

    "page:monthly-meeting":page({
      key:"monthly-meeting",
      version:"1.0.3",
      name:"會員委員會月會",
      title:"將出席、成長、續約與關懷整理成月會紀錄",
      vp:"副主席可建立月會、同步資料、分配關懷、保存草稿、產生 Word 並正式結案。",
      committee:"委員可查看已保存的月會與團隊進度；建立、編輯及結案只在副主席版出現。",
      steps:[
        s("history","會議選擇",'[data-guide-id="monthly.history-panel"]',"查看歷史月會","左側完整區域保存各月份的草稿與結案紀錄；選擇月份只會切換閱讀內容，不會改寫原資料。"),
        s("new","會議選擇","#newMeeting","建立新月會","建立新月份草稿；先確認沒有同月紀錄。",{roles:VP}),
        s("access","會議選擇","#accessNotice","委員版閱讀模式","委員可以查閱已保存或結案紀錄，不顯示建立、儲存及結案按鈕。",{roles:COMMITTEE}),
        s("setup","基本資料",'[data-guide-id="monthly.profile-card"]',"月份、日期、資料期間與記錄人","這張基本資料卡決定本次月會的月份、日期、報告期間、記錄人與出席委員，並作為 Word 和歷史紀錄基礎。",{roles:VP}),
        s("attendance","出席摘要",'[data-guide-id="monthly.attendance-card"]',"上個月會員出席狀況報告","整張工作區會帶入上月正式 PALMS、會員數、缺席、遲到／早退、代理名單與討論紀錄；重新讀取不會編輯原點名。"),
        s("attendance-cards","出席摘要",'[data-guide-id="monthly.attendance-breakdown"]',"缺席、遲到與代理明細","這三張卡片共同呈現實際次數與人員名單；只有核對個別數字時才需要進入其中的輸入欄位。"),
        s("growth","成長與續約",'[data-guide-id="monthly.growth-card"]',"分會成長及留員狀況","整張卡片一起核對會員目標、實際人數、流失、申請、成長、核准、條件及待審數，再留下討論紀錄。"),
        s("care","關懷分工",'[data-guide-id="monthly.care-source"]',"同步續約與關懷資料","這個區段標題同時顯示資料說明、會員關懷儀表板入口與更新按鈕；更新只重新讀取清單，不會重新指派。"),
        s("care-board","關懷分工",'[data-guide-id="monthly.care-card"]',"閱讀會員與責任分工","整張關懷工作區依會員、原因、階段與期限整理本月續約及關懷項目；即使目前沒有待辦，也能清楚辨識這一區的用途。"),
        s("no-care","關懷分工",'[data-guide-id="monthly.care-card"]',"已不續約，可以選不安排關懷","期中或特定會員關懷若本次不需安排，選「本次月會決議 → 不安排關懷」，原因可寫在選填備註。這一項不再要求委員與日期，可通過結案檢查；已有工作仍保留。續約項目則使用「確認不續約」。",{roles:VP}),
        s("foundations","地基追蹤","#meetingFoundationSnapshot","月會也要核對續約地基","這裡帶出需要跟進的會員地基摘要。實際聯繫與工作坊確認請回地基追蹤頁記錄；月會結案保存當次快照，往後進度不會改寫歷史。"),
        s("care-actions","關懷分工",'[data-guide-id="monthly.care-actions"]',"記錄討論結論與追蹤方式","在完整欄位中寫下結論、主責、陪訪與期限；真正建立或更正工作仍須依卡片內的正式操作完成。",{roles:VP}),
        s("support","討論與決議",'[data-guide-id="monthly.support-card"]',"會員協助事項","整張卡片記錄會員近況、需要的資源、可協助人員與後續追蹤，不只是一個孤立文字框。",{roles:VP}),
        s("motions","討論與決議",'[data-guide-id="monthly.motions-card"]',"臨時動議","逐項記錄提案、討論結果、負責人與完成期限，讓下次月會能確認是否完成。",{roles:VP}),
        s("conclusion","討論與決議",'[data-guide-id="monthly.conclusion-card"]',"會議結論與下次追蹤","最後統整本次決議與下次會議前待辦；這張卡片會完整進入月會紀錄與 Word。",{roles:VP}),
        s("save","保存與結案","#saveDraft","保存月會草稿","保留目前輸入供下次續寫，不代表正式結案。",{roles:VP}),
        s("word","保存與結案","#downloadWord","產生月會 Word","匯出目前內容；下載本身不會結案。",{roles:VP}),
        s("finalize","保存與結案","#finalizeMeeting","正式結案月會","會設為正式完成版本供委員查閱；確認全部內容及分工後才執行。",{roles:VP,fact:note("正式操作","結案後更正需走明確流程。")})
      ]
    }),

    "page:new-member-form":page({
      key:"new-member-form",
      name:"新會員訪談表",
      title:"按區段完成訪談，最後產生正式 Word",
      vp:"表單會保存未完成草稿，並將專業、目標、承諾、訓練、人脈與簽名整理成同一份紀錄。",
      steps:[
        s("progress","表單導覽",'[data-guide-id="form.progress-panel"]',"完成進度、區段與自動儲存","完整側欄會顯示百分比、可跳轉區段與資料提醒；草稿有保存不等於訪談正式完成。"),
        s("basic","基本資料","#basic","案件、申請人與訪談人員","核對日期、地點、申請人、專業、介紹人、主訪與最多兩位陪訪。"),
        s("professional","專業理解","#professional","事業、優勢、客戶與案例","用具體資訊說明專業，並記錄型態、年資、證照及事業結構。"),
        s("company","專業理解","#lookupCompany","用統編查詢公司","查詢可輔助帶入公司名稱、資本額與成立日，仍須與申請人核對。"),
        s("goals","加入期待","#goals","目標與預期成果","記錄希望解決的實際問題與可追蹤目標。"),
        s("commitment","加入期待","#commitment","時間、出席與參與承諾","如實記錄申請人的回應，不預先代填理想答案。"),
        s("training","加入期待","#training","訓練與 MSP 理解","確認目前有效課程；外部連結只開啟資訊，不會代為報名。"),
        s("network","人脈與合作","#network","目標人脈與合作方式","用具體產業、人物類型與引薦場景描述需求。"),
        s("closing","綜合確認","#closing","其他問題與訪談筆記","補充限制與重要脈絡，只保存委員會必要資料。"),
        s("contacts","人脈建議","#contacts","可能的引薦方向","增減聯絡列並只記錄必要線索，不收集無關個資。"),
        s("signatures","結果與簽名","#signatures","內部建議、追蹤與簽名","完成建議、日期、摘要及實際簽名；未取得本人確認時不可代簽。"),
        s("reset","表單動作","#resetDraft","清除未完成草稿","會清除本案未完成輸入且無法從畫面復原。",{fact:note("注意","先核對目前案件。")}),
        s("download","表單動作","#downloadWord","完成訪談並產生 Word","驗證欄位、產生 Word 並依案件流程保存附件；會推進訪談階段。",{fact:note("下一步","回案件工作區進行委員回饋。")})
      ]
    }),

    "page:industry-change-form":page({
      key:"industry-change-form",
      name:"轉換行業別訪談表",
      title:"核對原專業與新專業，完整記錄轉換依據",
      vp:"共用新會員訪談的專業與參與結構，但額外核對現有及申請轉換的行業別。",
      steps:[
        s("progress","表單導覽",'[data-guide-id="form.progress-panel"]',"進度、區段與草稿狀態","完整側欄會顯示百分比、可跳轉區段與輸出邊界；草稿會保留，但不會自動完成轉換申請。"),
        s("basic","基本資料","#basic","會員、原行業別與新申請類別","核對日期、會員、目前專業、新專業、主訪與陪訪，避免兩個專業欄位填反。"),
        s("professional","新專業理解","#professional","新事業內容與可驗證經驗","記錄服務、優勢、客戶、案例、型態、年資、證照與事業結構。"),
        s("company","新專業理解","#lookupCompany","查詢公司資料","統編查詢只輔助帶入基本資料，仍要與會員核對。"),
        s("goals","轉換目標","#goals","為何轉換與預期成果","記錄原因、要改善的問題及可追蹤目標。"),
        s("commitment","參與承諾","#commitment","確認轉換後的參與方式","如實記錄對出席、引薦、訓練與合作的理解。"),
        s("training","參與承諾","#training","訓練與現行課程","外部連結只開啟官方資訊，不代為報名。"),
        s("network","人脈匹配","#network","新專業的目標人脈","說清楚客群、合作夥伴與可辨識的引薦情境。"),
        s("closing","綜合確認","#closing","邊界、重疊與待查證事項","補充業務邊界、潛在重疊及需再確認的項目。"),
        s("contacts","人脈建議","#contacts","可能的引薦方向","只記錄真正有後續價值的必要線索。"),
        s("signatures","結果與簽名","#signatures","內部建議、追蹤與簽名","完成建議、日期、摘要及實際參與者簽名。"),
        s("reset","表單動作","#resetDraft","清除未完成草稿","會移除本案尚未完成的輸入且無法由畫面復原。"),
        s("download","表單動作","#downloadWord","完成訪談並產生 Word","驗證欄位、保存正式 Word 並推進到委員回饋與投票。",{fact:note("正式完成","送出前再核對原專業與新專業。")})
      ]
    }),

    "page:midterm-form":page({
      key:"midterm-form",version:"1.0.2",
      name:"期中輔導表",
      title:"用 GROW 結構完成期中關懷",
      vp:"從 PALMS 表現、現況、目標、選項到行動方案完成輔導；Word 保存後直接結案，不進入投票。",
      steps:[
        s("foundations","既有地基","#renewalFoundationPanel","先核對續約後約定的進度","查看該會員各項地基與當期結果，把待補資料、未完成及會員回覆帶入關懷討論；Word 會保留當次地基摘要。"),
        s("progress","表單導覽",'[data-guide-id="form.progress-panel"]',"進度、GROW 區段與草稿","完整側欄會顯示百分比、GROW 區段與資料提醒；可中途離開續寫，只有最後完成 Word 才正式結案。"),
        s("basic","基本資料","#basic","會員與輔導人員","核對會員、專業、日期、輔導專員及陪同人員。"),
        s("performance","現況依據","#performance","PALMS 期間與表現","核對期間、分數及各項表現；數據是對話起點，不是對人的標籤。"),
        s("grow","GROW 輔導","#growSections","目標、現況、選項與行動","依順序記錄，重點是會員自己能說出並執行的下一步。"),
        s("summary","綜合建議","#summary","結論與後續行動","寫清楚承諾、責任人、時間點及追蹤方式。"),
        s("reset","表單動作","#resetDraft","清除未完成草稿","會清除本案未完成內容且無法由畫面復原。"),
        s("download","表單動作","#downloadWord","完成 Word 並直接結案","驗證內容、保存附件並完成期中案件；本類不進入回饋或投票。",{fact:note("正式完成","先核對會員、期間與結論。")})
      ]
    }),

    "page:terminal-form":page({
      key:"terminal-form",version:"1.0.2",
      name:"終期輔導（續約）",
      title:"將數據、經驗與續約承諾整理成完整訪談",
      vp:"結合續約次數、燈號、PALMS、訓練與未來承諾；完成 Word 後回案件進行回饋與投票。",
      steps:[
        s("progress","表單導覽",'[data-guide-id="form.progress-panel"]',"進度、區段與草稿","完整側欄會顯示百分比、區段選單與輸出原則；可快速跳轉，但自動保存不代表續約已完成。"),
        s("basic","基本資料","#basic","會員、輔導人員與續約次數","核對會員、專業、日期、主訪、陪訪及本次續約次數。"),
        s("snapshot","數據快照","#snapshot","分數、燈號與資料期間","先核對快照期間，再將數據作為對話依據，而不是直接結論。"),
        s("upload","數據快照","#renewalDataUpload","補上續約資料檔","只在快照不足時上傳本案正確檔案，避免帶入無關敏感資料。"),
        s("palms","表現解讀","#palms","逐項討論 PALMS","記錄會員觀點與原因；系統不會依此自動決定續約。"),
        s("experience","會員經驗","#experience","價值、挑戰與調整","區分會員原話與輔導者觀察，整理未來調整。"),
        s("agreement","續約承諾","#agreement","MSP、計畫與原則","確認訓練要求、日期、摘要與政策理解；外部連結不代為報名。"),
        s("foundations","續約地基","#renewalFoundationPanel","把本次約定設定成持續追蹤的地基","副主席在此逐項設定指標、期間、目標與追蹤人；同會員可有多項。先核對先前地基，再新增本次約定。續約訪談結案後，地基仍在首頁與追蹤頁持續列管。"),
        s("signatures","續約承諾","#agreement","簽名、訪談者意見與權責確認","這張完整確認卡包含簽名、訪談者意見與權責理解；只由實際參與者確認，不代填姓名或政策勾選。"),
        s("reset","表單動作","#resetDraft","清除未完成草稿","只清除目前未完成輸入，不是重算數據或倒退正式階段。"),
        s("download","表單動作","#downloadWord","完成訪談並產生 Word","保存正式附件並推進到委員回饋；不代表續約已通過。",{fact:note("下一步","回案件工作區進行回饋與投票。")})
      ]
    }),

    "page:departure-form":page({
      key:"departure-form",
      name:"離會訪談表",
      title:"尊重當事人，同時留下必要交接紀錄",
      vp:"從參與經驗、離會原因、改善過程、制度確認到內部追蹤完成訪談；文字保持中性並最小揭露。",
      steps:[
        s("progress","表單導覽",'[data-guide-id="form.progress-panel"]',"進度、區段與敏感資料提醒","完整側欄會顯示百分比、可跳轉區段與隱私提醒；草稿不代表已完成正式訪談或會員主檔離會。"),
        s("basic","基本資料","#basic","會員、離會日、訪談人與地點","核對會員、專業、日期、主訪、陪訪及地點。"),
        s("experience","參與經驗","#experience","收穫、感受與訓練經驗","記錄當事人原話，不把訪談者評價冒充會員說法。"),
        s("departure","離會原因","#departure","原因、不滿與改善嘗試","用中性文字記錄事實，避免指控、猜測動機或無關私密。",{fact:note("寫作邊界","記錄必要事實與後續，不貼標籤。")}),
        s("policy","制度確認","#policy","商標、資訊與離會後邊界","只有實際完成說明時才勾選理解。"),
        s("followup","內部追蹤","#followup","通知、後台與資格證追蹤","記錄 Email、秘書處、後台、證件、原因類別及委員會摘要。"),
        s("signatures","簽名確認","#signatures","三長簽名與日期","由實際參與者確認，不在尚未確認時代填。"),
        s("reset","表單動作","#resetDraft","清除未完成草稿","會清除本案未完成內容且無法由畫面復原。"),
        s("download","表單動作","#downloadWord","完成訪談並產生 Word","保存 Word 並完成離會訪談案件；正式主檔離會仍由副主席在設定頁處理。",{fact:note("下一步","查驗結案資料，再處理正式離會。")})
      ]
    }),

    "page:accountability-emails":page({
      key:"accountability-emails",
      name:"當責信待寄中心",
      roles:VP,
      title:"從正式出席資料找到需要人工寄送的信件",
      vp:"系統依已確認出席紀錄建立待寄任務與文稿，但不會自動寄信、改變會員資格或開放專業類別。",
      steps:[
        s("summary","任務概況",'[data-guide-id="accountability.summary"]',"待處理、缺資料、專業別與已寄數","完整摘要區協助判斷工作量與異常；專業別狀態只是人工查核提示。"),
        s("filters","任務清單",".toolbar","依狀態篩選","待處理、全部、已寄與暫緩篩選只改變清單顯示。"),
        s("refresh","任務清單","#refreshTasks","重新同步正式出席資料","重新讀取已確認來源，不會寄信。"),
        s("tasks","任務清單","#taskList","選擇一件待寄任務","卡片顯示會員、觸發原因、期間、風險與狀態；點選只開啟預覽。"),
        s("preview","信件預覽","#previewPanel","核對依據與收件資訊","先核對原因、期間、來源、收件人及副本；缺資料時先補齊，不猜測地址。"),
        s("copy-fields","信件預覽",'[data-guide-id="accountability.copy-fields"]',"核對並複製主旨或內文","完整區域同時框住主旨、內文與各自的複製按鈕；複製只寫入剪貼簿，不會寄信或留下已寄紀錄。"),
        s("copy-all","人工寄送","#copyAll","複製完整信件","整理收件人、副本、主旨及內文供貼到正式信箱；貼上後仍要再次核對。"),
        s("sent","人工寄送","#markSent","標記已人工寄送","只在正式信箱已實際寄出後使用；會留下狀態與時間。",{fact:note("正確順序","先寄信，再回系統標記。")}),
        s("exceptions","人工寄送",'[data-guide-id="accountability.actions"]',"暫緩、不適用與恢復","這排動作會依任務狀態顯示可用選項；暫緩或不適用時系統會要求理由，條件改變後可恢復待寄。")
      ]
    }),

    "page:message-templates":page({
      key:"message-templates",
      name:"文稿範本",
      roles:VP,
      title:"選對情境、核對動態內容，再複製使用",
      vp:"提供副主席常用正式公版與協助群文案；系統不讀案件、不自動發送，也不保存會員身分證字號。",
      steps:[
        s("usage","使用邊界",".privacy-note","範本使用方式","協助群文案會套用當屆資訊；實際使用前仍需核對對象、日期、連結與現行制度。"),
        s("categories","範本選擇","#templateSections","依用途找範本","每張卡片顯示用途、時機與版本；不要只因文字相似就套到不同流程。"),
        s("content","範本選擇","#templateSections","閱讀動態欄位與字數","副主席版文字為唯讀；資訊不完整時先回來源設定修正。"),
        s("copy","範本使用","#templateSections","複製指定段落","只寫入剪貼簿，不會開啟 Email、LINE 或建立案件。",{fact:note("使用前","貼上目的地後完整重讀一次。")})
      ]
    }),

    "page:routine-reminders":page({
      key:"routine-reminders",
      name:"LINE 常態通知",
      roles:VP,
      title:"先連好目的群組，測試後再啟用排程",
      vp:"管理交流群與委員會群的固定提醒、工作進度文稿、備援 Push 及投遞紀錄。",
      steps:[
        s("identity","通知範圍",'[data-guide-id="reminders.identity"]',"核對目前身份","完整欄位會同時顯示身份標籤與姓名；設定及發送會留痕，先確認共用帳號中選擇的姓名正確。"),
        s("targets","通知群組",'[data-guide-id="reminders.target-card"]',"確認兩個目的群連線","完整連線卡會同時顯示交流群與會員委員會群；通知類型固定對應群組，未連線時先到設定頁管理。"),
        s("weekly","排程規則",'[data-rule="weekly_meeting_alarm"]',"每週例會鬧鐘提醒","設定啟用、星期、時間與文案；測試會建立 15 分鐘回覆等待。"),
        s("monthly","排程規則",'[data-rule="monthly_data_entry"]',"月底數據 Key in 提醒","依每月最後一次例會計算日期，設定提前天數、時間、文案與測試。"),
        s("committee","排程規則",'[data-rule="monthly_committee_meeting"]',"每月委員會提醒","設定會議日前提醒；測試按鈕會實際推播到委員會群。",{fact:note("正式測試","不是只顯示預覽。")}),
        s("save","排程規則","#saveRules","保存常態通知設定","當下不立即發訊息，但已啟用的未來排程會生效。",{fact:note("啟用前","先完成連線與對應測試。")}),
        s("digest","工作進度",'[data-guide-id="reminders.digest-card"]',"預覽委員會工作進度","整張工作卡包含群組指令、資料狀態、可編輯文案、預覽與操作列；重新抓取只更新預覽，複製也不會自動發送。"),
        s("digest-send","工作進度","#sendWorkDigest","備援 Push 發送","正常優先使用群組指令免費 Reply；備援按鈕會正式發到委員會群並可能使用額度。",{fact:note("正式發送","先重新抓取並核對預覽。")}),
        s("history","投遞紀錄",'[data-guide-id="reminders.history-card"]',"查看 Reply、Push 與人工狀態","整張紀錄卡會保留標題、用途與空狀態；用最近紀錄確認等待、送達、好友備援或人工貼出，並完成必要留痕。")
      ]
    }),

    "page:useful-links":page({
      key:"useful-links",
      name:"常用連結",
      title:"從整理過的入口開啟外部工作網站",
      vp:"連結依全員共用與副主席專用分組，所有外站都在新分頁開啟。",
      committee:"你會看到委員可使用的共用外部入口；副主席專屬連結不會顯示。",
      steps:[
        s("shared","全員連結","#sharedLinks","全員可用入口","每張卡片說明目的地與情境；新分頁開啟，不會覆蓋目前工作台。"),
        s("vp","角色連結","#vpLinksSection","副主席專用入口","提供例會填報、公告查閱與職務資料；外站使用其原有帳號。",{roles:VP}),
        s("external","離開系統",".external-note","外部網站與帳密邊界","外部服務由各單位維護；工作台不讀取或保存你在外站輸入的帳密。")
      ]
    }),

    "page:system-updates":page({
      key:"system-updates",name:"系統更新",
      title:"快速找到與目前工作有關的更新",
      vp:"先看最新版本，或搜尋地基、月會等關鍵字查歷史；閱讀不會改動正式資料。",
      steps:[
        s("current","目前版本","#currentRelease","目前版本與發布日期","這裡固定顯示最新版本，不會隨搜尋或展開歷史而改變。"),
        s("read","閱讀狀態","#markReleaseRead","標記最新版本已讀","閱讀後可按此清除這個姓名在目前瀏覽器的 NEW 提示；只記錄最新版本的閱讀狀態，不會修改工作資料。"),
        s("search","查找更新","#releaseSearchForm","搜尋與清除","輸入版本、日期或關鍵字，例如地基、月會；系統會搜尋全部歷史。清除後回到最近 10 個版本。"),
        s("history","閱讀內容","#releaseNotesHistory","展開任一版本","點版本標題展開或收合。最新一版預設展開，舊紀錄保留發布當時的說明，可用來追溯變動。"),
        s("more","歷史紀錄","#releasePagination","載入更多與結果數量","每次增加最多 10 個符合搜尋的版本；全部顯示後按鈕隱藏。已顯示數量和總數會列在這裡。")
      ]
    }),

    "page:settings":page({
      key:"settings",version:"1.0.2",
      name:"系統與個人 AI 設定",
      title:"分清全員資訊、個人設定與副主席管理",
      vp:"副主席可查看名單、綁定個人 AI、處理新會員與離會、管理 LINE 群並閱讀更新；Admin 工具不納入導覽。",
      committee:"委員可核對名單、管理自己的 AI API 綁定並閱讀版本更新；副主席及 Admin 專屬區塊不會出現。",
      steps:[
        s("roles","當屆人員",".roles-card","三層權限說明","此區只說明分工，不是切換角色或提升權限的控制。"),
        s("vp","當屆人員",'[data-guide-id="settings.vp-card"]',"現任副主席","整張任期卡會顯示目前副主席與名單管理邊界；日常使用者不能在此直接改名。"),
        s("committee","當屆人員",'[data-guide-id="settings.committee-card"]',"現任會員委員名單","整張名單卡會顯示可使用共用委員帳號的人員與歷史保留規則；名單變動不會改寫舊案件。"),
        s("ai-owner","個人 AI",'[data-guide-id="settings.ai-overview"]',"確認 AI 設定所屬姓名","這個摘要區同時顯示預設平台、目前綁定身份與保存狀態；所有金鑰只屬於目前登入姓名。"),
        s("ai-default","個人 AI",'[data-guide-id="settings.default-provider"]',"選擇預設平台","完整欄位會顯示用途與目前選項；它決定制度查詢與月度審閱預設使用哪家，支援頁面仍可單次切換。"),
        s("ai-providers","個人 AI",'[data-guide-id="settings.provider-grid"]',"綁定 GPT、Gemini 或 Claude","完整平台區會同時顯示三家服務、金鑰欄位、狀態與移除入口；把官方建立的 Key 貼到對應欄位，保存後只回傳狀態與末四碼。",{fact:note("安全","不要把 API Key 放入公告、案件、聊天或截圖。")}),
        s("ai-remove","個人 AI",'[data-guide-id="settings.provider-grid"]',"移除任一平台綁定","在對應平台卡片使用移除綁定，只會停用該平台的 Key，不影響其他平台或業務資料。"),
        s("ai-save","個人 AI","#saveAiSettings","儲存我的 AI 設定","按下後才將新 Key 送到後端加密保存，且只更新目前姓名。",{fact:note("資料影響","導覽不讀取或測試真實金鑰。")}),
        s("ai-guide","個人 AI",".ai-guide-card","官方 API Key 申請教學","展開三家步驟並前往官方頁面；網頁訂閱與 API 額度通常分開。"),
        s("new-member","副主席管理","#newMemberRegistrationCard","加入正式點名名單","只選已核准結案案件，核對姓名、專業、日期及確認姓名後寫入正式名單。",{roles:VP,fact:note("正式名單","只處理已核准的新會員。")}),
        s("departure","副主席管理","#departureCard","正式登記離會","核對會員、日期、備註和確認姓名；完成後會同步主檔及分析排除。",{roles:VP,fact:note("高影響","先完成訪談及必要行政確認。")}),
        s("departure-history","副主席管理","#toggleDepartureHistory","查看離會歷史","只展開完整紀錄，不會恢復會員或改變分析。",{roles:VP}),
        s("line","副主席管理","#lineBotGroups","LINE Bot 與目的群","核對兩個 Bot 以及出席、委員會、三長與交流群用途所對應的群組。",{roles:VP}),
        s("release","系統資訊","#releaseNotes","系統版本與更新","查看目前版本與日期；按「查看更新紀錄」進入獨立頁，可搜尋並展開歷史版本。")
      ]
    }),

    "page:course":{
      id:"page:course",
      version:"1.0.4",
      title:"副主席交接教學操作導覽",
      page:"交接與學習",
      roles:VP,
      intro:intros("交接與學習","使用新版交接教學","這裡介紹工作心智圖、目錄、搜尋與閱讀紀錄；完整職務內容請進入對應主題閱讀。"),
      steps:[
        s("menu","系統功能","#openMenu","開啟系統主選單","窄螢幕上展開與工作台相同的主選單。",{viewports:["mobile"]}),
        s("nav","教學導覽",".course-tools","章節目錄與心智圖","展開章節目錄可直接選主題；工作心智圖帶你回到七組工作全貌。"),
        s("progress","閱讀紀錄",'[data-guide-id="course.progress"]',"查看已讀主題","章節下方可標記已讀或未讀；數字只表示此瀏覽器的閱讀紀錄。"),
        s("search","查找內容",".guide-surface .search-wrap","直接查工作與判斷方式","輸入 321A、GROW、續約或其他關鍵字，點搜尋結果直接進入相關小節。"),
        s("map","工作全貌",".work-map","逐層展開工作心智圖","點主幹展開一組工作，再點工作名稱閱讀完整內容；小節捷徑可直達重點。"),
        s("reading","章節閱讀",".guide-surface [data-chapter]:not([hidden])","閱讀完整步驟與參考稿","依本頁目錄跳轉小節，頁尾切換上一主題、下一主題或標記已讀。")
      ]
    }
  });
})(window);
