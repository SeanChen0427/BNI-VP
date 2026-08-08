# 資料與儲存 Schema

本文件記錄正式後端與瀏覽器離線備援資料。

## localStorage

| Key／前綴 | 資料 | 主要讀寫者 |
|---|---|---|
| `fulian-work-plan-v1` | Supabase `tasks` 的目前分頁快取；不可作正式唯一來源 | `assets/js/task-store.js` |
| `fulian-case-workflow-v2-{caseId}` | Supabase `task_case_states.workflow` 的快取 | `assets/js/case-state-store.js`、`assets/js/case-workflow.js` |
| 五種訪談草稿 Key | Supabase `task_case_states.draft` 的快取 | `assets/js/case-state-store.js`、各表單 |
| `fulian-attendance-prototype-v1` | Supabase 保存失敗時的點名草稿備援；不是正式週次來源 | `assets/js/attendance.js` |
| `fulian-attendance-history-v1` | 舊版已確認週次；首次載入後由副主席／Admin 搬入 Supabase，原值保留作復原 | `assets/js/attendance.js` |
| `fulian-attendance-history-supabase-v1` | 本瀏覽器舊版週次搬移完成標記 | `assets/js/attendance.js` |
| `fulian-announcement-board-v1` | 首頁留言公告 | `assets/js/announcement-board.js` |
| `fulian-auth-config-v1` | 原型角色、人員名單與固定共用帳號名稱；V3 起不含密碼 | `assets/js/auth.js`、`assets/js/settings.js` |
| `fulian-auth-audit-v1` | 原型設定異動紀錄 | `assets/js/settings.js` |
| `fulian-vp-course-v2` | 新課程進度 | `assets/js/app-v2.js` |
| `fulian-vp-course-v1` | 舊課程封存資料，正式頁面不再讀取 | `archive/legacy/app.js` |
| `fulian-notification-read-v1-*` | 個人已讀通知 | `assets/js/notification-center.js` |

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
- `committee_meetings`／`app_settings`：月會草稿、正式紀錄與分會目標。
- `report_imports`＋Private Storage `raw-reports`：每月 BNI 原始報表與期間／雜湊。
  - Storage object path 僅使用月份、報表類型、上傳時間、序號及 SHA-256 短指紋等 ASCII 字元；使用者原始檔名只保存於 `report_imports.metadata.originalFilename`，不得直接組入 object path。
- `monthly_attendance_summaries`：單月 PALMS 衍生的月會出席摘要。
- `analysis_snapshots`：分析草稿及不可改寫的已發布版本。
- `attendance_sessions`／`attendance_records`：每週點名草稿、確認狀態、PALMS 基準期間與 LINE 公告快照。這些資料只作 PALMS 截止日後的公告暫時增量；新 PALMS 涵蓋後即停止加計，歷史紀錄不刪除。
- `line_group_targets`：Webhook 發現且由副主席／Admin 確認的 LINE 群組，只保存群組 ID、顯示名稱、測試／正式環境與四種用途路由，不保存聊天內容。
- `line_reminder_rules`：交流群兩種常態提醒的開關、Asia/Taipei 發送時間、例會星期、提前天數及文案；僅 service role 可讀寫，初始一律關閉。
- `line_reminder_deliveries`：常態通知的排程／人工測試發送稽核，以 delivery key 與 LINE retry key 防重複；不保存 Channel Access Token。
- `provisional_members`：已正式結案、但尚未由下一份半年 PALMS 唯一確認的新會員。只加入點名與 LINE 公告總人數；不供分析、續約、期中或關懷儀表板使用。升格與撤銷皆保留操作者及時間。
- `tasks`／`task_assignments`／`task_private_details`：跨裝置工作排定、受派人與敏感備註；以 revision 做並行衝突保護，只經 Edge API 寫入。
- `deleted_task_references`：副主席／Admin 明確刪除案件後的識別碼封存標記；只保存來源、案件編號、原任務 UUID 與刪除時間，阻止舊裝置把 localStorage 殘影再次匯回，不保存會員內容或訪談資料。
- `task_case_states`：案件的副主席流程旗標及五種訪談草稿跨裝置狀態；回饋、投票資格與票不得再寫入此 JSON 作正式來源。
- `task_case_files`＋Private Storage `case-files`：訪談 Word 索引與實體檔案。
- `cases`＋`tasks.case_id`：工作台決議案件與正式案件主檔的對照。
- `case_feedback`：每位副主席／委員在每案各自一筆回饋，案件＋回饋者唯一。
- `vote_snapshots`／`vote_snapshot_voters`／`votes`：開票當下資格快照、申請者迴避與每人唯一且不可任意改寫的票。
- `case_events`：回饋保存、開票及投票等後端確認事件。

上述資料不得複製進 GitHub、公開備份範例或截圖。

## 本機測試資料重置

設定頁的「測試資料重置」只提供 Admin 使用，範圍固定為：

- `fulian-work-plan-v1`
- `fulian-case-workflow-v2-*`
- 五種案件訪談草稿 Key
- IndexedDB `fulian-case-files`
- Supabase `committee_meetings` 內的月會紀錄

會員主檔、待 PALMS 新會員及其來源結案、BNI／PALMS、登入與人員設定、個人 AI Key、出席、公告及課程進度不在清除範圍。

## 正式遷移原則

1. 每個 localStorage 結構先定義版本與 migration。
2. 案件、回饋、投票拆成資料表，不保存為單一巨大 JSON。
3. Word 與截圖進 Private Storage。
4. 登入維持三組共用帳號（2026-07-19 決策，不改一人一帳號）；離任或懷疑外洩時更換共用密碼。
5. 前端不保存正式密碼或 API Key；Supabase 登入所需的短期 token 只放於目前分頁的 `sessionStorage`，不得放入 `localStorage`。
