# 2026-07-20 Supabase 與前台上架作業紀錄

狀態：**正式前台與後端均已上線；GitHub Pages → Supabase Auth／Database／Private Storage 已完成三角色驗證。**

本文件如實記錄 2026-07-20 的實際操作、驗證結果、錯誤繞路與後續清理事項。不得把暫時網址或未完成項目描述為正式上架完成。

## 2026-08-04 月度分析離會差異確認

- 月度分析對帳的 `expiry-only` 差異改為可操作的人員卡：副主席逐人確認後，經既有受 JWT 與角色保護的 `/api/member-departure` 寫入正式離會狀態，再自動重新對帳。
- 系統不會自行把所有名單差異判成離會；未經確認的姓名仍阻擋分析。已確認離會者由 Supabase 會員主檔永久記錄，後續月份自動排除且不再詢問，誤登記可到設定頁撤銷。
- 此修改不變更 PALMS 解析、燈號計分或既有快照。
- `app-api` 已部署為 version 19、狀態 `ACTIVE`、`verify_jwt = true`；GitHub Pages workflow `30830934089` 部署成功。
- 正式前台以副主席身分驗收：五位 `expiry-only` 差異均正確顯示獨立「確認已離會」按鈕及 2026-08-04 確認日；驗收未點擊任何確認按鈕，會員資料未被更動。

## 2026-08-03 月度分析草稿 API 路由修正

- 原因確認：`analysis-review.html` 未載入 `supabase-data.js`，正式頁面呼叫相對路徑 `/api/analysis-draft` 時由 GitHub Pages 回傳 HTML 404，前端再以 JSON 解析而顯示 `Unexpected token '<'`。
- 分析頁補回 Edge API 橋接及非 JSON 防呆；後端同步鎖定本期半年、全年與審計資料期間，禁止沿用舊報表產生看似最新的草稿。
- 本次不修改計分規則、會員資料或既有快照。
- `app-api` 已部署為 version 18、狀態 `ACTIVE`、`verify_jwt = true`；完整驗證為 44／44 測試通過、專案健檢 0 錯誤、PALMS 46／46 完全吻合。
- GitHub Pages 正式版已完成瀏覽器驗收：2026-07 半年 PALMS、全年 PALMS、單月 PALMS 與每週審計顯示 4／4 完整；再次按「產出本月分析草稿」不再出現 HTML／JSON 解析錯誤，請求已正確送達 Supabase。
- 分析引擎依「先對帳、後分析」停止產稿：到期報告中的柳欽貿、黃庭安、馬鼎鈞、林偉潔、楊秉諺不在本期 PALMS，也尚未列入正式離會名單。此為資料差異阻擋，不是 API 故障；本輪未代為判斷或修改五人的會員狀態。

## 2026-08-03 PALMS 中文檔名 Storage key 修正

- 原因確認：月度上傳程式的清理規則允許 Unicode 字母，導致原始檔名中的中文仍進入 `raw-reports` object path，Supabase Storage 以 `Invalid key` 拒絕上傳。
- 物件路徑改為純 ASCII 系統編號；中文原始檔名只存於 `report_imports.metadata.originalFilename`，不影響使用者辨識與稽核。
- 修正只涉及上傳物件路徑與回歸測試，未修改既有 PALMS、分析快照、會員資料或計分規則。
- `app-api` 已部署為 version 17、狀態 `ACTIVE`、`verify_jwt = true`；完整驗證為 41／41 測試通過、專案健檢 0 錯誤、PALMS 46／46 完全吻合。
- 正式 GitHub Pages 以副主席身分重新上傳 2026-07 單月 PALMS 成功；頁面顯示「已上傳並完成月會摘要」，每月資料進度由 1／4 更新為 2／4。

## 2026-07-30 回饋投票頁捲動體驗修正

- 移除案件決議工作台右側案件狀態卡的 `position: sticky`，避免使用者向下填寫回饋、投票及董顧資料時，狀態卡持續跟隨並干擾閱讀。
- 只修改 HTML／CSS 版面與防回歸測試，未更新任何案件、回饋、票或流程狀態。
- 完整驗證：38／38 測試通過、專案健檢 0 錯誤、PALMS 46／46 完全吻合。

## 2026-07-30 終期輔導 Word 缺漏修復

- 以使用者提供的終期輔導 Word 實際抽取內容並逐頁渲染核對；缺漏集中於動態建立的第 3～10 題，靜態的第 11 題以後與 386 字訪談人意見正常存在。
- 只讀查詢正式 Supabase 草稿確認：第 3～10 題及訪談人總結目前為空，訪談人意見完整；因此不是 Word 轉檔遺漏，而是舊版頁面重新載入 PALMS 後清空動態欄位，再依空白畫面產檔。
- 前台改為重建動態題目前先擷取整份表單，重建後完整回填；產檔前同時檢查所有正式答案、單選、滿意度及必要確認，任何一項缺漏均不得標記完成或保存 Word。
- 本次不修改既有案件草稿、流程狀態或 Private Storage Word；舊檔缺漏文字在正式資料庫已不存在，須由訪談人補填後重新產生，系統不猜測內容。
- 完整驗證：38／38 測試通過、專案健檢 0 錯誤、PALMS 46／46 完全吻合。

## 2026-07-27 案件身份與重複完成保護部署

- 原因確認：同一任務的顯示與表單曾分別信任 URL、月會草稿、任務快取及流程草稿中的姓名；缺少統一的「任務 ID＋案件類型＋會員」核對，舊內容可能把洪孟新案件顯示成紀韻霓。
- 完成訪談時，後端原先先比對 revision、再判斷任務是否早已完成；第一次請求實際已保存 Word、流程及完成狀態時，稍後的重試仍可能因舊 revision 回傳 409，造成「尚未完成案件保存」的錯誤提醒。
- 前後端已統一以正式 Supabase 任務作為案件身份來源；既有工作禁止換會員／換類型，月會錯誤連結會捨棄，流程草稿不得覆蓋正式身份，五種表單未完成核對前不顯示。
- `20260727223000_protect_task_identity.sql` 已通過 dry-run 並正式 push；內容只有函式與 trigger DDL，沒有 `INSERT`、`UPDATE` 或 `DELETE`。`app-api` 已同步部署。
- 部署前後完成資料只讀指紋完全相同：完成工作 1 筆（`e60eb893230613ad5e700eb335d3abdc`）、流程狀態 1 筆（`432002d7e953313ded482edcf455ee3e`）、Word 1 份共 12,267 bytes（`51946b54a9b0bce717ee054606740b22`）、正式完成案件 0 筆（空集合 `d41d8cd98f00b204e9800998ecf8427e`）。
- 完整驗證：37／37 測試通過、專案健檢 0 錯誤、PALMS 46／46 完全吻合。

## 2026-07-27 訪談表單案件會員綁定修復部署

- 原因確認：五種訪談表的基本初始化與正式案件帶入各自非同步執行；期中表曾先帶入洪孟新案件，再被較慢完成的預設／草稿初始化覆蓋為紀韻霓，形成會員姓名與主責、陪訪混合。
- 五種訪談表已固定為基本初始化完成後才帶入案件；案件連結同時核對 ID 與類型，正式會員不存在時停止顯示，不再改用第一位會員。
- 正式 GitHub Pages 已部署 commit `d7e41f2`。洪孟新期中案件首次載入及重新整理後均確認：會員洪孟新、專業別塗料雕塑藝術工程、主責曾敬為、陪訪陳奎翔、排定 2026-07-28 19:00，且會員欄位鎖定、無同步警示。
- 後續 commit `186e938` 已將既有案件草稿的會員、會談時間與指派資料依正式任務自動校正並同步回 Supabase；只修補已存在的草稿，不會因開啟空白表單而建立新草稿。
- 透過已連結專案執行唯讀 SQL 核對：`tasks.title` 與 `task_case_states.draft.member` 均為「洪孟新」，會談時間為 `2026-07-28T19:00`，草稿 revision 為 3。
- 完整驗證：35／35 測試通過、專案健檢 0 錯誤、PALMS 46／46 完全吻合。

## 2026-07-27 月會排定與案件一致性修復部署

- 原因確認：2026-07-21 建立的月會關懷排定早於 2026-07-24 Supabase 任務同步上線；月會 JSON 保留了「已排定」及舊瀏覽器案件編號，但正式 `tasks` 表從未建立該案件。`audit_logs` 也沒有任務刪除事件，因此不是搬移時刪除，而是舊本機資料未成功遷移造成的分離狀態。
- `app-api` 已部署為 version 15、狀態 `ACTIVE`、`verify_jwt = true`；月會保存會先核對並建立／連回 Supabase 任務，失敗時不保存不實的已排定狀態。
- 月會頁新增未結案舊草稿自動修復與任務快取刷新；前台不再信任沒有正式任務佐證的舊 `taskId`。
- 正式首次修復測試另發現 `edge_save_task` 的回傳欄位 `task_id` 與 `ON CONFLICT (task_id)` 產生 PostgreSQL 歧義；`20260727131500_fix_edge_save_task_ambiguity.sql` 已通過 dry-run 並正式 push，改用明確主鍵 constraint。
- 後續更新既有案件時再發現函式區域變數 `due_at` 與資料表欄位同名；`20260727133000_fix_edge_save_task_variable_ambiguity.sql` 已通過 dry-run 並正式 push，將全部區域變數統一改為 `v_` 前綴並限定資料表欄位。
- 正式頁面保留的失敗內容已在 migration 套用後自動重試；`taskSyncAlert` 消失且沒有新的瀏覽器同步錯誤，確認更新既有任務的交易路徑恢復。
- 正式頁面實測：7 月月會顯示「草稿已保存」，邱德晏特定關懷為「已排定」；工作台同步顯示「特定關懷・邱德晏／會員關懷已排定／主責：紀韻霓／原排定 7/22」，確認案件已由 Supabase API 返回。
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

## 2026-08-04 月度分析離會差異與假阻擋修正

- 上線前已離會但未遷入 Supabase 現任會員主檔的人員，改由月度分析差異確認流程建立 `departed` 歷史人員／會員紀錄；不會加入現任名單。
- 黃庭安、馬鼎鈞、林偉潔、楊秉諺及柳欽貿的本期「到期報告有、PALMS 無」差異已完成排除；正式引擎目前回傳 `reconciliation.ok = true`、`issues = []`、現任 43 人。
- `app-api` 已部署為 version 21、狀態 `ACTIVE`、`verify_jwt = true`；後端新增 fail-closed 防線，任何 `blocking` issue 都禁止產出、AI 審視與發佈。
- 修正前台成功重跑後仍殘留上一輪 blocking 文字：產出前與成功後清空舊訊息，並以 `.issues[hidden]` 確保隱藏狀態不被版面樣式覆蓋。
- 完整驗證：49/49 系統測試通過、專案健檢 0 錯誤、PALMS 官方回歸 46/46 完全一致；未修改計分公式與既有已完成案件／訪談資料。

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
