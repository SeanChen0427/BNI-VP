# 2026-07-20 Supabase 與前台上架作業紀錄

狀態：**後端與第一批正式資料已上線；正式前台尚未依最終決策部署至 GitHub Pages。**

本文件如實記錄 2026-07-20 的實際操作、驗證結果、錯誤繞路與後續清理事項。不得把暫時網址或未完成項目描述為正式上架完成。

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
- 第一版正式 schema 建立 26 個資料表、78 條 RLS policies 與 3 個 Private Storage buckets：
  - `raw-reports`
  - `case-files`
  - `case-confirmations`
- 後續錯誤繞路另建立 `web-app` 公開 bucket；該 bucket 只含前端程式與圖片，不含正式會員或 PALMS 資料，待 GitHub Pages 驗證後移除。

### Auth 與角色

- 建立三組 Supabase Auth 共用帳號：Admin、副主席、會員委員。
- 前台仍使用原本簡單名稱 `admin`、`vice`、`Fulian`，內部 Email 只供程式對接。
- `auth.js` 已移除寫死的原型密碼。
- 登入後以 `app_accounts` 與 RLS 再驗證角色。
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

- `assets/js/supabase-config.js`：Supabase 公開 URL 與 publishable key。
- `assets/js/auth.js`：Supabase Auth、角色驗證、token 更新、登出及逾時。
- `assets/js/supabase-data.js`：由 Supabase 讀取會員與已發布分析快照，攔截：
  - `/api/bni-analysis`
  - `/api/bni-monthly-attendance`
- `assets/js/member-directory.js`：會員姓名不再寫死於公開前端，由登入後的 Supabase 查詢取得。
- `member-care.js`、`attendance.js`、`settings.js`、`work-planner.js` 已等待線上會員名單載入。
- PALMS 教材 PDF 因 Supabase Storage 不接受中文物件鍵，檔名由中文改為 `palms-entry-guide-v1.0-20220505.pdf`；PDF 內容與畫面文案未改。

## 四、尚未完成的正式後端遷移

目前不能宣稱「所有功能都已可跨裝置正式使用」。以下功能仍依賴本機 `preview-server.mjs`、`localStorage`、IndexedDB 或 macOS 應用資料：

- 案件、任務、表單草稿與部分工作流程。
- 訪談 Word 附件。
- 會員委員會月會儲存。
- 每月資料上傳與分析草稿 API。
- 個人 AI Key 與 AI 對話代理。
- 離會登記、測試資料重置、公司統編代理。
- 出席、公告、課程進度等瀏覽器本機狀態。

正式上線仍需把這些資料層與 API 逐項遷移至 Supabase PostgreSQL、Private Storage 與 Edge Functions。

## 五、錯誤繞路與目前暫時資源

### OpenAI Sites

- 建立包裝專案：`apps/vice-chair-web/`
- Sites project ID：`appgprj_6a5de7d831f08191808a3455e3743a4d`
- 版本：1
- 部署 ID：`appgdep_6a5dee9ab77c8191ae5139b6d2a1cb8b`
- 網址：`https://fulian-committee.seankuichen.chatgpt.site`
- 原前台畫面與圖片均保留；曾產生一張不必要的登入預覽圖，之後已從專案及所有引用移除。
- 即使 access mode 設成 `public`，訪客仍須先使用 ChatGPT 登入，因此不適合作為會員正式入口。
- 待 GitHub Pages 上線驗證後，應移除或停用此暫時站點。

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
- 待 GitHub Pages 上線驗證後，移除：
  - `web-app` bucket 與其中公開前端物件
  - `site` Edge Function
  - migration／部署腳本是否保留作歷史證據，屆時另行決定

## 六、驗證結果

- 根目錄 `npm run check` 已通過。
- BNI regression 曾因 macOS 雲端檔案讀取延遲短暫失敗，重跑後 46／46 通過。
- Supabase 三角色 Auth／RLS／44 位會員／PALMS 快照驗證通過。
- Sites build、靜態資源及不嵌入會員姓名的測試通過。
- `scripts/verify-online-supabase.mjs` 已建立，但在 Sean 要求暫停並先討論架構後尚未執行。

## 七、安全紀錄

- 真實會員與 PALMS 未加入 GitHub 或公開前端 bucket。
- `npx supabase projects api-keys` 的 CLI 結果曾在本機 Codex 工具輸出中顯示 legacy `service_role` key；該 key 未寫入專案檔案，但正式交付前必須視為已暴露憑證並完成輪替／撤銷確認。
- 專案檔案僅保存 publishable key；service role、密碼與其他 secret 不得提交 GitHub。

## 八、下一步與清理順序

1. Sean 在 GitHub 完成登入。
2. 建立或連接正式 repository。
3. 只提交程式、migration、文件與去識別化測試資料。
4. 啟用 GitHub Pages，部署現成前台，不重做畫面。
5. 以三組帳號驗證 GitHub Pages → Supabase Auth → RLS → 會員與 PALMS。
6. 驗證完成後，移除 Sites 與 Supabase 的暫時前台託管。
7. 輪替本次工具輸出中顯示過的 legacy service role key。
8. 繼續把本機業務資料與 `/api/*` 遷移至 Supabase，直到可完全跨裝置使用。

