# 2026-07-20 Supabase 與前台上架作業紀錄

狀態：**正式前台與後端均已上線；GitHub Pages → Supabase Auth／Database／Private Storage 已完成三角色驗證。**

本文件如實記錄 2026-07-20 的實際操作、驗證結果、錯誤繞路與後續清理事項。不得把暫時網址或未完成項目描述為正式上架完成。

## 2026-07-27 月會排定與案件一致性修復部署

- 原因確認：2026-07-21 建立的月會關懷排定早於 2026-07-24 Supabase 任務同步上線；月會 JSON 保留了「已排定」及舊瀏覽器案件編號，但正式 `tasks` 表從未建立該案件。`audit_logs` 也沒有任務刪除事件，因此不是搬移時刪除，而是舊本機資料未成功遷移造成的分離狀態。
- `app-api` 已部署為 version 15、狀態 `ACTIVE`、`verify_jwt = true`；月會保存會先核對並建立／連回 Supabase 任務，失敗時不保存不實的已排定狀態。
- 月會頁新增未結案舊草稿自動修復與任務快取刷新；前台不再信任沒有正式任務佐證的舊 `taskId`。
- 完整驗證：34／34 測試通過、專案健檢 0 錯誤、PALMS 46／46 完全吻合。

## 2026-07-27 每週點名更正與預覽修正部署

- `app-api` 已部署為 version 14、狀態 `ACTIVE`、`verify_jwt = true`；新增副主席／Admin 重新開啟已確認週次的受保護操作。
- 前台新增重新開啟入口、完整 LINE 公告預覽與剪貼簿備援複製；桌機及 390px 手機版面均完成實際驗收。
- 完整驗證：33／33 測試通過、專案健檢 0 錯誤、PALMS 46／46 完全吻合。

## 2026-07-25 後續修正部署

- 已套用 `20260725150000_transactional_case_operations.sql`：開票、案件狀態、正式結案、任務完成、回饋、投票、重設與刪除改為 service-role-only 交易 RPC。
- migration 已補搬具正式資格快照的舊版 JSON 票，並以 `LEGACY_MIGRATION` 保留來源；沒有正式快照的舊案會在首次開票／投票時交易式補搬。
- `app-api` version 12 曾因重複宣告 `decodeBase64` 發生 `503 BOOT_ERROR`；已移除重複宣告並部署 version 13，狀態 `ACTIVE`、`verify_jwt = true`。
- 正式案件同步端點的 CORS 預檢已回應 HTTP 200 與 `ok`，前台「案件資料同步失敗：Failed to fetch」的啟動錯誤已解除。
- 前台資產版本更新為 `auth v7`、`task-store v4`、`case-state-store v3`、`login v4`、`case-workflow v15`，避免 GitHub Pages／瀏覽器沿用舊快取。
- 完整驗證：32／32 測試通過、專案健檢 0 錯誤、PALMS 46／46 完全吻合。

## 一、已確認的最終架構

Sean 再次確認正式架構維持：

```text
GitHub Pages
只負責現有前台 HTML／CSS／JavaScript／圖片
        ↓
Supabase Auth
三組共用帳號登入與角色驗證
        ↓
Supabase PostgreSQL／Private Storage／Edge Functions
會員、PALMS、案件、附件、權限與伺服器端功能
```

- GitHub 不保存真實會員、PALMS、案件附件、密碼或 API Key。
- Supabase 負責正式後台與所有正式資料。
- 2026-07-20 建立的 Sites 與 Supabase 前台託管均屬錯誤繞路／暫時部署，不是最終架構。
- 發現 GitHub 尚未連接時，正確處理應是立即請 Sean 登入或確認 GitHub；不應自行更換前台託管方案。

## 二、Supabase 正式後端完成項目

### 專案與 migration

- Supabase 專案：`fahrblkukuhgveiptufn`
- 已推送 migration：
  - `supabase/migrations/20260720070454_initial_schema.sql`
  - `supabase/migrations/20260720074814_grant_service_role_privileges.sql`
  - `supabase/migrations/20260720095300_public_web_assets_bucket.sql`
  - `supabase/migrations/20260720153500_online_application_api.sql`
  - `supabase/migrations/20260720170500_backfill_audit_report_dates.sql`
  - `supabase/migrations/20260720174000_attendance_palms_reconciliation.sql`
- 第一版正式 schema 建立 26 個資料表、78 條 RLS policies 與 3 個 Private Storage buckets：
  - `raw-reports`
  - `case-files`
  - `case-confirmations`
- 後續錯誤繞路另建立的 `web-app` 公開 bucket 已在 GitHub Pages 驗證後移除。
- 新增正式 `app_settings`、`monthly_attendance_summaries`、`ai_profiles`；月會寫入 RLS 收斂為 Admin／副主席，委員只讀已結案紀錄。
- 已部署 `app-api` Edge Function；Supabase gateway JWT 驗證與函式內 `app_accounts`／當期委員姓名驗證同時啟用。
- `FULIAN_AI_ENCRYPTION_KEY` 已以隨機 Edge secret 設定，未輸出、未寫入專案；個人 AI Key 以 AES-GCM 密文保存在 `ai_credentials`。
- 初次搬移的 5 份 2026-06 審計檔原本因誤用 PALMS 解析器而缺少期間欄位；已由 Private Storage 檔名補回每週日期，原始檔未重傳或改寫。

### Auth 與角色

- 建立三組 Supabase Auth 共用帳號：Admin、副主席、會員委員。
- 前台仍使用原本簡單名稱 `admin`、`vice`、`Fulian`，內部 Email 只供程式對接。
- `auth.js` 已移除寫死的原型密碼。
- 登入後以 `app_accounts` 與 RLS 再驗證角色。
- 現任副主席與會員委員名單不寫入公開前端，登入後由 `committee_terms` 載入；目前為 1 位副主席、6 位會員委員。
- token 只保存於 `sessionStorage`，支援更新、登出及 8 小時未操作逾時。
- 已部署 `manage-shared-credentials` Edge Function，只有 Admin 可一次更新三組密碼。
- 初始帳密保存在專案外：
  - `~/Library/Application Support/Fulian VP System/supabase-bootstrap-credentials.txt`
  - 不得提交 GitHub。

### 正式資料遷移

執行 `scripts/migrate-bni-data-to-supabase.mjs`，結果：

- `people`：44 人
- `members`：44 人
- 已發布分析快照 ID：`830ecf8d-db80-4d56-8efa-609ac1fe98b5`
- 分析期間：`2026-01-01` 至 `2026-06-30`
- Private Storage 原始報表：12 份
- 單月出席資料：`2026-06`

三種角色均已實際驗證可登入、角色一致、可讀取 44 位會員及已發布 PALMS 快照；會員委員不可讀取 `raw-reports` Private Storage。

## 三、前端已完成的程式修改

- 正式網址：<https://seanchen0427.github.io/BNI-VP/>
- GitHub repository：<https://github.com/SeanChen0427/BNI-VP>
- GitHub Actions 每次推送 `main` 會重新建立只含公開前端的 Pages artifact。
- Pages 部署只取 `apps/vice-chair/` 的 HTML／CSS／JavaScript／圖片與公版教材，不發布測試、內部文件、PALMS 或會員資料。

- `assets/js/supabase-config.js`：Supabase 公開 URL 與 publishable key。
- `assets/js/auth.js`：Supabase Auth、角色驗證、token 更新、登出及逾時。
- `assets/js/supabase-data.js`：由 Supabase 讀取會員、單月出席與已發布分析快照；所有同源 `/api/*` 會自動附上目前登入 JWT 及自我申報姓名後轉送 `app-api`。直接讀取：
  - `/api/bni-analysis`
  - `/api/bni-monthly-attendance`
- Edge API 接管：
  - `/api/monthly-data`
  - `/api/committee-meetings`
  - `/api/analysis-draft`
  - `/api/analysis-snapshots`
  - `/api/ai-settings`
  - `/api/ai-chat`
  - `/api/member-departure`
  - `/api/company`
  - `/api/test-data-reset`
  - `/api/attendance`
- `assets/js/member-directory.js`：會員姓名不再寫死於公開前端，由登入後的 Supabase 查詢取得。
- `assets/js/auth.js`：副主席與會員委員姓名同樣改由登入後的 Supabase `committee_terms` 取得。
- `member-care.js`、`attendance.js`、`settings.js`、`work-planner.js` 已等待線上會員名單載入。
- `attendance.js` 已將草稿、確認週次與 LINE 公告快照接上 `/api/attendance`；最新半年 PALMS 仍是正式基準，只加計報表截止日後且已確認的週次。
- PALMS 教材 PDF 因 Supabase Storage 不接受中文物件鍵，檔名由中文改為 `palms-entry-guide-v1.0-20220505.pdf`；PDF 內容與畫面文案未改。

## 四、本輪完成與仍待遷移的資料層

本輪已完成所有舊 `/api/*` 的正式後端接管；月會、每月報表、單月出席、分析草稿、離會、AI 與公司查詢不再依賴本機 `preview-server.mjs` 或 macOS 應用資料。

案件排程已於 2026-07-24 完成 Supabase 跨裝置同步：

- `tasks`、`task_assignments`、`task_private_details` 成為正式排程來源。
- 舊瀏覽器 `fulian-work-plan-v1` 只作為第一次搬移來源及離線畫面快取。
- 首次由副主席原本的瀏覽器開啟新版時，尚未存在於伺服器的舊排程會自動上傳；既有伺服器資料優先，不以舊快取覆蓋。
- 全體當期委員可看工作進度；工作備註只回傳副主席、Admin 與受派人員。
- 只有副主席／Admin 可建立、改派與刪除；會員委員只能完成自己主責的「特定會員關懷」。

2026-07-24 起，表單草稿、案件流程與訪談 Word 均已跨裝置同步；IndexedDB 只作 Word 本機下載備援。尚未遷移的只剩課程進度等非正式個人瀏覽器狀態。

每週點名已完成 Supabase 跨裝置同步；`localStorage` 只保留連線失敗時的草稿備援與一次性舊歷史搬移來源，不再是正式週次來源。

## 五、錯誤繞路與目前暫時資源

### OpenAI Sites

- 建立包裝專案：`apps/vice-chair-web/`
- Sites project ID：`appgprj_6a5de7d831f08191808a3455e3743a4d`
- 版本：1
- 部署 ID：`appgdep_6a5dee9ab77c8191ae5139b6d2a1cb8b`
- 網址：`https://fulian-committee.seankuichen.chatgpt.site`
- 原前台畫面與圖片均保留；曾產生一張不必要的登入預覽圖，之後已從專案及所有引用移除。
- 即使 access mode 設成 `public`，訪客仍須先使用 ChatGPT 登入，因此不適合作為會員正式入口。
- GitHub Pages 驗證後已將 access mode 改為 owner-only；一般訪客不再能使用此暫時站點。

### Supabase 暫時前台

- 建立 `web-app` 公開 bucket，上傳 112 個現有前端檔案。
- 建立公開 `site` Edge Function，將 Storage 檔案以正確 HTML／CSS／JavaScript MIME 回傳。
- 暫時網址：`https://fahrblkukuhgveiptufn.supabase.co/functions/v1/site`
- HTTP 驗證：
  - 根網址：308 導向尾斜線後 200
  - 登入頁：200 `text/html`
  - `auth.js`、`supabase-config.js`、`supabase-data.js`：200 JavaScript
  - PALMS 教材 PDF：200 `application/pdf`
- 自動化瀏覽器受本機攔截器影響，開啟 Supabase Functions 網域時回報 `ERR_BLOCKED_BY_CLIENT`；這不是伺服器 HTTP 失敗，但尚未完成一般瀏覽器的實際點擊登入驗收。
- GitHub Pages 驗證後已完成清理：
  - `web-app` bucket 與其中公開前端物件已刪除
  - `site` Edge Function 已刪除
  - 建立 bucket 的 migration 保留歷史；Storage bucket 必須以 Storage API 清理，Supabase 不允許 migration 直接刪除 Storage 系統表

## 六、驗證結果

- 根目錄 `npm run check` 已通過。
- BNI regression 46／46 通過。
- 公開 repository 檢查 196 個檔案通過；Supabase CLI 暫存、真實會員名單、PALMS、密鑰與暫時前台均未提交。
- 本輪修改後 `npm run check`、46／46 計分回歸及公開 repository 掃描再次通過；GitHub Pages 公開 artifact 共 112 個檔案。
- `20260720153500_online_application_api.sql` 遠端 dry-run 與正式 `db push` 完成；`app-api` Function bundler 成功帶入既有分析核心，沒有另建計分副本。
- `20260720174000_attendance_palms_reconciliation.sql` 遠端 dry-run 與正式 `db push` 完成；`app-api` 已重新部署並保留 gateway JWT 驗證。
- `20260724090000_task_cross_device_sync.sql` 已正式 `db push`；`app-api` 新增 `/api/tasks` 並部署完成。

## 2026-07-24 案件跨裝置同步與安全加固

- 正式套用 migration：`20260724170000_case_cloud_sync_and_task_hardening.sql`。
- `app-api` 已部署為 version 8、狀態 `ACTIVE`、`verify_jwt = true`。
- 任務改為單筆明確 upsert／delete，加入 revision 衝突檢查與資料庫交易 RPC，避免舊裝置誤刪或覆蓋新資料。
- 新增 `/api/case-states`，將案件流程與五種訪談草稿保存至 `task_case_states`。
- 新增 `/api/task-file`，將訪談 Word 保存至 Private Storage `case-files`，附件索引保存於 `task_case_files`。
- 撤銷 authenticated 對任務敏感表及案件 Storage 的直接存取，正式操作統一經 Edge API 依角色與受派關係驗證。
- 測試資料重置擴大為伺服器月會、案件、草稿、流程與附件；會員主檔、PALMS、登入、AI Key 與出席資料不受影響。
- 本機固定驗證：28/28 測試通過、專案健檢 0 錯誤、PALMS 46/46 逐人逐項完全吻合。
- 排程跨裝置專用測試 3 項通過，根目錄測試總數為 28/28；BNI regression 維持 46/46。
- 點名上線後發現 PostgREST `return=minimal` 會以成功但空白的 response body 回應；原共用 `db()` 強制執行 `response.json()`，導致資料已保存卻顯示 `Unexpected end of JSON input`。已改為先讀文字、空內容回傳 `null`，並重新部署 `app-api`。
- 2026-07-21 制度查詢 AI 曾把 Claude `stop_reason = max_tokens` 的半截內容直接顯示；已補三家平台的完成狀態檢查，截斷時改為明確錯誤。會員姓名問題同時改成只傳該會員的必要快照，降低 API 成本與截斷機率。
- 本輪自動三角色線上驗證無法沿用專案外的初始密碼檔：三組密碼已在先前操作中更新，而初始檔未同步更新。未擅自重設正式密碼；完成 GitHub Pages 新版發佈後需使用目前有效密碼做一次實際點擊驗收。
- GitHub Pages workflow build 與 deploy 均成功。
- 正式首頁、登入頁與 `auth.js` 均回應 HTTP 200。
- `scripts/verify-online-supabase.mjs` 已對正式 GitHub Pages 執行：
  - Admin／副主席／會員委員 Auth 與 `app_accounts` 角色一致
  - 三角色均讀到 44 位會員、7 筆現任委員任期及 2026-01～06 已發布快照
  - Admin／副主席可讀 Private `raw-reports`，會員委員讀不到

## 2026-07-25 多人登入與案件參與並行修正

- 新增 migration：`20260725103000_normalize_case_participation.sql`。
- migration 已正式套用至專案 `fahrblkukuhgveiptufn`；本機與遠端 migration 版本一致。
- `app-api` 已部署為 version 10、狀態 `ACTIVE`、`verify_jwt = true`。
- Auth 登出與首次選姓名流程改為只撤銷目前裝置；共用委員帳號的其他電腦不再被連帶登出。
- `auth.js` 加入 refresh mutex 與登出競爭保護，前後端都依人員啟用狀態及任期起訖驗證登入姓名。
- 工作台決議案件透過 `tasks.case_id` 對應正式 `cases`；每位委員回饋保存於 `case_feedback`，每張票保存於 `votes`，不再以 `task_case_states.revision` 競爭整包 JSON。
- 開票由 Edge API 依當期有效副主席／委員建立不可任意改寫的資格快照，申請者本人由後端強制迴避；投票截止及單票不可修改同樣由後端驗證。
- 前端直接存取正式案件參與表的權限已撤銷，僅 `service_role` 可由受 JWT 保護的 `app-api` 操作。
- 排程與案件狀態加入前景／焦點及 30 秒安全更新；偵測本機正在寫入或同步失敗時停止遠端覆蓋。
- 本機測試增至 31 項，包含兩位委員以相同舊 revision 同時提交回饋與投票仍各自保留。

## 七、安全紀錄

- 真實會員與 PALMS 未加入 GitHub 或公開前端 bucket。
- `npx supabase projects api-keys` 的 CLI 結果曾在本機 Codex 工具輸出中顯示 legacy `service_role` key；該 key 未寫入專案檔案，但正式交付前必須視為已暴露憑證並完成輪替／撤銷確認。
- 專案檔案僅保存 publishable key；service role、密碼與其他 secret 不得提交 GitHub。

## 八、下一步與清理順序

已完成：GitHub 連線、repository、公開邊界、GitHub Pages、三角色線上驗證、Supabase 暫時前台清理、Sites 公開入口關閉。

後續順序：

1. 輪替本次工具輸出中曾顯示過的 legacy service role key。
2. 評估是否將非正式的個人課程進度從瀏覽器搬入 Supabase。
3. 完成一般使用者的多人回饋、投票與單機登出實際操作驗收及換屆交接規則。
