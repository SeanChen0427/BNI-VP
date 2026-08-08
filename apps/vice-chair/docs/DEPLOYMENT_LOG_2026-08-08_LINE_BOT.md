# LINE Bot 測試群串接部署紀錄

日期：2026-08-08  
專案：Supabase `fahrblkukuhgveiptufn`  
階段：LINE Secrets、Webhook、四群組用途管理、點名實送、交流群常態通知後端與 GitHub Pages 均已完成；兩條提醒維持關閉，等待交流群指定與人工測試。

## 已部署

- Migration：`20260808113000_line_attendance_delivery.sql`
  - 新增 service-only `line_group_targets`。
  - 新增 service-only `attendance_line_deliveries`。
  - 啟用 RLS，`anon` 與 `authenticated` 無資料表權限。
  - 同一點名週次、群組、公告 SHA-256 指紋只允許一筆發送紀錄。
- Edge Function：`app-api`
  - 保留 Supabase JWT 驗證。
  - 僅副主席／Admin 可核對測試群與發送公告。
  - 僅讀取資料庫中已確認的 `announcement_snapshot`，不接受前端公告文字。
  - 透過 LINE `X-Line-Retry-Key` 與資料庫唯一鍵降低重複發送。
- Edge Function：`line-webhook`
  - Supabase JWT 關閉，供 LINE 平台公開回呼。
  - 必須以 `LINE_CHANNEL_SECRET` 驗證原始 request body 的 HMAC-SHA256 `x-line-signature`。
  - 只保存群組 ID、時間與加入／離開狀態，忽略群組聊天內容。

## 2026-08-08 後續設定

- 已將 `LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN` 直接寫入 Supabase Edge Function Secrets，未寫入程式碼或 GitHub。
- LINE Developers 已填入正式 Webhook URL並啟用 Use webhook。
- 依 Sean 最新決策擴充三個用途槽位：每週出席公告、會員委員會通知、三長／董顧通知；由副主席／Admin 在設定頁確認群組。
- Migration `20260808124500_line_group_routing.sql` 已套用；更新後的 `app-api` 與 `line-webhook` 已部署。
- 公開 Webhook 以偽造簽章實測回傳 HTTP 401 `Invalid signature`，確認函式上線且簽章防護生效。
- 首次發布後發現 `app-api` 內既有二進位 `sha256` 與新增文字指紋函式同名，造成 Edge Function `BOOT_ERROR`；已將新增函式改名為 `sha256Text`、加入重複宣告回歸檢查並重新部署。正式 OPTIONS 健康檢查已恢復 HTTP 200。

## 正式測試結果

- LINE Webhook 已成功發現群組「公告群（測試）」。
- 副主席設定頁已將該群組啟用為「每週出席公告／測試群」；目前啟用 1/3 個用途槽位。
- GitHub Pages 已發布設定頁群組管理功能與出席頁「發送到 LINE 公告群」按鈕。
- 以 2026-08-04 已鎖定的公告快照完成第一次 LINE Bot 實送。
- 遠端資料庫唯讀查核顯示 `attendance_line_deliveries` 有 1 筆 `sent`，無 `failed`；發送時間為 2026-08-08 02:08（Asia/Taipei）。
- 重複操作仍受公告 SHA-256、資料庫唯一鍵與 LINE retry key 三層保護。
- 後續依 Sean 驗收補上 LINE `textV2` 全群 mention；公告會真正通知「@所有人」，且格式版本已納入防重複指紋，可與第一次未 mention 的測試紀錄區分。
- 新版已部署並以同一份 2026-08-04 鎖定快照完成第二次實送；LINE API 接受訊息，遠端稽核累計 2 筆 `sent`、0 筆 `failed`，新版發送時間為 2026-08-08 02:20（Asia/Taipei）。
- 停用後重新指定流程已修正：人工停用且 Bot 仍在群內的目標會保留為可重新啟用；Webhook 已收到離群事件的目標則不開放指定。
- 正式設定頁已完成「停用 → 重新啟用」實測；「公告群（測試）」已恢復為 `attendance / test / active`，目前啟用 1/3 個用途。
- LINE Official Account Manager 已關閉「自動回應訊息」及聊天，Webhook 保持開啟；群組一般訊息不再自動回覆，不影響群組發現或系統主動推送。

## 交流群常態通知（已發布）

- 新增第四個 `exchange` 群組用途與獨立 `routine-reminders.html` 管理頁。
- 新增 `line_reminder_rules`、`line_reminder_deliveries` 及 `line-reminder-cron` Edge Function；排程請求須驗證 `LINE_REMINDER_CRON_SECRET`。
- 每週一例會鬧鐘提醒與月底最後一次例會前 Key in 提醒初始均為關閉；預設週二例會、提前 1 天、20:00，只供頁面初始值，未經副主席保存並啟用不會發送。
- Migration `20260808170000_line_recurring_reminders.sql` 已套用；`app-api` 與 `line-reminder-cron` 已部署。
- `LINE_REMINDER_CRON_SECRET` 已以同一隨機值分別保存於 Edge Function Secrets 與 Supabase Vault，未寫入程式碼、migration、終端紀錄或 GitHub。
- `line-recurring-reminders` Cron 已建立並啟用，每 5 分鐘呼叫一次排程函式；不帶 secret 的外部 POST 實測為 HTTP 401。
- 以 Vault secret 手動觸發正式排程路徑回傳 HTTP 200、`checked: 0`、`sent: 0`，確認目前兩項規則關閉且尚未指定交流群時不會誤發。
- 正式資料庫查核：提醒規則 2 條、啟用 0 條、有效 Cron 1 條、有效 Vault secret 1 筆。
- 尚待使用者操作：邀請 Bot 進交流群、在群內傳一則普通訊息、於設定頁指定「交流群常態通知」，再從常態通知頁測試、調整時間並啟用。

## 驗證結果

- `npm run check`：通過。
- Node 自動測試：73 項通過。
- 專案健檢：0 錯誤，19 項既有單行 CSS 格式提醒。
- BNI 分析回歸：46/46 逐人逐項完全一致。
- `supabase db push --dry-run`：僅列出本次 LINE migration。
- 正式 `db push`：migration 已套用；CLI 因本機無 Docker 無法快取 pg-delta catalog，但遠端回傳 `Finished supabase db push`，不影響已套用結果。
- `app-api`、`line-webhook` 均以 server-side bundling 部署成功。
- GitHub `main` 已發布；提交：`bf74908`（LINE 群組路由）、`6c9bcb8`（修復 app-api 啟動衝突）。
