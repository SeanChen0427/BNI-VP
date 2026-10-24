(function(root){
  const domain=root.FulianInterviewTemplateDomain,form=domain.MEMBERSHIP;
  const input=(id,label,type="text")=>`<label>${label}<input id="${id}" type="${type}" data-save></label>`;
  const narrative=(id,label="訪談紀錄")=>`<label class="long-field">${label}<textarea id="${id}" rows="5" data-save></textarea></label>`;
  const check=(id,label="已了解")=>`<div class="choice-row"><label><input id="${id}" type="checkbox" data-save>${label}</label></div>`;
  const yesNo=id=>`<div class="choice-row">${[["yes","是"],["no","否"]].map(([value,label])=>`<label><input type="radio" name="${id}" value="${value}" data-save>${label}</label>`).join("")}</div>`;
  const question=(no,title,body)=>`<article class="question"><div class="question-head"><span>${no}.</span><h3>${title}</h3></div>${body}</article>`;
  const section=(id,letter,title,body)=>`<section class="form-card" id="${id}"><div class="section-head"><span>${letter}</span><div><h2>${title}</h2></div></div>${body}</section>`;
  const employment=(id,years)=>`<div class="fields two"><label>投入型態<select id="${id}" data-save><option value="">請選擇</option><option>全職</option><option>兼職</option></select></label>${input(years,"從業年資","number")}</div>`;
  const multi=(group,options,other)=>`<div class="choice-row">${options.map((label,i)=>`<label><input type="checkbox" id="${group}Option${i+1}" data-save>${label}</label>`).join("")}<label><input type="checkbox" id="${group}OtherSelected" data-save>其他</label></div>${input(other,"其他說明")}`;
  const relation=id=>`<label>與申請者關係<select id="${id}" data-save><option value="">請選擇</option>${["伴侶","親友","同事","合作夥伴","客戶","供應商","其他"].map(x=>`<option>${x}</option>`).join("")}</select><input id="${id}Other" class="relation-other" placeholder="請填寫其他關係" data-save hidden></label>`;
  function signatures(rights=false){
    const keys=rights?["rightsApplicantSignature","rightsSignatureDate","rightsWitness1","rightsWitness2","rightsWitness3"]:["applicantSignature","signatureDate","witness1","witness2","witness3"];
    return `<div class="fields two signature-fields" id="${rights?"rightsSignatures":"signatures"}">${input(keys[0],"申請人簽名欄姓名")}${input(keys[1],"確認日期","date")}${input(keys[2],"訪談者簽名欄姓名（主訪）")}${input(keys[3],"訪談者簽名欄姓名（陪訪）")}${input(keys[4],"訪談者簽名欄姓名（第二陪訪）")}</div><p>姓名填入原公版簽名欄；正式簽署依中心區接受方式辦理。</p>`;
  }
  const organizationStatement="倘經會員委員會查證確認您係參與其他組織且與本會有性質相近，但情況足以削弱您對本會應盡義務與投入，本會將嚴正義務與投入，本會將依相關規定立即啟動會籍檢討程序，並保留終止會籍之權利。";
  const policyFour="任何個人會員均不得加入另一家分會，也不得加入只允許一個行業之代表，而主要目的在於互相引薦業務的其他組織，因為此舉將大幅削弱其對分會會員所承擔的義務。會員委員會必須強制實施該政策。";
  function render(target){
    target.innerHTML=`<div id="membershipVersionNotice" class="rule-guide" hidden>此案件有舊版草稿。共通的專業敘述及商務名單可接續使用；新增題目、制度確認與第二份簽名須重新填寫。原草稿其餘欄位仍保存在案件中。</div>`+
    section("professional","A","專業與事業基礎",
      question(1,"【專業說明】請說明您目前主要從事的業務、產品與服務內容。",narrative("businessContent"))+
      question(2,"【專業優勢】您認為自己與同業最大的不同是什麼？",narrative("advantages"))+
      question(3,"【從業經驗】所申請的專業類別是：",employment("employmentType","experienceYears")+input("teamSize","公司目前團隊人數","number"))+
      question(4,"【代表案例】請分享一個您印象深刻的成功案例。",narrative("successStories")))+
    section("goals","B","加入BNI動機與事業企圖",
      question(5,"【加入BNI原因】您希望透過BNI獲得哪些成長與機會？",multi("join",form.joinOptions,"joinReasonOther"))+
      question(6,"【事業目標】未來一年，您最希望突破的是什麼？",multi("goal",form.goalOptions,"annualGoalOther")+narrative("annualBreakthrough","請簡單說明"))+
      question(7,"【事業成長企圖】您是否有計畫持續擴大自己的事業？",yesNo("growthPlan")+narrative("growthVision","若有，您希望未來事業成長成什麼樣子？"))+
      question(8,"【三年願景】您希望未來三年，自己的事業狀態變成什麼樣子？",narrative("threeYearVision")))+
    section("cooperation","C","合作與市場思維",
      question(9,"【目標客戶】你主要的目標市場有哪些？",narrative("targetMarkets"))+
      question(10,"你跟哪些專業可以合作？",narrative("cooperationIndustries"))+
      question(11,"【商務合作認知】您認為商務合作最重要的是什麼？",multi("cooperation",form.cooperationOptions,"cooperationOther")))+
    section("commitment","D","文化與參與認知",
      question(12,"【參與投入】BNI是一個高度互動的平台。您是否願意固定投入時間：",`<p>＊參與例會 ＊一對一交流 ＊商務互動 ＊培訓學習 ＊邀請來賓</p>${yesNo("participation")}`)+
      question(13,"【學習成長意願】您是否願意持續學習：",`<p>＊商務表達 ＊引薦能力 ＊人脈經營 ＊商業合作能力，並透過系統提升自己的事業？</p>${yesNo("learning")}`)+
      question(14,"【付出者收穫文化】BNI重視「付出者收穫」。您是否願意：",`<p>＊主動幫助他人 ＊分享資源 ＊建立合作機會</p>${yesNo("giving")}`)+
      question(15,"【來賓文化】您是否願意持續邀請：",`<p>＊合作夥伴 ＊上下游廠商 ＊優質企業主，參與分會交流？</p>${yesNo("visitorCulture")}`))+
    section("expectations","E","會員期望值管理",
      question(16,"【人脈建立】",`<p>信任是需要時間的，並非加入立即有明顯結果，您是否了解？</p>${check("trustUnderstood")}`)+
      question(17,"【會員成功認知】本人理解：",`<p>BNI提供的是：商務平台、人脈環境、合作機會、學習系統；而成果仍需透過持續參與、主動互動、關係建立、行動力，共同累積形成。</p>${check("successUnderstood")}`)+
      question(18,"【會員參與認知】BNI是一個高度互動的平台。",`<p>會員參與度越高，通常越容易被看見、被認識、被建立信任，進而增加合作與轉介紹機會。</p>${check("engagementUnderstood")}`)+signatures())+
    section("contacts","F","商務名單",
      `<p>21.【商務名單】請提供您目前熟識之商務人脈：</p><div class="contact-head"><p>請填姓名、行業別及關係。</p><strong id="contactCount">已填 0／20 位</strong></div><div class="contact-table membership-contacts"><div class="contact-row contact-title"><b>編號</b><b>姓名</b><b>行業別</b><b>關係</b></div><div id="contactRows">${Array.from({length:20},(_,i)=>`<div class="contact-row"><span>${i+1}</span>${["contactName","contactIndustry","contactRelation"].map((key,j)=>`<input id="${key}${i+1}" aria-label="第${i+1}位${["姓名","行業別","關係"][j]}" data-save>`).join("")}</div>`).join("")}</div></div>`)+
    section("training","確認","會員制度與權益確認書",`<p>本人已了解並願意遵守以下BNI相關制度：</p>`+
      question(1,"【專業類別制度】",`<p>BNI每個專業類別以一位代表為原則。會員資格不得轉讓，轉換專業類別須依規定辦理。</p>${check("rightsCategory")}`)+
      question(2,"【專業資格確認】",`<p>本人目前確實從事所申請之專業類別。</p>${employment("rightsEmploymentType","rightsExperienceYears")}${check("rightsQualification","已確認")}`)+
      question(3,"你是否有參加其他的社團、協會或組織？",input("rightsOrganizationName","如果是，請說明是哪一個會")+`<p>本會對此事高度重視，請您務必據實填寫與回覆。</p><p>${organizationStatement}</p><div class="policy-box">為維護 BNI 分會運作精神與成效，請確認並理解：<br>BNI 總政策四：「${policyFour}」</div>${yesNo("rightsOrganization")}${check("rightsPolicyFour")}`)+
      question(4,"【MSP培訓制度】",`<p>本人願意於宣誓後，最近兩次MSP(上)及最近兩次MSP(下)課程內完成各一次。</p><div class="training-links"><a href="https://bnikaohsiung.com.tw/zh-TW/events" target="_blank" rel="noopener">查詢中心區培訓時間 ↗</a><a href="https://www.bnitraining.com/html/memberLogin" target="_blank" rel="noopener">前往培訓報名網站 ↗</a></div><div class="fields two">${input("mspUpDate","MSP（上）第一場日期","date")}${input("mspDownDate","MSP（下）第一場日期","date")}${input("mspUpDate2","MSP（上）第二場日期","date")}${input("mspDownDate2","MSP（下）第二場日期","date")}</div>${check("rightsMsp")}`)+
      question(5,"【新會員交流座談會】",`<p>本人願意於加入後兩個月內，完成新會員交流座談會。</p>${input("sessionDate1","日期","date")}${check("rightsSession")}`)+
      question(6,"【例會出席制度】",`<p>本人了解：若無代理人情況下，半年內缺席四次，將會被開放專業類別。(無法再出席會議)</p>${check("rightsAttendance")}`)+
      question(7,"【代理人制度】",`<p>若無法出席例會，本人願意安排合格代理人參與。</p>${check("rightsProxy")}`)+
      question(8,"【綠燈會員制度】",`<p>本人了解：BNI相關商務活動，將以綠燈會員資格為優先參與基準。</p>${check("rightsGreen")}`)+
      question(9,"【會員費用與退費制度】",`<p>BNI是一家公司，並非社團協會。會員費用主要用於平台、系統與公司營運，宣誓入會後將不予退費。</p>${check("rightsFees")}`)+
      question(10,"【政策與道德規範】",`<p>本人願意遵守BNI相關政策、道德規範與營利合約。</p>${check("rightsEthics")}`)+
      question(11,"您是否願意邀請2位親友/合作夥伴來觀禮你的宣誓儀式？",yesNo("pledgeGuests")+`<div class="fields two">${input("guest1Name","第一位姓名")}${relation("guest1Relation")}${input("guest2Name","第二位姓名")}${relation("guest2Relation")}</div>`)+
      `<p>本人已詳細閱讀並理解以上內容，並願意遵守BNI相關規範與制度。</p>${signatures(true)}`)+
    section("closing","內部","委員內部紀錄",`<p>以下內容只供系統內部追蹤，不輸出至中心區公版。</p>${narrative("frameworkNotes","321A 委員內部觀察")}${narrative("chapterNotes","分會內部備註")}${narrative("internalSummary","內部總結與風險提醒")}<div class="fields two"><label>初步建議<select id="internalRecommendation" data-save><option value="">尚未決定</option><option>建議進入回饋與投票</option><option>需要補件後再確認</option><option>不建議進入投票</option></select></label>${input("followUpDate","追蹤日期","date")}</div>`);
    target.querySelectorAll('input[type="number"]').forEach(el=>el.min="0");
  }
  root.FulianMembershipForm=Object.freeze({render,version:form.version});
})(window);
