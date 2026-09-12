# 資料與儲存 Schema

本文件記錄正式後端、瀏覽器相容層與本機復原資料的責任邊界。

## 資料權威與復原原則

- Supabase 是日常正式資料來源；案件、表單、附件、月會、公告、出席、投票與分析不得以瀏覽器快取或散落本機檔案作為另一個正式版本。
- `localStorage`、`sessionStorage` 與 IndexedDB 只承擔快取、短期工作階段、離線失敗備援、舊版搬移或個人狀態；各 Key 的例外用途以下表為準。
- Git 之外的本機私有分析資料與復原副本必須保留，但只有具備來源期間、匯出時間、schema／應用版本、雜湊及線上核對結果時，才能標示為可還原。
- 復原副本不得靠人工雙寫維持；還原驗證必須先在隔離環境進行。自動匯出、差異核對及完整還原演練尚未完成制度化，列於 `OPEN_QUESTIONS.md`。
- 已發布分析快照、已結案資料、追加式稽核與歷史決策不得為了「整理」而覆寫；需要更正時使用新版、追加事件或明確取代關係。

## localStorage

| Key／前綴 | 資料 | 主要讀寫者 |
|---|---|---|
| `fulian-work-plan-v1` | Supabase `tasks` 的目前分頁快取；不可作正式唯一來源 | `assets/js/task-store.js` |
| `fulian-case-workflow-v2-{caseId}` | Supabase `task_case_states.workflow` 的快取 | `assets/js/case-state-store.js`、`assets/js/case-workflow.js` |
| 五種訪談草稿 Key | Supabase `task_case_states.draft` 的快取 | `assets/js/case-state-store.js`、各表單 |
| `fulian-attendance-prototype-v1` | Supabase 保存失敗時的點名草稿備援；不是正式週次來源 | `assets/js/attendance.js` |
| `fulian-attendance-history-v1` | 舊版已確認週次；首次載入後由副主席／Admin 搬入 Supabase，原值保留作復原 | `assets/js/attendance.js` |
| `fulian-attendance-history-supabase-v1` | 本瀏覽器舊版週次搬移完成標記 | `assets/js/attendance.js` |
| `fulian-announcement-board-v1` | Supabase 首頁留言的本機快取；舊版本機留言在原作者登入時一次性搬入正式資料庫 | `assets/js/announcement-board.js` |
| `fulian-auth-config-v1` | 原型角色、人員名單與固定共用帳號名稱；V3 起不含密碼 | `assets/js/auth.js`、`assets/js/settings.js` |
| `fulian-auth-audit-v1` | 原型設定異動紀錄 | `assets/js/settings.js` |
| `fulian-vp-course-v2` | 新課程進度 | `assets/js/app-v2.js` |
| `fulian-vp-course-v1` | 舊課程封存資料，正式頁面不再讀取 | `archive/legacy/app.js` |
| `fulian-notification-read-v1-*` | 個人已讀通知 | `assets/js/notification-center.js` |
| `fulian-release-notes-read-v1-{role}-{name}` | 目前登入身份最後確認的使用者版版本號；不含更新全文或業務資料 | `assets/js/release-notes.js` |

案件 Key 與階段的程式唯一來源是 `core/case-domain.js`。

## sessionStorage

| Key／前綴 | 資料 |
|---|---|
| `fulian-auth-session-v1` | 目前登入身分與短期 Supabase access／refresh token；關閉分頁即移除，8 小時未操作逾時 |
| `fulian-ai-chat-v1:*` | 本次登入期間的 AI 對話 |

## IndexedDB（離線備援）

- Database：`fulian-case-files`
- Object store：`files`
- Key：案件 ID
- Value：訪談 Word `File`
- 唯一讀寫服務：`services/case-files.js`
- 正式附件會先保存到 Private Storage `case-files`；IndexedDB 只作目前電腦的下載備援。

## Supabase 伺服器端加密資料

- `ai_credentials`：個人 AI Key 的 AES-GCM 密文；解密 secret 只存在 Edge Function 環境。
- `ai_profiles`：個人預設 AI 平台。
- `committee_meetings`／`app_settings`：月會草稿、正式紀錄與分會目標。已結案月會的續約決議反轉以 `care_summary.items[].decisionAmendments` 追加保存原決議、原因、操作者、伺服器時間與新排程，不將整筆正式紀錄改回草稿；一般整份保存 API 不接受瀏覽器自行寫入更正陣列。
- `app_settings.common_message_templates`：僅系統開發人員 Admin 可維護的跨裝置常用文稿公版，包含各範本目前文字、最近 30 次前一版本、操作者與時間；副主席只能讀取與複製，不保存會員私訊回覆或身分證字號。新會員協助群文案中的當屆副主席姓名與行業別在前端複製時由當期名單及 `members` 主檔套用，不另寫入此設定值。
- `announcements`：首頁會員委員會留言的跨裝置正式來源；作者、角色、發布時間與軟刪除紀錄只經 `app-api` 寫入，`localStorage` 不再是唯一來源。
- `report_imports`＋Private Storage `raw-reports`：每月 BNI 原始報表與期間／雜湊。
  - Storage object path 僅使用月份、報表類型、上傳時間、序號及 SHA-256 短指紋等 ASCII 字元；使用者原始檔名只保存於 `report_imports.metadata.originalFilename`，不得直接組入 object path。
- `monthly_attendance_summaries`：單月 PALMS 衍生的月會出席摘要。
- `analysis_snapshots`：分析草稿及不可改寫的已發布版本。
- `attendance_sessions`／`attendance_records`：每週點名草稿、確認狀態、PALMS 基準期間與 LINE 公告快照。這些資料只作 PALMS 截止日後的公告暫時增量；新 PALMS 涵蓋後即停止加計，歷史紀錄不刪除。
- `accountability_email_tasks`：缺席第 2／3／4 次與代理第 6／7／8／9 次的跨裝置待寄任務、資料期間、版本化草稿、收件快照及人工寄送紀錄；不代表系統已寄信，也不變更會員或專業類別狀態。
- `accountability_email_events`：當責信任務的產生、複製、暫緩、不適用、恢復與人工寄送稽核；採只新增事件，不由瀏覽器直接讀寫。
- `line_group_targets`：Webhook 發現且由副主席／Admin 確認的 LINE 群組，只保存群組 ID、顯示名稱、所屬 OA（`vice_chair`／`committee`）、測試／正式環境與四種用途路由，不保存聊天內容。`committee` 只能由會員委員秘書Bot擁有，其餘路由只能由副主席秘書Bot擁有；相同 LINE 群組在 Bot 換接期間依 OA 分開保留歷史目標。
- `line_reminder_rules`：交流群兩種常態提醒的開關、Asia/Taipei 發送時間、例會星期、提前天數及文案；僅 service role 可讀寫，初始一律關閉。
- `line_reminder_deliveries`：常態通知的排程／人工測試發送稽核，以 delivery key 與 LINE retry key 防重複；不保存 Channel Access Token。
- `committee_work_digest_reply_deliveries`：正式委員群精確輸入「委員會進度」後的 Reply 稽核；以 webhook 事件鍵防止平台重送造成重複回覆，只保存群組目標、來源／文案 SHA-256、LINE 事件／訊息識別、時間及成敗，不保存指令全文、完整進度文案、`replyToken` 或 LINE 使用者 ID。
- `case_feedback_line_deliveries`：2026-08-28 前訪談後委員回饋 Push 通知的歷史發送稽核；保留既有紀錄，但新版案件不再新增此類 Push。
- `case_feedback_calls`／`case_feedback_call_responders`：新版 LINE 回饋呼喚、指定測試／正式群、當期有效委員快照、Bot Reply 狀態及稽核；只保存原始 Token 與完整文案的 SHA-256，不保存完整群組聊天文字。測試／正式群都連回同一正式案件。
- `case_vote_line_deliveries`：開票通知的正式會員委員會群發送稽核與防重送紀錄。
- `case_result_line_deliveries`：新會員、續約與轉換專業別通過後的正式公告群發送稽核；只允許 `approved`，保存送出當下的案件欄位快照與雜湊，瀏覽器角色不可讀取。
- `provisional_members`：已正式結案、但尚未由下一份半年 PALMS 唯一確認的新會員。只加入點名與 LINE 公告總人數；不供分析、續約、期中或關懷儀表板使用。升格與撤銷皆保留操作者及時間。
- `departure_interview_preferences`：歷史離會會員的選擇性補訪設定，只記錄「可安排／不安排」及操作者；不得修改 `members.status`、`departed_on` 或 PALMS 對帳結果。
- `tasks`／`task_assignments`／`task_private_details`：跨裝置工作排定、受派人與敏感備註；以 revision 做並行衝突保護，只經 Edge API 寫入。
- `committee_handover_plans`／`committee_handover_members`／`committee_handover_events`：Admin 預排的年度換屆、生效日、下一屆完整名單與排定／修改／取消／執行稽核。排程生效前不更新 `committee_terms`；執行後前後任期均保留。
- `task_assignment_history`：任務建立、一般改派、換屆待交接及完成換屆接手的前後完整指派快照、原因、操作者與時間。換屆不從此表刪除卸任者姓名。
- `tasks.handover_pending`／`handover_plan_id`／`handover_pending_since`／`handover_original_assignments`：只標記含卸任或轉任人員的未完成工作；原指派保留到新任副主席／Admin 明確完成集中改派。
- `deleted_task_references`：副主席／Admin 明確刪除案件後的識別碼封存標記；只保存來源、案件編號、原任務 UUID 與刪除時間，阻止舊裝置把 localStorage 殘影再次匯回，不保存會員內容或訪談資料。
- `task_case_states`：案件的副主席流程旗標及五種訪談草稿跨裝置狀態；回饋、投票資格與票不得再寫入此 JSON 作正式來源。投票通知的人工複製通道只在 `workflow` 保存 `voteNoticeCopiedAt`、`voteNoticeCopiedBy` 與對應截止版本，作為開放送票與稽核旗標；不代表 LINE OA 送達。三長群與正式公告另保存 `leadersCompletionMethod`／`leadersCompletedAt`／`leadersCompletedBy` 及 `resultAnnouncementMethod`／`resultAnnouncementRecordedBy`，用來辨識人工複製貼上與 LINE OA 發送；兩者可完成同一階段，但不得把人工路徑顯示成 LINE 已送達。
- `task_case_files`＋Private Storage `case-files`：訪談 Word 索引與實體檔案。
- `cases`＋`tasks.case_id`：工作台決議案件與正式案件主檔的對照。
- `case_feedback`：每位副主席／委員在每案各自一筆正式回饋，案件＋回饋者唯一；登入介面與 LINE 免登入頁共用同一資料表，免登入頁可立即讀取該次名單內的全體回饋。
- `vote_snapshots`／`vote_snapshot_voters`／`votes`：開票當下資格快照、申請者迴避與每人唯一且不可任意改寫的票。
- `case_events`：回饋保存、開票及投票等後端確認事件。

上述資料不得複製進 GitHub、公開備份範例或截圖。

## 本機測試資料重置

設定頁的「測試資料重置」只提供本機開發環境的 Admin 使用，且伺服器必須明確設定 `ALLOW_DESTRUCTIVE_TEST_RESET=true`；正式網站固定停用。範圍固定為：

- `fulian-work-plan-v1`
- `fulian-case-workflow-v2-*`
- 五種案件訪談草稿 Key
- IndexedDB `fulian-case-files`
- Supabase `committee_meetings` 內的月會紀錄

會員主檔、待 PALMS 新會員及其來源結案、BNI／PALMS、登入與人員設定、個人 AI Key、出席、公告及課程進度不在清除範圍。

## 正式資料與舊版相容原則

1. 每個仍存在的 localStorage 結構需定義版本與 migration；正式資料以 Supabase 為準。
2. 案件、回饋、投票拆成資料表，不保存為單一巨大 JSON。
3. Word 與截圖進 Private Storage。
4. 登入維持三組共用帳號（2026-07-19 決策，不改一人一帳號）；離任或懷疑外洩時更換共用密碼。
5. 前端不保存正式密碼或 API Key；Supabase 登入所需的短期 token 只放於目前分頁的 `sessionStorage`，不得放入 `localStorage`。


## 續約地基 Schema（2026-09-07 已部署）

- `renewal_foundations`：固定連結會員；訪談來源連結續約任務，既有地基補登的來源任務為空且 `data.origin=legacy`，資料庫約束來源配對並禁止事後改換會員／來源。保存條件類型、原起算日、目標、下次續約日、指派、每期工作坊確認、提醒摘要及 revision。原訪談結案後可繼續追蹤，不改寫原訪談。
- `renewal_foundation_events`：伺服器保存操作者、時間、提醒／確認內容及變更前後快照。只新增，不允許瀏覽器直讀直寫。
- `edge_save_renewal_foundation`：service-role-only 交易，原子檢查版本、寫入狀態及追加事件，防止並行覆蓋與部分成功。
- 來賓進度由分析核心依 Private Storage 正式報表即時計算，不把畫面數字或會員提供的估算寫成正式 PALMS。
- `committee_meetings.care_summary.foundationSnapshot`：保存當次月會需要跟進的必要進度；由後端建立，已結案不跟隨新報表改寫。訪談草稿的 `renewalFoundationSnapshot` 與正式 Word 保留該次訪談文字快照。

規格見 [續約地基追蹤](renewal-foundation-tracking.md)。

## 官方培訓課程庫（2026-09-12）

- `training_events`：官方活動 ID、名稱、起訖時間、來源連結、分類、版本及觀測狀態；不含會員報名或出席。
- `training_event_changes`：新增、改期／資訊變更、暫未列出與恢復的前後快照。
- `training_sync_state`：今年＋明年同步範圍、成功／失敗時間、筆數與執行租約。
- 三表均由 service role 經受保護 API 存取。三角色可查詢，副主席／Admin 可手動同步；資料庫 RPC 原子更新並保留歷史。
- 每日台北 06:00 由專用 `training-catalog-cron` 執行，不使用 LINE Bot。詳細契約與復原索引見 [培訓課程庫](training-catalog.md)。

新會員／續約訪談的 `task_case_states.draft.trainingSelections` 以既有日期欄位 ID 為鍵，值為官方場次 `{id,title,start_at,end_at,category}` 快照；與原日期值一起透過既有案件權限同步。舊草稿可無此欄位，改期不自動改寫草稿，詳見 [培訓課程庫](training-catalog.md)。
