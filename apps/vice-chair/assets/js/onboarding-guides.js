(function(global){
  "use strict";

  const VERSION="1.0.0";
  const EVERYONE=["vp","committee"];
  const VP_ONLY=["vp"];

  const guides={
    "role-transition:vp":{
      id:"role-transition:vp",
      version:VERSION,
      title:"副主席角色差異導覽",
      page:"換屆角色更新",
      roles:["vp"],
      intro:{
        vp:{
          eyebrow:"換屆更新・副主席差異導覽",
          title:"你現在以副主席身份使用工作台",
          description:"你看過的共同功能會沿用完成紀錄，不必從頭再看。這段只介紹副主席新增的全體案件、期限、通知、每月資料與交接管理入口。",
          action:"查看角色差異"
        }
      },
      steps:[
        {id:"identity",section:"角色確認",target:'[data-guide-id="global.sidebar-identity"]',title:"身份已切換為副主席",body:"這裡會顯示目前姓名與副主席身份。原本看過的案件、出席、月會等共同頁面不會重新教學；副主席專屬管理頁面則會在首次進入時個別說明。",fact:{label:"換屆規則",text:"同一角色續任不重播；角色改變只看差異。"},reveal:"sidebar"},
        {id:"all-work",section:"全體工作",target:'[data-guide-id="home.filter-pending"]',title:"查看全體待處理工作",body:"副主席可從首頁查看全體尚待處理的案件，不只限於自己負責的項目。切換篩選只改變清單顯示，不會修改案件。"},
        {id:"due-work",section:"全體工作",target:'[data-guide-id="home.filter-due"]',title:"優先掌握期限與逾期",body:"利用「3 日內／逾期」快速安排全體工作的處理順序。這是副主席的整體視角，不代表系統已替任何案件做出處置。"},
        {id:"reminders",section:"副主席管理",target:'[data-guide-id="nav.reminders"]',title:"管理常態通知",body:"副主席能設定固定通知與查看投遞結果。進入頁面不會發送訊息，正式發送仍有清楚的確認步驟。",reveal:"sidebar"},
        {id:"accountability",section:"副主席管理",target:'[data-guide-id="nav.accountability"]',title:"處理待寄當責信",body:"符合提醒條件的當責信會集中在這裡，供你檢查、複製與留下寄送紀錄；導覽不會替你寄出任何信件。",reveal:"sidebar"},
        {id:"monthly-data",section:"資料管理",target:'[data-guide-id="home.monthly-data"]',title:"追蹤每月資料更新",body:"副主席首頁會多出每月資料檢查區，協助確認分析所需資料是否齊全。區塊只呈現狀態，不會自行覆寫報表。"},
        {id:"vp-course",section:"交接與學習",target:'[data-guide-id="nav.vp-course"]',title:"使用副主席交接課程",body:"角色制度與判斷仍由副主席交接課程說明；它和目前這份系統操作差異導覽分開保存。",reveal:"sidebar"}
      ]
    },
    "role-transition:committee":{
      id:"role-transition:committee",
      version:VERSION,
      title:"會員委員角色差異導覽",
      page:"換屆角色更新",
      roles:["committee"],
      intro:{
        committee:{
          eyebrow:"換屆更新・會員委員差異導覽",
          title:"你現在以會員委員身份使用工作台",
          description:"你看過的共同功能會沿用完成紀錄，不必從頭再看。這段只介紹會員委員的個人待辦、負責案件與分會關注視角；副主席管理入口會依權限隱藏。",
          action:"查看角色差異"
        }
      },
      steps:[
        {id:"identity",section:"角色確認",target:'[data-guide-id="global.sidebar-identity"]',title:"身份已切換為會員委員",body:"這裡會顯示目前姓名與會員委員身份。副主席專屬的通知、當責信及全體管理入口已依權限隱藏，共同工作頁仍沿用你原本的完成紀錄。",fact:{label:"換屆規則",text:"同一角色續任不重播；角色改變只看差異。"},reveal:"sidebar"},
        {id:"mine",section:"個人工作",target:'[data-guide-id="home.filter-mine"]',title:"先看自己的待辦",body:"這裡只整理需要目前登入姓名回饋、投票或處理的項目。共用帳號下，正式操作前請先確認登入姓名正確。"},
        {id:"assigned",section:"個人工作",target:'[data-guide-id="home.filter-assigned"]',title:"查看你負責的案件",body:"這個會員委員專屬篩選會列出你擔任主責或陪訪的進行中案件，即使當下尚未產生待辦也能持續追蹤。"},
        {id:"team",section:"共同進度",target:'[data-guide-id="home.filter-team"]',title:"掌握分會共同關注",body:"需要了解團隊整體進度時，可切換到分會關注；這只改變畫面篩選，不會更動負責人或案件狀態。"}
      ]
    },
    "global-shell":{
      id:"global-shell",
      version:VERSION,
      title:"認識你的富聯工作區",
      page:"全站操作",
      roles:EVERYONE,
      intro:{
        vp:{
          eyebrow:"副主席版・系統操作導覽",
          title:"歡迎使用富聯會員委員會工作台",
          description:"先認識日常管理的工作入口、通知與身份區；完成後會直接回到可操作的首頁。各頁的細部導覽會在首次進入時個別說明，不會重複制度課程。"
        },
        committee:{
          eyebrow:"會員委員版・系統操作導覽",
          title:"歡迎使用富聯會員委員會工作台",
          description:"先認識與你工作相關的案件、訪談、投票、點名與月會入口；完成後會直接回到可操作的首頁。各頁會另有細部導覽，副主席專屬功能不會出現在你的教學中。"
        }
      },
      steps:[
        {id:"brand",section:"工作區",target:'[data-guide-id="global.brand"]',title:"富聯會員委員會工作台",body:"這是富聯分會會員委員會的單一工作入口。案件、訪談、點名、月會與會員關懷都從這裡進入，不需要在多份檔案間來回尋找。",fact:{label:"你現在的位置",text:"畫面左上角會一直顯示工作台名稱，協助確認目前所在系統。"},reveal:"sidebar"},
        {id:"mobile-menu",section:"工作區",target:'[data-guide-id="global.mobile-menu"]',title:"手機版主選單",body:"在手機或窄螢幕上，按這裡展開左側工作選單；選完功能後選單會自動收合。",viewports:["mobile"]},
        {id:"sidebar",section:"主選單",target:'[data-guide-id="global.sidebar"]',title:"依工作目的排列的功能列",body:"上半部是日常案件與會務，下半部是資源、學習與設定。導覽只會帶你看目前角色真正能使用的入口。",reveal:"sidebar"},
        {id:"home",section:"主選單",target:'[data-guide-id="nav.home"]',title:"工作總覽",body:"回到首頁查看本月待辦、期限、公告、會員狀態與優先案件。完成其他操作後，也能從這裡回到整體工作脈絡。",fact:{label:"按下後",text:"前往工作總覽，不會修改任何資料。"},reveal:"sidebar"},
        {id:"cases",section:"主選單",target:'[data-guide-id="nav.cases"]',title:"進行中案件",body:"集中查看新會員、期中輔導、續約、轉換行業別與離會等進行中案件，也能依階段找到下一個需要完成的動作。",fact:{label:"按下後",text:"前往案件中心，不會直接建立或變更案件。"},reveal:"sidebar"},
        {id:"interviews",section:"訪談入口",target:'[data-guide-id="nav.interviews"]',title:"訪談與輔導",body:"展開後可以直接選擇要建立的訪談類型。這個入口是快速分類，不會在展開時建立案件。",fact:{label:"使用方式",text:"按一下展開或收合，再選擇正確的訪談類型。"},reveal:"sidebar"},
        {id:"interview-new",section:"訪談入口",target:'[data-guide-id="nav.interview-new"]',title:"新會員訪談",body:"準備新會員訪談時由此進入，系統會先帶到案件建立流程，再依案件連結正式訪談表單。",fact:{label:"按下後",text:"開啟新會員案件建立畫面，尚不會送出資料。"},reveal:"sidebar"},
        {id:"interview-industry",section:"訪談入口",target:'[data-guide-id="nav.interview-industry"]',title:"轉換行業別訪談",body:"會員申請轉換代表行業別時，由此建立對應案件，後續訪談、回饋與投票會保留在同一案件脈絡。",fact:{label:"按下後",text:"開啟轉換行業別案件建立畫面。"},reveal:"sidebar"},
        {id:"interview-midterm",section:"訪談入口",target:'[data-guide-id="nav.interview-midterm"]',title:"期中輔導（GROW）",body:"需要進行會員期中關懷與 GROW 訪談時由此進入。完成的訪談 Word 會回到案件內保存。",fact:{label:"按下後",text:"開啟期中輔導案件建立畫面。"},reveal:"sidebar"},
        {id:"interview-renewal",section:"訪談入口",target:'[data-guide-id="nav.interview-renewal"]',title:"終期輔導（續約）",body:"會員進入續約作業期時，由此建立終期輔導案件，後續可一路追蹤訪談、委員回饋、投票與確認。",fact:{label:"按下後",text:"開啟續約案件建立畫面。"},reveal:"sidebar"},
        {id:"interview-departure",section:"訪談入口",target:'[data-guide-id="nav.interview-departure"]',title:"離會訪談",body:"需要記錄離會訪談時由此建立案件。這裡只是流程入口，不等同正式完成會員離會登記。",fact:{label:"注意",text:"會員主檔的正式離會仍由具權限者在設定頁確認。"},reveal:"sidebar"},
        {id:"vote",section:"主選單",target:'[data-guide-id="nav.vote"]',title:"投票與決議",body:"直接前往案件中心的待投票區，查看目前需要你回饋或投票的案件；右側數字代表目前待處理數量。",fact:{label:"按下後",text:"只會開啟待投票清單，不會替你投票。"},reveal:"sidebar"},
        {id:"attendance",section:"主選單",target:'[data-guide-id="nav.attendance"]',title:"出席與紀律",body:"進入每週例會點名與出席紀錄。可查看代理、遲到、缺席等狀態；正式保存與公告會在頁面內另外確認。",reveal:"sidebar"},
        {id:"reminders",section:"主選單",target:'[data-guide-id="nav.reminders"]',title:"常態通知",body:"管理會員委員會群的固定通知與發送排程，也能查看投遞結果。這是副主席管理入口，實際發送前仍有頁面內確認。",roles:VP_ONLY,fact:{label:"資料影響",text:"進入頁面不會發送訊息；按下正式發送功能才會影響群組。"},reveal:"sidebar"},
        {id:"monthly-meeting",section:"主選單",target:'[data-guide-id="nav.monthly-meeting"]',title:"會員委員會月會",body:"準備與保存每月會員委員會會議資料，包含出席、關懷、續約與工作分工；歷史月會也從同一頁查閱。",reveal:"sidebar"},
        {id:"member-care",section:"主選單",target:'[data-guide-id="nav.member-care"]',title:"會員關懷儀表板",body:"查看分析核心同步的會員燈號、趨勢與關懷提示，再從需要關注的項目安排後續工作。系統只呈現分析結果，不會在此重算規則。",reveal:"sidebar"},
        {id:"resources",section:"資源與管理",target:'[data-guide-id="nav.resources"]',title:"常用資源",body:"展開常用文稿與外部連結。副主席會看到待寄當責信及文稿範本；會員委員只會看到其角色可用的連結。",fact:{label:"權限",text:"不同角色看到的子項目不同。"},reveal:"sidebar"},
        {id:"accountability",section:"資源與管理",target:'[data-guide-id="nav.accountability"]',title:"當責信待寄",body:"集中檢查符合提醒條件但尚未人工寄送的當責信，能複製文案、開啟 Email 並留下寄送紀錄。",roles:VP_ONLY,fact:{label:"注意",text:"進入清單不會寄信，正式寄送仍由你人工確認。"},reveal:"sidebar"},
        {id:"templates",section:"資源與管理",target:'[data-guide-id="nav.templates"]',title:"文稿範本",body:"依情境取得已整理的通知文稿，系統會套用可取得的當屆資訊；複製前仍應檢查收件人與內容。",roles:VP_ONLY,reveal:"sidebar"},
        {id:"links",section:"資源與管理",target:'[data-guide-id="nav.links"]',title:"常用連結",body:"集中開啟工作會用到的外部網站。連結會依角色整理；離開系統前會清楚標示目的地。",reveal:"sidebar"},
        {id:"learning",section:"資源與管理",target:'[data-guide-id="nav.learning"]',title:"交接與學習",body:"這個區域放的是職務制度教材，與你正在看的「系統操作導覽」分開。操作導覽教你怎麼用畫面，制度課程則教副主席如何判斷與交接。",fact:{label:"兩者差異",text:"完成進度彼此獨立，不會互相覆蓋。"},reveal:"sidebar"},
        {id:"vp-course",section:"資源與管理",target:'[data-guide-id="nav.vp-course"]',title:"副主席交接教學",body:"進入副主席制度課程，依章節學習角色責任與業務規則。這不是系統按鈕教學，日常不必每次重看。",roles:VP_ONLY,reveal:"sidebar"},
        {id:"settings",section:"資源與管理",target:'[data-guide-id="nav.settings"]',title:"系統與個人 AI",body:"管理你自己的 AI 平台連線與系統設定。只有符合角色權限的管理區塊會顯示；任何密碼或 API Key 都不會出現在導覽文字中。",reveal:"sidebar"},
        {id:"identity",section:"身份與安全",target:'[data-guide-id="global.sidebar-identity"]',title:"確認目前登入身份",body:"共用帳號登入後，這裡會顯示你選擇的姓名與目前角色。進行回饋、投票或紀錄前，先確認身份正確。",reveal:"sidebar"},
        {id:"logout",section:"身份與安全",target:'[data-guide-id="global.logout"]',title:"安全登出",body:"工作完成或使用共用裝置時，請由這裡登出。登出會結束目前工作階段，但不會刪除已正式保存的資料。",reveal:"sidebar"},
        {id:"page-heading",section:"頁首工具",target:'[data-guide-id="global.page-heading"]',title:"目前頁面",body:"頁首會顯示現在所在的工作區。進入案件或表單後，也可用這裡快速確認自己是否在正確頁面。"},
        {id:"release",section:"頁首工具",target:'[data-guide-id="global.release"]',title:"版本更新",body:"有新功能或重要修正時會顯示 NEW。按下可閱讀本次更新內容；確認已讀只會記錄提示狀態，不會改變案件資料。"},
        {id:"top-identity",section:"頁首工具",target:'[data-guide-id="global.top-identity"]',title:"登入姓名與角色",body:"頁首再次顯示目前姓名與角色，特別適合在共用帳號環境中於正式操作前快速核對。",viewports:["desktop"]},
        {id:"notifications",section:"頁首工具",target:'[data-guide-id="global.notifications"]',title:"提醒中心",body:"紅色數字代表尚未讀取的工作提醒。開啟後可直接前往對應頁面；單純查看不會完成案件或替你執行工作。",fact:{label:"使用時機",text:"每天開始工作時先檢查一次。"}},
        {id:"notification-panel",section:"頁首工具",target:'[data-guide-id="global.notification-panel"]',title:"查看與整理提醒",body:"提醒依時間列在這裡，點選項目會前往相關工作。「全部已讀」只清除未讀標記，不等於工作已完成。",fact:{label:"資料影響",text:"全部已讀會更新提醒狀態，但不會修改案件階段。"},reveal:"notifications"},
        {id:"guide-help",section:"頁首工具",target:'[data-guide-id="global.guide-help"]',title:"操作教學",body:"之後需要複習時，隨時按這裡重看本頁導覽、繼續中斷進度或重新認識全站。制度課程仍保留在左側「交接與學習」。",fact:{label:"完成後",text:"這個入口會一直保留，不必等系統再次自動提示。"}}
      ]
    },
    "page:index":{
      id:"page:index",
      version:VERSION,
      title:"工作總覽完整導覽",
      page:"工作總覽",
      roles:EVERYONE,
      intro:{
        vp:{eyebrow:"副主席版・首頁導覽",title:"掌握全體工作，再決定先做什麼",description:"首頁把本月期限、公告、會員狀態、優先案件、資料更新與制度查詢集中在同一個決策畫面。"},
        committee:{eyebrow:"會員委員版・首頁導覽",title:"掌握自己的工作與共同進度",description:"首頁會整理與你相關的待辦、公告、會員狀態與優先案件；副主席管理區塊不會出現在這段導覽。"}
      },
      steps:[
        {id:"hero",section:"本月摘要",target:'[data-guide-id="home.month-hero"]',title:"本月會員狀態與工作規劃",body:"首頁先用本月視角整理需要注意的工作。標題與月份會依系統日期自動更新，不是寫死的示範文字。",fact:{label:"閱讀方式",text:"先看右側三個數字，再往下處理優先案件。"}},
        {id:"hero-summary",section:"本月摘要",target:'[data-guide-id="home.hero-summary"]',title:"待完成、即將到期與已完成",body:"三個數字分別回答目前還有多少工作、近期最急的是哪些，以及本月已完成多少。它們是工作導航，不是會員評分。"},
        {id:"announcement-compose",section:"公告欄",target:'[data-guide-id="home.announcement-compose"]',title:"撰寫團隊公告",body:"副主席與會員委員都能在這裡留下提醒或交接資訊。輸入中的文字只留在畫面上，尚未按下發布前不會給其他人看到。",fact:{label:"建議",text:"內容保持工作相關，避免放入不必要的會員敏感資訊。"}},
        {id:"announcement-publish",section:"公告欄",target:'[data-guide-id="home.announcement-publish"]',title:"發布留言",body:"按下後會以目前登入姓名發布到全員公告欄。導覽不會替你按下；正式發布前請再次確認內容與身份。",fact:{label:"資料影響",text:"會建立一則所有工作台使用者都能看到的公告。"}},
        {id:"announcement-list",section:"公告欄",target:'[data-guide-id="home.announcement-list"]',title:"閱讀已發布公告",body:"最新公告會顯示在這裡，包含發布者與時間。若目前沒有內容，系統會保留清楚的空狀態。"},
        {id:"status",section:"會員狀態",target:'[data-guide-id="home.member-status"]',title:"最新會員狀態",body:"這裡快速呈現分析核心同步的會員燈號分布與本月關注摘要，適合先辨認整體趨勢，不取代完整關懷診斷。",fact:{label:"資料來源",text:"數字來自 BNI 分析核心；工作台不自行重算燈號。"}},
        {id:"member-dashboard",section:"會員狀態",target:'[data-guide-id="home.member-dashboard"]',title:"查看完整儀表板",body:"需要查看個別會員趨勢與診斷時，由這裡前往會員關懷儀表板。按下只會切換頁面，不會建立關懷案件。"},
        {id:"metrics",section:"會員狀態",target:'[data-guide-id="home.metrics"]',title:"四項會員與案件概況",body:"依序顯示目前會員、本月續約案件、新會員申請與關懷進行中。每張卡片下方會補充資料來源或目前狀態。"},
        {id:"priority",section:"優先工作",target:'[data-guide-id="home.priority-cases"]',title:"優先處理案件",body:"系統把新指派、待回饋、待投票與接近期限的案件整理到首頁，讓你不用逐頁尋找下一步。"},
        {id:"filter-pending",section:"優先工作",target:'[data-guide-id="home.filter-pending"]',title:"全體待處理",body:"顯示目前所有仍需要動作的項目。數字會隨案件進度更新；切換篩選只改變清單顯示，不會修改案件。",roles:VP_ONLY},
        {id:"filter-mine",section:"優先工作",target:'[data-guide-id="home.filter-mine"]',title:"我的待辦",body:"只看明確需要目前登入姓名處理、回饋或投票的項目。共用帳號下請先確認頁首姓名正確。"},
        {id:"filter-due",section:"優先工作",target:'[data-guide-id="home.filter-due"]',title:"3 日內／逾期",body:"聚焦即將到期或已超過期限的工作，適合安排當天處理順序。這是期限篩選，不代表系統已作成任何處置。",roles:VP_ONLY},
        {id:"filter-assigned",section:"優先工作",target:'[data-guide-id="home.filter-assigned"]',title:"我負責的案件",body:"查看你擔任主責或陪訪、但此刻未必有待回饋或待投票動作的進行中案件。切換篩選不會改變指派。",roles:["committee"]},
        {id:"filter-team",section:"優先工作",target:'[data-guide-id="home.filter-team"]',title:"分會關注",body:"查看你目前沒有個人待辦、但會員委員會仍在共同追蹤的案件，掌握團隊整體進度。",roles:["committee"]},
        {id:"filter-handover",section:"優先工作",target:'[data-guide-id="home.filter-handover"]',title:"換屆待指派",body:"只有換屆後仍有工作包含卸任或轉任人員時才會出現。由此集中找出需要重新指定接手人的項目。",roles:VP_ONLY},
        {id:"case-table",section:"優先工作",target:'[data-guide-id="home.case-table"]',title:"從案件列直接進入下一步",body:"每列依序顯示案件、目前階段或你的動作、負責人、時程與下一步。最右側操作會帶到相應頁面，不會在首頁直接代你送出。"},
        {id:"schedule",section:"優先工作",target:'[data-guide-id="home.schedule-work"]',title:"排定新工作",body:"需要主動建立或安排工作時由此進入案件中心。真正建立案件前仍會填寫類型、會員、負責人與期限。"},
        {id:"monthly-data",section:"副主席管理",target:'[data-guide-id="home.monthly-data"]',title:"每月資料更新",body:"月初檢查分析所需的資料檔是否齊全，並顯示本期完成比例。只有副主席會在首頁看到這個管理區塊。",roles:VP_ONLY,fact:{label:"資料影響",text:"區塊本身只顯示檢查結果；上傳與入檔會另有明確流程。"}},
        {id:"monthly-refresh",section:"副主席管理",target:'[data-guide-id="home.monthly-refresh"]',title:"重新檢查",body:"資料剛完成更新但畫面尚未反映時，按這裡重新向系統檢查目前狀態；它不會刪除既有報表。",roles:VP_ONLY},
        {id:"learning",section:"副主席工具",target:'[data-guide-id="home.learning"]',title:"交接與學習",body:"顯示副主席制度課程的閱讀進度，讓你從上次位置繼續。這個課程與目前的系統操作導覽分開保存。",roles:VP_ONLY},
        {id:"learning-link",section:"副主席工具",target:'[data-guide-id="home.learning-link"]',title:"繼續新任副主席課程",body:"按下後前往制度與職務交接教材。它教的是角色判斷與工作脈絡，不是本頁按鈕使用方式。",roles:VP_ONLY},
        {id:"ai-launcher",section:"制度查詢",target:'[data-guide-id="home.ai-launcher"]',title:"富聯 AI 助手",body:"需要快速查找系統內已有的制度與流程時，可展開 AI 助手。它只依核准的制度資料回答，不能替代中心區正式解釋或人工決議。",fact:{label:"費用提醒",text:"真正送出問題時，才會使用你個人綁定平台的 API 額度。"}},
        {id:"ai-panel",section:"制度查詢",target:'[data-guide-id="home.ai-panel"]',title:"在同一頁完成制度查詢",body:"對話區會保留本次登入工作階段的上下文，並在回答中顯示資料來源。收合面板不會刪除當次對話。",reveal:"ai"},
        {id:"ai-provider",section:"制度查詢",target:'[data-guide-id="home.ai-provider"]',title:"選擇個人 AI 平台",body:"如果你已連結多個平台，可在送出前選擇本次使用哪一個。管理 API Key 會前往個人設定，導覽不會顯示或讀取完整金鑰。",reveal:"ai"},
        {id:"ai-suggestions",section:"制度查詢",target:'[data-guide-id="home.ai-suggestions"]',title:"從常見問題開始",body:"這些按鈕會把常見制度問題帶入查詢流程，適合第一次使用時參考；送出前仍可改寫問題。",reveal:"ai"},
        {id:"ai-form",section:"制度查詢",target:'[data-guide-id="home.ai-form"]',title:"輸入並送出問題",body:"輸入具體情境後送出。系統會先查找白名單制度文件；找不到依據時不應呼叫外部 AI，也不會自行編造答案。",fact:{label:"資料影響",text:"按下送出才會使用個人 API 額度；這段導覽不會代按。"},reveal:"ai"}
      ]
    }
  };

  function getGuide(id,role){
    const source=guides[id];
    if(!source||!source.roles.includes(role))return null;
    const mobile=global.matchMedia?.("(max-width: 800px)").matches;
    const viewport=mobile?"mobile":"desktop";
    const steps=source.steps.filter(step=>(!step.roles||step.roles.includes(role))&&(!step.viewports||step.viewports.includes(viewport)));
    return{
      id:source.id,
      version:source.version,
      title:source.title,
      page:source.page,
      intro:source.intro[role]||source.intro.vp||source.intro.committee,
      steps,
      sections:new Set(steps.map(step=>step.section)).size
    };
  }

  function listGuides(role){
    return Object.keys(guides).map(id=>getGuide(id,role)).filter(Boolean);
  }

  function registerGuides(collection){
    Object.entries(collection||{}).forEach(([id,guide])=>{
      if(!id||!guide||typeof guide!=="object")return;
      guides[id]={...guide,id:guide.id||id,version:guide.version||VERSION};
    });
    return Object.keys(collection||{});
  }

  global.FulianOnboardingGuides=Object.freeze({VERSION,getGuide,listGuides,registerGuides});
})(window);
