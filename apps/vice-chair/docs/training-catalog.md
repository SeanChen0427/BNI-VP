# 官方培訓課程庫與查詢

需求來源：Sean，2026-09-12。部署狀態：2026-09-12 正式課程資料庫、API 與每日同步已啟用；前端也已發布；詳見 [v1.8.0 部署紀錄](DEPLOYMENT_LOG_2026-09-12_TRAINING_CATALOG_V180.md)。

## 查詢

- `training-catalog.html` 為三角色共用查詢頁；工作台與共用導覽提供入口。
- 本月、下月、未來 12 個月、今年全年、明年全年、指定月份、自訂日期（包含結束日），可搭配課名及類別。輸入課名不重設已選範圍。
- 預設從今天起往後 12 個月，末日不含週年當日。所有時間使用共用 `calendar-domain.js` 的 Asia/Taipei 計算。
- 每場提供官方名稱、日期、開始／結束時間及詳情連結；分類依名稱整理，不宣稱是官方的原始分類。地點、費用、名額及報名資格仍在官方詳情頁確認。
- 尚未同步、查詢期間未涵蓋、官方尚未公布、搜尋無結果、舊資料及讀取失敗分別顯示。

## 正式資料與 API

- 來源：`https://bnikaohsiung.com.tw/zh-TW/events` 公開行事曆；沿用頁面公開的 `cmsViewEventsCalendarJson` 介面，regionIds=7731。
- `training_events`：官方 ID、名稱、台北時區轉換後的起訖時間、來源連結、分類、來源狀態、版本與首次／最後觀測時間。
- `training_event_changes`：追加式保存新增、異動、官網暫未列出及恢復，包含前後場次快照。
- `training_sync_state`：最後嘗試／成功時間、同步年度、筆數、錯誤與三分鐘執行租約。
- 資料表均開啟 RLS 且不授權 anon／authenticated 直接存取；透過 app-api 驗證有效三角色後讀取。`GET /api/training-catalog` 回傳 `fulian.training-catalog.v1`，供本頁及新會員／續約訪談表單共用。
- `POST /api/training-catalog`，`{"action":"sync"}`，只允許副主席／Admin。五分鐘共用冷卻與資料庫租約防止重複執行。
- 新會員與續約訪談可選官方場次並帶入日期，詳見下方表單選課契約。會員異動通知、手動自辦課程與報名／出席紀錄仍未納入。

## 同步與資料保護

- 專用 Edge Function：`training-catalog-cron`。每日台北時間 06:00（UTC 22:00）檢查今年與明年。
- 官網每年度最多重試一次，兩年度都完整成功才進入資料庫交易。下一年度空陣列可代表未公布；原本有場次的年度突然全空或減少超過一半時停止更新。
- 同 ID 更新原場次並保存前後版本，未變動不新增歷程；本年度查不到的舊場次標示 `missing`，不刪除，也不等同取消。已超出同步年度的歷史保留原樣。
- 交易錯誤全部回滾，過期租約不能覆蓋新執行結果。抓取失敗保存固定錯誤訊息，不回傳外部內容或秘密資訊。
- 公開課表不代替報名／簽到／完成證明，不修改會員資格、MSP 判定或 PALMS。
- 日常正式來源為 Supabase。本機預覽頁也透過既有 Supabase transport 讀取正式 API；測試只使用隔離記憶體或公開課表，不建立第二份可人工修改的正式來源。

## 啟用與維運

1. 完整執行 `npm run check`，再套用 `20260912100000_training_catalog.sql`。
2. 部署 `app-api`（保留 JWT 驗證）與 `training-catalog-cron`（由專用 `x-cron-secret` 驗證）。
3. 設定 Edge Secret `TRAINING_CATALOG_CRON_SECRET`，同值存入 Vault `training_catalog_cron_secret`；函式網址存入 Vault `training_catalog_cron_url`。不重用 LINE 密鑰。
4. 建立 `training-catalog-daily`，UTC `0 22 * * *`，呼叫 `private.invoke_training_catalog_sync()`。migration 本身不在 Secret 未設定前啟動排程。
可用 `scripts/configure-training-catalog-cron.mjs --apply` 建立專用密鑰與排程；CLI 路徑以 `SUPABASE_CLI_PATH` 指定，密鑰不輸出、不入 Git。

5. 執行首次同步，核對年度、筆數與最後成功時間，再發布前端。若需暫停，停用該 Cron job；保留課表與歷程。
6. 私密復原匯出應一併保存上述三表與本次 migration 版本。部署後的首次完整匯出與核對證據保存在 Git 之外。

## 驗證

- Node 測試：跨年、日期、搜尋／自訂期間、公開來源驗證、重試上限、兩年度完整提交、權限與 API 分頁。
- `scripts/verify-training-catalog-sql.mjs`：透過 `PGLITE_MODULE_PATH` 指定測試套件，在全新記憶體 PostgreSQL 驗證冪等、改期、缺漏、恢復、異常下降、租約、交易回滾及權限；不連線正式資料庫。
- 瀏覽器驗證使用官網 2026 年 137 場、2027 年 0 場的公開回應；本月 14 場、下月 10 場，全年搜尋 MSP 下 12 場，自訂 9 月 14 場；手機無水平溢出。

## 本次正式核對

2026-09-12 首次透過排程使用的資料庫呼叫路徑執行，HTTP 200：收到／新增 137 場、異動 0、缺漏 0。同步年度為 2026、2027；2027 目前官方未公布場次。`training-catalog-daily` 已啟用，UTC 22:00 等同台北時間 06:00。

三表的首次復原鏡像及 SHA-256 核對索引保存於 Git 忽略的 `apps/vice-chair/data/training-catalog/`。`current-mirror.json` 指向完整官方課表、異動歷程與同步狀態；與正式查詢筆數相符。

## 訪談表單選課（2026-09-12，v1.8.2）

- 新會員：MSP（上）、MSP（下）、新會員交流座談會首選與備選；續約：MSP（上）、MSP（下）。既有規範與必修判定不變。
- 選單依類別顯示課表內所有尚未開始、官方仍列出的場次（含明年已公布課程），按時間排序；選擇後帶入台北日期。亦可保留手動填寫。
- `core/training-selection-domain.js` 管理場次快照、篩選與異動比對，`assets/js/training-picker.js` 供兩表共用；每次開啟表單只讀取一次既有課表 API，不觸發官方同步。
- `task_case_states.draft.trainingSelections` 以原日期欄位 ID 為鍵，保存 `{id,title,start_at,end_at,category}`；原日期欄位仍保存 YYYY-MM-DD。舊草稿不推測場次。手改成其他日期即解除場次關聯，選擇手動模式則保留日期。
- 重開表單比對官方最新資料；改期／改名提示並提供人工採用最新時間，暫未列出提示確認，已選過去場次仍顯示。讀取失敗保留選課及日期，提示手動填寫。
- 正式 Word 仍輸出原表單日期，操作提示、課表狀態不進入 Word。選課不構成報名、出席或完成紀錄。
