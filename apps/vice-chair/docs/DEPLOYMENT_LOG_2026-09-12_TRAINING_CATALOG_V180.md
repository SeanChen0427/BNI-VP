# 2026-09-12｜v1.8.0 官方培訓課程庫與查詢

狀態：正式課程資料庫、API、每日排程與 GitHub Pages 已啟用。

## 功能

- 主選單新增「培訓課程查詢」，三角色均可開啟。
- 搜尋課名並搭配本月、下月、未來 12 個月、今年／明年全年、指定月份及自訂起訖日；搜尋保留所選範圍。
- 課表同步今年＋明年；官方 ID 去重，異動保留前後版本。官網暫未列出標示待確認，同步失敗保留既有資料。
- 既有會員表單日期、報名、出席、完成資格與 PALMS 不在本次資料異動範圍。

## 部署證據

- 功能提交：`582f059c4525fb12d506fc3c5f6cf876f5fcccf4`。
- GitHub Pages：[成功發布](https://github.com/SeanChen0427/BNI-VP/actions/runs/34673915818)。
- 正式入口：<https://seanchen0427.github.io/BNI-VP/training-catalog.html>。
- migration：`20260912100000_training_catalog.sql`，僅新增課程三表及專用同步函式。
- `app-api` 版本 85、ACTIVE、JWT 驗證啟用；`training-catalog-cron` 版本 2、ACTIVE，以專用 `x-cron-secret` 驗證。
- `training-catalog-daily` 已啟用，UTC 22:00／Asia/Taipei 06:00 每日一次；Secret 保存在 Edge Secrets 與 Vault，不進 Git。
- 首次經排程相同呼叫路徑執行，HTTP 200：收到／新增 137 場，異動 0、暫未列出 0；2026、2027 都完成查詢，2027 回傳空陣列。
- 正式資料表與同步 RPC 的 authenticated 直接存取權限皆為 false；未登入 app-api、未帶密鑰的 cron 均為 401。

## 驗證與限制

- 完整 `npm run check`：301 項測試全部通過；專案稽核 0 錯誤，20 項既有 CSS 格式化提醒；BNI 官方回歸 46／46 逐人逐項一致。
- 隔離 PostgreSQL 驗證首次匯入、冪等、改期前後歷程、缺漏、恢復、異常下降、租約、整筆回滾及權限。
- 瀏覽器驗證：本月 14 場、下月 10 場、今年全年搜尋「MSP 下」12 場、自訂 9 月 14 場；390px 手機無橫向溢出。
- 正式頁面、JS、CSS、共用領域、導覽、更新紀錄、首頁及登入路由共 8 份檔案與發布產物 SHA-256 一致。
- 舊本機建置憑證及先前共用密碼皆未能完成正式登入，因此三角色已登入的線上端到端操作未驗收；角色 API 行為以自動化測試覆蓋。未變更 Auth、帳密或會員角色資料。
- 復原鏡像：Git 忽略的 `apps/vice-chair/data/training-catalog/current-mirror.json` 指向完整三表匯出，137 場及 137 筆首次新增歷程均與正式資料對上。

## 發布隔離

本機主工作目錄原有未完成的首次提交與其他未提交修改。此次由正式 main 建立獨立發布目錄，先核對本次修改檔案的原始內容與正式版本一致，再只帶入本次功能及日期化紀錄；未重設原工作目錄的 index，也未把既有其他治理修改一併發布。
