# 資料與儲存 Schema

本文件記錄正式後端與仍待遷移的瀏覽器本機資料。

## localStorage

| Key／前綴 | 資料 | 主要讀寫者 |
|---|---|---|
| `fulian-work-plan-v1` | 案件與工作排定陣列 | `assets/js/work-planner.js`、`assets/js/case-board.js`、`assets/js/case-creator.js` |
| `fulian-case-workflow-v2-{caseId}` | 回饋、投票、董顧、結案 | `assets/js/case-workflow.js` |
| `fulian-terminal-counseling-draft-v3-{caseId}` | 終期輔導草稿 | `assets/js/terminal-form.js` |
| `fulian-midterm-counseling-draft-v2-{caseId}` | 期中輔導草稿 | `assets/js/midterm-form.js` |
| `fulian-new-member-interview-v2-{caseId}` | 新會員訪談草稿 | `assets/js/new-member-form.js` |
| `fulian-industry-change-interview-v2-{caseId}` | 轉換行業別草稿 | `assets/js/industry-change-form.js` |
| `fulian-departure-interview-v2-{caseId}` | 離會訪談草稿 | `assets/js/departure-form.js` |
| `fulian-attendance-prototype-v1` | 點名與確認 | `assets/js/attendance.js` |
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

## IndexedDB

- Database：`fulian-case-files`
- Object store：`files`
- Key：案件 ID
- Value：訪談 Word `File`
- 唯一讀寫服務：`services/case-files.js`

## Supabase 伺服器端加密資料

- `ai_credentials`：個人 AI Key 的 AES-GCM 密文；解密 secret 只存在 Edge Function 環境。
- `ai_profiles`：個人預設 AI 平台。
- `committee_meetings`／`app_settings`：月會草稿、正式紀錄與分會目標。
- `report_imports`＋Private Storage `raw-reports`：每月 BNI 原始報表與期間／雜湊。
- `monthly_attendance_summaries`：單月 PALMS 衍生的月會出席摘要。
- `analysis_snapshots`：分析草稿及不可改寫的已發布版本。

上述資料不得複製進 GitHub、公開備份範例或截圖。

## 本機測試資料重置

設定頁的「測試資料重置」只提供副主席與 Admin 使用，範圍固定為：

- `fulian-work-plan-v1`
- `fulian-case-workflow-v2-*`
- 五種案件訪談草稿 Key
- IndexedDB `fulian-case-files`
- Supabase `committee_meetings` 內的月會紀錄

會員主檔、BNI／PALMS、登入與人員設定、個人 AI Key、出席、公告及課程進度不在清除範圍。

## 正式遷移原則

1. 每個 localStorage 結構先定義版本與 migration。
2. 案件、回饋、投票拆成資料表，不保存為單一巨大 JSON。
3. Word 與截圖進 Private Storage。
4. 登入維持三組共用帳號（2026-07-19 決策，不改一人一帳號）；離任或懷疑外洩時更換共用密碼。
5. 前端不保存正式密碼或 API Key；Supabase 登入所需的短期 token 只放於目前分頁的 `sessionStorage`，不得放入 `localStorage`。
