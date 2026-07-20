# 專案健檢報告

日期：2026-07-16

## 結論

目前約完成產品功能輪廓的七成，但工程成熟度仍屬高擬真原型。問題不是功能不足，而是規則、資料與畫面缺少穩定邊界；繼續直接疊功能會增加 AI 上下文、修改遺漏與除錯成本。

## 規模

- 13 個 HTML 頁面。
- 根目錄約 72 個 HTML／CSS／JS／MJS 檔。
- 前端與本機伺服器程式約 490 KB，不含 Word vendor。
- 16 份主題文件。
- 無正式 build、lint、format、type-check 流程。

## 高優先問題

### 1. 業務邏輯重複

案件階段、草稿 Key、回饋數與投票數曾分散於首頁、案件中心與通知中心。任何一處漏改，都會出現同一案件在不同頁面顯示不同階段。

處理：建立 `core/case-domain.js` 作為案件共用來源。

### 2. 文件存在雙份

根目錄的 `requirements-draft.md`、`decision-log.md` 落後於 `docs/` 版本，AI 若讀錯會使用舊規則。

處理：合併獨有內容後移除根目錄副本，只保留 `docs/`。

### 3. 程式可讀性差

至少 18 個程式或樣式檔高度壓縮成 1 至 4 行。這會讓 diff、定位、局部讀取與 AI token 使用都變差。

處理：第 1 階段導入標準 formatter，禁止再提交單行大型檔案。

### 4. 儲存分散

頁面直接操作 localStorage、sessionStorage、IndexedDB，沒有統一 schema 與 migration。Key 版本多且散落，正式後端整合時成本很高。

處理：先建立 `docs/STORAGE_SCHEMA.md`，下一階段抽出 storage service。

### 5. 原型安全不能直接上線

- 共用帳號與前端權限不能證明操作者本人。
- 正式會員名單不宜長期寫在前端檔案。
- localStorage 不能承擔正式敏感案件。

處理：正式發布前完成 Supabase、一人一帳號與 Private Storage。

## 中優先問題

- 表單 Word 產生邏輯重複。
- `preview-server.mjs` 負責太多服務。
- 課程仍保留舊版 `app.js` 與新版 `app-v2.js`。
- CSS override 檔案逐步增加，容易失去樣式來源。
- URL query、localStorage 與全域變數共同傳遞狀態，依賴關係不明。

## 本次安全整理

- 建立 AI 開發入口與機器可讀 manifest。
- 建立架構地圖與本機儲存 schema。
- 建立案件 domain 與純函式測試。
- 讓案件中心、首頁、通知與迴避門檻開始共用規則。
- 建立自動專案健檢腳本。
- 合併並移除重複規格文件。

## 暫不執行

- 不改 React。
- 不搬動所有檔案。
- 不清除任何現有 localStorage 草稿。
- 不修改 BNI 計分工具。
- 不建立 Supabase 正式資料庫。

這些工作應依 `docs/REFACTOR_ROADMAP.md` 分階段進行。
