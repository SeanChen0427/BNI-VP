(() => {
  const RELEASES = Object.freeze([
    Object.freeze({
      version: "1.0.20",
      publishedAt: "2026-09-04",
      title: "交流群提醒改為回覆驅動省額度",
      level: "important",
      changes: Object.freeze([
        "每週例會與月底 Key-in 提醒會在最晚送達時間前 12 小時等待交流群新訊息，命中後由副主席秘書Bot免費 Reply 並 @所有人。",
        "12 小時未命中時不再耗額度推播整個交流群，只通知副主席秘書Bot的全部好友，請副主席或管理者人工貼出。",
        "好友通知分成操作說明與原提醒兩則，原提醒可直接長按複製；工作台也可複製並記錄已人工貼出。"
      ]),
      impact: "不保存好友 LINE ID、群組聊天內容或 replyToken；會員委員會提醒與工作摘要仍由會員委員秘書Bot照原方式推播。"
    }),
    Object.freeze({
      version: "1.0.19",
      publishedAt: "2026-08-31",
      title: "月末預備不再提前切換儀表板",
      level: "important",
      changes: Object.freeze([
        "8 月正式儀表板會繼續使用 7 月完整資料，不會被 8 月 31 日提前準備的新資料蓋掉。",
        "月末仍可上傳、審視與發佈下期快照；畫面會標示預備狀態與生效日。",
        "下期快照只會在台北時間每月 1 日自動成為正式資料，會員儀表板與 AI 查詢使用相同規則。"
      ]),
      impact: "7 月來源、8 月月會與所有已發佈版本都完整保留；本次只修正生效指標，不覆寫歷史資料。"
    }),
    Object.freeze({
      version: "1.0.18",
      publishedAt: "2026-08-31",
      title: "期中關懷未完成會跨月保留",
      level: "important",
      changes: Object.freeze([
        "同一會籍週期的期中關懷只要尚未完成，超過原到點月份後仍會每月持續顯示。",
        "跨月關懷沿用同一案件，不會重複開案；完成後才從後續期中清單移除。",
        "月末若官方報表已完整出齊，可提前驗收當月四類資料並產出分析。"
      ]),
      impact: "不修改 BNI 計分、燈號或既有案件內容；舊會籍週期任務不會帶入復會新週期。"
    }),
    Object.freeze({
      version: "1.0.17",
      publishedAt: "2026-08-31",
      title: "複製文案即可推進案件階段",
      level: "important",
      changes: Object.freeze([
        "複製三長群文案成功後，系統會保存完成紀錄並立即解鎖董事顧問確認。",
        "董顧同意後，複製正式公告文案可改由副主席人工貼到公告群，不消耗 LINE Push 額度。",
        "人工複製與 Bot 發送具有相同階段效果；公告完成紀錄保存後即可結案。"
      ]),
      impact: "舊版已複製但未保存階段的案件，請在新版重新按一次複製；系統不會自行猜測或改寫既有案件內容。"
    }),
    Object.freeze({
      version: "1.0.16",
      publishedAt: "2026-08-31",
      title: "修正董顧確認跳回尚未回覆",
      level: "important",
      changes: Object.freeze([
        "三長群步驟會等 Supabase 保存成功後才解鎖董事顧問確認，不會在背景同步期間提早開放。",
        "董顧確認改為獨立保存；成功後才更新畫面，失敗或版本衝突會直接顯示原因。",
        "結案按鈕旁會說明目前還缺董顧確認、正式公告，或已可直接結案。"
      ]),
      impact: "不修改既有案件、回饋、票數、Word 或公告；先前未成功保存的董顧狀態需在新版案件頁重新選擇並保存。"
    }),
    Object.freeze({
      version: "1.0.15",
      publishedAt: "2026-08-31",
      title: "新增繳費後協助群文稿",
      level: "normal",
      changes: Object.freeze([
        "文稿範本新增「繳費後協助群開場與訪談邀約」，對應申請表與繳費完成後的作業。",
        "可分別複製「＠ 新會員並自我介紹」與「邀約線上入會訪談」兩段文字。",
        "自我介紹會自動套用當屆副主席的姓名與行業別；缺資料時會提醒先確認名單。"
      ]),
      impact: "系統不會自動發送 LINE，也不讀取或修改新會員案件、申請表、繳費、投票與 Word 資料。"
    }),
    Object.freeze({
      version: "1.0.14",
      publishedAt: "2026-08-29",
      title: "測試群圖卡可改發正式群",
      level: "important",
      changes: Object.freeze([
        "回饋或投票圖卡先在測試群確認無誤後，副主席可直接按「改發正式群並複製新文案」。",
        "改發後請把新文案原樣貼到正式群；Bot 回覆正式圖卡後，流程才會最終鎖定。",
        "測試群舊連結會失效，避免兩個入口並存；已收到的回饋或票數會完整保留。"
      ]),
      impact: "只新增測試群轉正式群的單向發布流程；不刪除或改寫既有正式案件、回饋、票數、Word 與結案紀錄。"
    }),
    Object.freeze({
      version: "1.0.13",
      publishedAt: "2026-08-28",
      title: "LINE 免登入委員回饋",
      level: "important",
      changes: Object.freeze([
        "案件保存訪談 Word 後，可按「啟動回饋流程並複製文案」，再把完整文字貼到會員委員會測試群或正式群；Bot會免費回覆 @所有人與回饋圖卡。",
        "委員從圖卡開啟後不必登入或綁定 LINE，選擇自己的姓名並送出，內容會直接同步本案正式回饋。",
        "回饋頁一打開就能看見目前所有委員內容，不需要先送出自己的回饋；頁面也會自動更新。",
        "送出後可直接分享或複製回 LINE 群組，保留大家接續閱讀與討論的習慣。"
      ]),
      impact: "測試群只改變圖卡發布位置，仍寫入同一正式案件；既有回饋、投票、具名票向、結果圖、Word 與結案紀錄均不修改。"
    }),
    Object.freeze({
      version: "1.0.12",
      publishedAt: "2026-08-28",
      title: "正式投票可選測試群發布",
      level: "important",
      changes: Object.freeze([
        "正式案件按「啟動投票流程並複製文案」前，可選擇將圖卡發布到會員委員會測試群或正式群；預設仍是正式群。",
        "選擇測試群時會再次警告：群組只代表圖卡發布位置，委員送出的票仍會直接寫入該正式案件並影響決議與結案。",
        "Bot 只會在本次選定的群組回覆完整相符的文案；把同一文案貼到另一個群組不會產生圖卡。",
        "LINE Bot 與群組管理改為每個用途只顯示一列，以測試群／正式群下拉選單切換查看。"
      ]),
      impact: "獨立 LINE 投票測試器仍維持退場；不建立測試票、不改寫既有正式案件、票數、回饋、Word 或結案紀錄。"
    }),
    Object.freeze({
      version: "1.0.11",
      publishedAt: "2026-08-28",
      title: "LINE 投票測試器已退場",
      level: "normal",
      changes: Object.freeze([
        "正式 LINE 投票已完成驗收，系統設定不再顯示獨立投票測試器。",
        "舊測試呼喚與測試連結不再產生圖卡或接受投票。",
        "日後請從正式案件按「啟動投票流程並複製文案」，再貼到已指定的會員委員會正式群。"
      ]),
      impact: "正式案件、正式票、具名票向、結果圖、回饋、Word 與結案紀錄均不受影響。"
    }),
    Object.freeze({
      version: "1.0.10",
      publishedAt: "2026-08-28",
      title: "投票結果圖與副主席具名票向",
      level: "important",
      changes: Object.freeze([
        "正式投票形成通過或不通過決議後，副主席可直接下載 PNG 結果圖傳給三長群或董事顧問。",
        "結果圖包含案件、同意／不同意票數與比例、投票基數、參與門檻及未投人數，不列投票者姓名。",
        "副主席可在進行中案件查看每位委員投了什麼；結案後也能從結案資料頁再次查閱並重新下載結果圖。",
        "一般會員委員仍看得到整體統計與誰已投，但系統不再向其裝置回傳其他人的同意或不同意。"
      ]),
      impact: "既有正式票、資格快照、回饋、Word 與結案紀錄均保留；本次只增加結果圖、具名查閱及更嚴格的票向權限。"
    }),
    Object.freeze({
      version: "1.0.9",
      publishedAt: "2026-08-28",
      title: "LINE 免登入投票與獨立測試器",
      level: "important",
      changes: Object.freeze([
        "正式案件改為按「啟動投票流程並複製文案」，將完整文字貼到委員會正式群後，由會員委員秘書Bot免費回覆 @所有人與投票圖卡。",
        "委員從圖卡進入免登入投票頁，自行選擇姓名及同意／不同意；系統仍限制資格快照、迴避、截止時間與每人一票。",
        "系統設定新增獨立 LINE 投票測試器，可借用既有會員資料驗證測試群，不建立正式案件、不產生 Word，也不寫入正式票數。",
        "會員委員會的測試群與正式群可同時啟用；一般開票不再使用每月 Push 訊息額度。"
      ]),
      impact: "既有正式案件、回饋、投票與 Word 均保留；新流程只有在 Bot 成功回覆圖卡後才開放收票。"
    }),
    Object.freeze({
      version: "1.0.8",
      publishedAt: "2026-08-28",
      title: "複製投票通知也可開放投票",
      level: "important",
      changes: Object.freeze([
        "開票後可直接按「複製投票通知並開放」，不再強制先由會員委員秘書Bot發送。",
        "複製成功後會保存操作人、時間與投票截止版本，委員可立即進入系統投票。",
        "畫面會明確提醒副主席將文字人工貼到會員委員會群；不會把複製誤標為 LINE OA 已送達。",
        "若修改投票截止時間，必須依新時間重新複製或發送通知。"
      ]),
      impact: "不改動既有投票、資格快照、回饋或 LINE 送達紀錄；只新增開票通知的人工複製通道。"
    }),
    Object.freeze({
      version: "1.0.7",
      publishedAt: "2026-08-27",
      title: "新增當責信待寄中心",
      level: "important",
      changes: Object.freeze([
        "正式出席資料達門檻後，首頁提醒中心會通知副主席，並建立跨裝置待寄任務。",
        "缺席第 2、3、4 次及代理第 6、7、8、9 次各有對應草稿；每封都清楚顯示原因、次數與計算期間。",
        "缺席第 4 次與代理第 9 次直接產生開放行業別（專業類別）當責草稿，不設待核准狀態。",
        "副主席可複製主旨、內文或完整信件，再到正式信箱人工寄送並回系統留存寄發紀錄。"
      ]),
      impact: "系統不會自動寄信，也不會自動終止會員資格或開放專業類別；既有案件、訪談、投票、PALMS 與出席歷史均不修改。"
    }),
    Object.freeze({
      version: "1.0.6",
      publishedAt: "2026-08-26",
      title: "修正期中與離會訪談重試結案",
      level: "important",
      changes: Object.freeze([
        "修正 Supabase 暫時斷線後重試完成訪談，持續誤報「這項工作已在其他裝置更新」的問題。",
        "期中輔導與離會訪談改由伺服器依正式案件編號完成結案，不再用瀏覽器的舊版本覆寫整筆工作。",
        "Word 與案件階段已保存時可安全重試；重複操作只會確認同一案件完成，不會建立重複案件。"
      ]),
      impact: "保留既有訪談內容、Word、分工、排程及已完成資料；不修改回饋、投票、會員或 PALMS 資料。"
    }),
    Object.freeze({
      version: "1.0.5",
      publishedAt: "2026-08-18",
      title: "委員回饋通知改為正式 LINE OA",
      level: "important",
      changes: Object.freeze([
        "訪談 Word 保存後，可從案件流程直接將委員回饋通知發到已綁定的會員委員會正式群。",
        "正式訊息會真正 @所有人，並由系統帶入案件、訪談日期、主訪、陪訪及當期有效委員名單。",
        "送出前會顯示完整文案並再次確認；LINE 確認送達後才把案件標示為已通知。",
        "同一案件成功發送後會鎖定，避免雙擊、多人同時操作或重新整理造成重複通知。"
      ]),
      impact: "不重送既有已標示通知的歷史案件，不修改已完成回饋、投票、Word 或案件內容；自動驗證不會呼叫正式 LINE API。"
    }),
    Object.freeze({
      version: "1.0.4",
      publishedAt: "2026-08-18",
      title: "新增常用文稿範本",
      level: "normal",
      changes: Object.freeze([
        "側欄把文稿範本與常用連結收合在「常用資源」，避免主選單持續變長。",
        "新增群組使用說明、新會員訪談確認及續約訪談確認三份可複製公版。",
        "所有文稿都是固定文字，直接按下複製即可，不讀取案件、投票或訪談 Word。",
        "副主席可查看與複製；只有系統開發人員 Admin 能更新跨裝置正式公版。"
      ]),
      impact: "不發送 LINE、不保存會員回覆的身分證字號，也不讀取或修改案件、投票、Word 或會員資料。"
    }),
    Object.freeze({
      version: "1.0.3",
      publishedAt: "2026-08-11",
      title: "離會訪談改為純紀錄流程",
      level: "important",
      changes: Object.freeze([
        "離會訪談保存 Word 後直接結案，不進入委員回饋、投票、董事顧問確認或公告流程。",
        "已登記離會的會員仍可從歷史紀錄安排補訪；補訪不會恢復會員資格，也不會加入現任人數。",
        "表單新增清楚的營運改善摘要與後續優化行動欄位，供分會持續改善。",
        "結案資料頁只顯示離會訪談 Word、營運改善紀錄與案件歷程，不再出現決議區塊。"
      ]),
      impact: "不修改既有已完成案件、訪談 Word 或歷史資料；只修正後續離會訪談的流程限制與顯示。"
    }),
    Object.freeze({
      version: "1.0.2",
      publishedAt: "2026-08-10",
      title: "留言板跨裝置同步",
      level: "important",
      changes: Object.freeze([
        "修正電腦發布留言後，手機登入卻看不到內容的問題。",
        "留言改由 Supabase 保存；舊電腦留言會在原作者開啟新版首頁時安全搬移。",
        "同步失敗會保留輸入內容或本機備援，不再顯示成已成功保存。",
        "已結案清單不再顯示續約、期中或新會員訪談的舊排定階段。"
      ]),
      impact: "既有電腦留言不會刪除；案件、月會、訪談、附件、回饋、投票與會員資料均不受影響。"
    }),
    Object.freeze({
      version: "1.0.1",
      publishedAt: "2026-08-10",
      title: "修正月會紀錄載入",
      level: "important",
      changes: Object.freeze([
        "修正舊月會草稿引用已刪除案件時，整個月會頁面無法載入的問題。",
        "月會紀錄會先正常顯示；失效排程只標示待處理，不會自動復活已刪除案件。"
      ]),
      impact: "既有月會內容、案件、期中關懷、訪談草稿、附件、回饋與投票資料均保留。"
    }),
    Object.freeze({
      version: "1.0.0",
      publishedAt: "2026-08-10",
      title: "交接與委員會通知更新",
      level: "normal",
      changes: Object.freeze([
        "新增首頁版本更新入口，改版資訊不再占用工作提醒鈴鐺。",
        "新增每週會員委員會工作進度預覽，可確認排版後再發送 LINE。",
        "委員會通知會清楚顯示後台指定的正式群或測試群，降低誤發風險。"
      ]),
      impact: "本次更新不影響既有案件、期中關懷、訪談草稿、附件、回饋、投票或會員資料。"
    })
  ]);

  const latest = RELEASES[0];
  const session = window.FulianAuth?.getSession?.() || { role: "guest", name: "訪客" };
  const readKey = `fulian-release-notes-read-v1-${session.role}-${session.name}`;
  const $ = selector => document.querySelector(selector);

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    })[character]);
  }

  function formattedDate(value) {
    const [year, month, day] = String(value).split("-");
    return `${year}/${month}/${day}`;
  }

  function isLatestRead() {
    try {
      return localStorage.getItem(readKey) === latest.version;
    } catch {
      return false;
    }
  }

  function updateTrigger() {
    const trigger = $("#releaseNotesTrigger");
    if (!trigger) return;
    const unread = !isLatestRead();
    $("#releaseNotesVersion").textContent = `v${latest.version}`;
    $("#releaseNotesNew").hidden = !unread;
    trigger.classList.toggle("unread", unread);
    trigger.setAttribute("aria-label", `${unread ? "新版本：" : "查看"}系統更新 v${latest.version}`);
  }

  function markLatestRead() {
    try {
      localStorage.setItem(readKey, latest.version);
    } catch {}
    updateTrigger();
  }

  function releaseMarkup(release, current = false) {
    const levelLabel = release.level === "important" ? "重要更新" : "一般更新";
    return `
      <article class="release-history-item${current ? " current" : ""}">
        <header>
          <div><b>v${escapeHtml(release.version)}</b><span>${escapeHtml(levelLabel)}</span></div>
          <time datetime="${escapeHtml(release.publishedAt)}">${escapeHtml(formattedDate(release.publishedAt))}</time>
        </header>
        <h3>${escapeHtml(release.title)}</h3>
        <ul>${release.changes.map(change => `<li>${escapeHtml(change)}</li>`).join("")}</ul>
        <p>${escapeHtml(release.impact)}</p>
      </article>`;
  }

  function openDialog() {
    const dialog = $("#releaseNotesDialog");
    if (!dialog) return;
    $("#releaseDialogVersion").textContent = `v${latest.version}`;
    $("#releaseDialogDate").textContent = formattedDate(latest.publishedAt);
    $("#releaseDialogTitle").textContent = latest.title;
    $("#releaseDialogChanges").innerHTML = latest.changes.map(change => `<li>${escapeHtml(change)}</li>`).join("");
    $("#releaseDialogImpact").textContent = latest.impact;
    const acknowledge = $("#acknowledgeRelease");
    acknowledge.textContent = isLatestRead() ? "關閉" : "我知道了";
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog() {
    const dialog = $("#releaseNotesDialog");
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function initDashboard() {
    const trigger = $("#releaseNotesTrigger");
    if (!trigger) return;
    updateTrigger();
    trigger.addEventListener("click", openDialog);
    $("#closeReleaseNotes")?.addEventListener("click", closeDialog);
    $("#acknowledgeRelease")?.addEventListener("click", () => {
      markLatestRead();
      closeDialog();
    });
    $("#releaseNotesDialog")?.addEventListener("click", event => {
      if (event.target === event.currentTarget) closeDialog();
    });
    if (latest.level === "important" && !isLatestRead()) openDialog();
  }

  function initHistory() {
    const history = $("#releaseNotesHistory");
    if (!history) return;
    history.innerHTML = RELEASES.map((release, index) => releaseMarkup(release, index === 0)).join("");
    $("#currentReleaseVersion").textContent = `v${latest.version}`;
    $("#currentReleaseDate").textContent = formattedDate(latest.publishedAt);
  }

  function init() {
    initDashboard();
    initHistory();
  }

  window.FulianReleaseNotes = Object.freeze({ releases: RELEASES, latest, isLatestRead, markLatestRead });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
