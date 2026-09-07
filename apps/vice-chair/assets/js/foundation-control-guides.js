(function(global){
  "use strict";
  if(global.FulianFoundationControlGuides)return;
  const role=global.FulianAuth?.getSession?.()?.role;
  if(!["vp","committee"].includes(role)){
    document.querySelectorAll('[data-foundation-guide]').forEach(button=>button.hidden=true);
    return;
  }
  const entry=(selector,title,body)=>({selector,title,body});
  const definitions=[
    entry('#memberId','補登會員：選原本有約定的人','使用系統前已約定地基，就在這裡選在籍會員。日期仍填原約定期間；補登不會把過去未完成的期數當作完成。已建立後不能改成另一位會員。'),
    entry('#sourceTaskId','來源續約案件：連回本次訪談','選這項約定所屬的續約案件；從訪談進入時會自動綁定。保存地基不等於續約通過，也不會代為完成訪談。'),
    entry('#kind','地基類型：數量目標或人工條件','來賓、培訓或工作坊請選「指標與期間目標」。無法用這三種數量表達時，選「其他人工追蹤條件」，寫明完成標準與下次追蹤日。修改既有地基時類型鎖定，要換類型請另建正確項目。'),
    entry('#metric','追蹤指標：來賓、培訓或工作坊','來賓人數與培訓積分由正式 PALMS 核對，培訓採教育單位，不是紅綠燈分數。工作坊場次由副主席核對參加證據。既有指標鎖定，避免把原歷程解讀成另一種成果。'),
    entry('#period','計算期間：每期各自達標，或期限內累計','「每月 1 位」選每月；「每 3 個月 1 場」選每 3 個月；「半年內共 4 位」則選指定期間累計並填半年起訖。週期從續約日起算，例如 11/1 的第一個三個月到 1/31，超額不跨期抵用。'),
    entry('#intervalMonths','自訂每期月數：填 1–36 個月','例如每 2 個月檢視一次，填 2。起算日決定每期邊界，並以地基結束日收尾。這是每期長度，不是整項地基存續幾個月。'),
    entry('#leadMonths','何時提醒：不會改變累計起日','續約前累計 4 位來賓、希望半年前開始提醒，選期限前 6 個月。數量仍從地基起算日累計；選從起算日開始則全程提醒。每月等週期條件持續逐期檢視，不使用這個選項。'),
    entry('#startOn','起算日：填續約生效日或原約定日起','10/1 續約生效就填 10/1，不填今天的補登日期。修正既有日期會重排各期與重新核對數據；期間改變的工作坊確認要重新核對，原提醒與歷程仍保留。'),
    entry('#target','目標：一項地基只填一個指標數量','每月 1 位來賓填 1；期間內培訓 20 教育單位填 20，可用小數至兩位；工作坊填整數場次。每月來賓加每三個月工作坊要分兩項，稍後用「儲存並新增下一項」。'),
    entry('#title','改善項目：有特別名稱才填','留白會由指標、期間和目標產生名稱。自行填寫後會保留你的文字，調整數量時也要核對名稱是否仍正確。這一欄不是必填的長篇改善計畫。'),
    entry('#criterion','完成標準：一般選填，人工條件必填','數量型地基留白可用自動標準；有額外約定再補充。人工條件必須寫可核對的成果，例如完成指定培訓並提供證明，避免只寫「積極參加」。'),
    entry('#source','議定依據或備註：選填必要的約定來源','有需要時填原約定日期、決議或確認依據。留白不會替你建立董顧核准證據；內容以工作所需為限。這裡記錄設定依據，聯繫紀錄另用「記錄提醒／進度」。'),
    entry('#dueOn','期限：先看欄位是否包含結束當日','新指標型地基的結束日包含當日，一年可填 10/1 到翌年 9/30。舊型「下次續約日」維持原規則，不把下次續約當日多算一期。改期後請重新核對各期與目標。'),
    entry('#nextCheckOn','下次追蹤日：人工條件下次要確認的日期','例如先約下週確認報名、月底檢查證明，填下次聯繫日期；地基期限仍是最晚完成日。日期到時會提示跟進，並不表示已完成。'),
    entry('#leadId','主要追蹤人：一位負責接續處理的人','指定主責接收追蹤並回報進度；這不代表他已聯繫會員。換人時在調整表單重新指定並寫原因。一般回報達成仍須副主席確認。'),
    entry('#companionOne','陪同追蹤 1：有協助人員才指定','可留「無」。陪同可補充紀錄與實際提醒，不能代替副主席確認結果。不要與主要追蹤人重複。'),
    entry('#companionTwo','陪同追蹤 2：最多再加一位','不需要第二位就留「無」；兩位陪同不可重複，也不可與主責相同。每項地基各自保存指派。'),
    entry('#amendReason','修改原因：說明這次為何調整','例如「原續約生效日填錯，依原約定更正」。保存會留下修改前後內容；之後可從歷程查回，不會抹掉舊提醒或證據。'),
    entry('#saveAndAddFoundation','儲存並新增下一項：第一項會正式保存','按下先保存這一項，再開下一項並沿用會員、日期及追蹤人。下一項可改成不同指標與週期；按取消只放棄尚未保存的下一項，不會撤回剛才已保存的項目。'),
    entry('#definitionForm button.primary[type="submit"]','儲存地基：核對後才正式新增或修改','先核對會員、期間、數量與指派。成功後關閉表單並更新清單；若顯示錯誤，輸入保留。版本衝突時先關閉並重新整理核對，避免覆蓋別人的修改。'),
    entry('#definitionForm footer [data-close]','取消或右上角 ×：放棄這次尚未保存的輸入','兩個入口都關閉表單，不會新增或修改地基；這張表單沒有自動保存。若要保留修改，請在結束教學後自行按儲存。')
  ];
  const actions={
    reminder:'已實際提醒：先完成 LINE、電話、當面或 Email 聯繫，再記錄日期、方式與回覆。複製文案或點開通知不算提醒。',
    note:'補充紀錄：記錄佐證、討論或新資訊，不增加已提醒次數，也不把地基改成已達成。',
    progress:'回報進度：主責或副主席可選持續追蹤、回報達成待確認；回報不是正式確認。週期與工作坊採逐期核對，不使用整項回報達成。',
    resolve:'人工確認結果：副主席依證據確認整項結果。週期或工作坊在此只能停止整項追蹤；工作坊完成要改選確認本期工作坊。停止仍保留歷程，且不會自動處理會員資格。',
    'confirm-quarter':'確認本期工作坊：只確認選定的一期。先選適用期間，再選已確認達成或未達成；完成場次及日期須有證據，不能一併勾過未來各期。',
    reopen:'重新開啟：由副主席填原因，把已達成、停止或待人工處理的項目恢復追蹤。保留原期程與歷史，並不重新建立一項地基。',
    delete:'刪除地基：填原因後，這一項移到已刪除清單；同會員其他項目不受影響。已封存月會與 Word 留下的歷史不會被刪掉。',
    restore:'復原地基：填原因後，回到刪除前狀態與原期程；不重新計算起算日，也不自動改成已達成。'
  };
  const recordFields=[
    entry('#contactedOn','實際提醒日期：填真正聯繫的那一天','可以補記過去已聯繫的日期，不能填未來；預設今天，補登時請修正。保存成功才增加這項地基的提醒次數。'),
    entry('#channel','提醒方式：選本次實際使用的管道','LINE、電話、當面、Email 或其他，只描述這一次的聯繫。系統保存紀錄，不會因選擇管道就替你發訊息。'),
    entry('#response','會員回覆：沒有回覆也要明確記錄','按會員實際回覆填寫；尚未回覆就填「尚未回覆」。不要把預期或推測當作本人承諾。'),
    entry('#recordStatus','進度／確認結果：依本次動作選擇','「回報達成・待確認」仍需副主席核對。「未達成・待人工處理」保留待跟進；「已停止追蹤」是停止這項列管，不代表離會或開放專業類別。工作坊結果只套用選定一期。'),
    entry('#periodKey','確認哪一期：先看起訖和既有結果','只能選已開始的適用期間。預設第一個尚未完成期間，請核對會員實際參加日期屬於哪一期，避免確認錯期；前期未完成仍會保留。'),
    entry('#completedCount','完成場次：核對該期實際完成數量','選已達成時須填整數，且達到本期目標。若只完成部分，可先用補充紀錄保存證據，達標後再確認；選未達成時這個數量不作為完成結果。'),
    entry('#attendedOn','實際參加日期：須在所選期間內','不能填未來日期。多場填最後一場，並在下方逐一列出各場日期與內容；選未達成時不必填參加日期。'),
    entry('#note','本次紀錄與證據：每次保存都必填','提醒寫聯繫內容；工作坊寫課程與佐證；確認結果寫核對依據；刪除、復原或重新開啟則寫原因。這是之後交接時能判斷處理經過的紀錄。'),
    entry('#recordNextCheckOn','下次追蹤日：安排下一次檢視','人工條件由主責或副主席設定；如果會員仍待回覆，填下一次追蹤日期。週期型條件依起算日自動接續，不在這裡重設週期。'),
    entry('#recordForm button.primary[type="submit"]','儲存紀錄：會正式寫入剛才選擇的動作','按下前再次核對「本次動作」。若選刪除或停止，這就是最後保存該決定的按鈕；教學不會代按。出現錯誤時輸入保留，請依提示修正。'),
    entry('#recordForm footer [data-close]','取消或右上角 ×：不保存這次紀錄','關閉後不會增加提醒次數、確認工作坊或變更狀態。結束教學會回到你原本的表單，並保留尚未保存的輸入。')
  ];
  const cardFields=[
    entry('summary','各期進度與操作：展開這一項的明細','每位會員可以有多項地基。這裡展開的是其中一項，顯示各期目標、數量、差額及追蹤人；再次按下可以收合。資料待補要先補正式資料，不能當作零人或未達成。'),
    entry('[data-detail]','查看歷程：查當初約定與後續處理','開啟後可看設定來源、提醒日期、會員回覆、證據、確認結果及修改前後內容；閱讀不改變狀態。歷程視窗也有逐步教學。'),
    entry('[data-record]','記錄提醒／進度，或重新開啟','開啟後先選本次動作；選項依主責、陪同、副主席及地基類型決定。已達成或停止時按鈕顯示「重新開啟」，需副主席填原因，按開啟視窗不會立刻變更結果。'),
    entry('[data-copy]','複製提醒文字：還要自行聯繫會員','只把此項地基摘要放進剪貼簿，不會自動發送或增加提醒次數。貼到正確對話並實際聯繫後，再用「記錄提醒／進度」留下日期、方式與回覆。'),
    entry('[data-edit]','調整條件／指派：更正日期、數量或人員','表單會帶入現有設定，填修改原因後才保存。會員、類型、指標與週期鎖定，改這些內容需另建正確項目；改期可能使工作坊需要重新確認。'),
    entry('[data-delete]','刪除地基：先開原因表單，再確認保存','只有副主席可操作。填原因並儲存才會移除這一項；若操作錯誤，可從查看範圍的「已刪除（可復原）」找回。'),
    entry('[data-restore]','復原地基：回到刪除前的狀態與日期','填復原原因並儲存後回到原追蹤範圍。若刪除前已達成，復原仍是已達成，可到全部範圍查看；不一定出現在持續列管。')
  ];
  const historyFields=[
    entry('#detailContent > h3','先核對會員與地基名稱','同會員多項地基的歷程各自保存。先確認這次查的是正確條件，再看完成標準與設定來源。'),
    entry('#detailContent .detail-source','議定依據：看原約定如何形成','這裡是設定或調整時填的必要依據；顯示未填寫表示沒有補充，不代表曾經取得董顧核准。'),
    entry('#detailContent .history-item','每筆歷程：誰在何時做了什麼','依事件看操作者、時間、提醒方式與回覆、工作坊期別與參加日期、結果及下一次追蹤。補充紀錄、回報達成和副主席確認是不同動作。'),
    entry('#detailContent .history-item details','查看調整前後內容：核對改了哪些設定','有修改紀錄時可展開，核對改期、目標、指派及前後內容。變動期間原本的工作坊證據仍在歷史，但不一定適用新期間；收合不會改動資料。'),
    entry('#detailDialog [data-close]','右上角 ×：關閉歷程回到清單','這裡只供閱讀，關閉不會保存、刪除或變更任何地基。')
  ];
  function build(scope,mode){
    const action=scope.querySelector('#action')?.value||'';
    let rows=mode==='definition'?definitions:mode==='record'?[
      entry('#action','本次動作：先決定要留下哪一種紀錄',actions[action]||'依這次實際處理選擇動作。'),
      ...[...scope.querySelectorAll('#action option')].filter(option=>option.value!==action).map(option=>entry('#action',`${option.textContent}：何時使用`,actions[option.value]||'')),
      ...recordFields
    ]:mode==='card'?cardFields:historyFields;
    document.querySelectorAll('[data-guide-id^="foundation-control-"]').forEach(element=>element.removeAttribute("data-guide-id"));
    const targets=new Map();
    const steps=rows.flatMap((row,index)=>{
      const element=scope.querySelector(row.selector);
      if(!element||element.closest('[hidden]'))return[];
      // A closed details group is intentionally revealed by the common tour engine.
      if(!element.closest('details')&&!element.getClientRects().length)return[];
      const target=element.closest('label')||element;
      const id=targets.get(target)||`foundation-control-${mode}-${index}`;
      targets.set(target,id);
      target.setAttribute('data-guide-id',id);
      return[{id:`${mode}-${index}`,section:mode==='definition'?'設定表單':mode==='record'?'追蹤紀錄':mode==='card'?'各項操作':'閱讀歷程',target:`[data-guide-id="${id}"]`,title:row.title,body:row.body}];
    });
    const variant=mode==='definition'?[scope.querySelector('#kind')?.value,scope.querySelector('#period')?.value,scope.querySelector('#sourceTaskField')?.hidden?'legacy':'renewal',scope.querySelector('#amendReasonLabel')?.hidden?'create':'edit'].join('-'):mode==='record'?action:steps.map(step=>step.id).join('-');
    return{id:`context:foundation:${mode}:${variant}`,version:'1.0.0',title:'續約地基逐步操作',page:'續約地基追蹤',roles:[role],steps};
  }
  function open(scope,mode,automatic=false){
    if(!scope)return false;
    return global.FulianOnboarding?.openContext(build(scope,mode),scope,{automatic})||false;
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-foundation-guide]');
    if(!button)return;
    const mode=button.dataset.foundationGuide;
    open(button.closest('dialog,.foundation-condition'),mode);
  });
  global.FulianFoundationControlGuides=Object.freeze({open,build});
})(window);
