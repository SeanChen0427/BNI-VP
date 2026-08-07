# LINE Bot 測試群串接部署紀錄

日期：2026-08-08  
專案：Supabase `fahrblkukuhgveiptufn`  
階段：LINE Secrets 與 Webhook 已設定；正在升級三群組用途管理，等待假公告群事件、實送及前端發布。

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

## 尚未完成

- 已先將 LINE 官方帳號加入假公告群；Webhook 啟用後需在群內再發一則訊息，才會產生可核對的群組事件。
- GitHub Pages 尚未發布本次 LINE 按鈕，等待後端與假群驗證後再發布。

## 驗證結果

- `npm run check`：通過。
- Node 自動測試：73 項通過。
- 專案健檢：0 錯誤，19 項既有單行 CSS 格式提醒。
- BNI 分析回歸：46/46 逐人逐項完全一致。
- `supabase db push --dry-run`：僅列出本次 LINE migration。
- 正式 `db push`：migration 已套用；CLI 因本機無 Docker 無法快取 pg-delta catalog，但遠端回傳 `Finished supabase db push`，不影響已套用結果。
- `app-api`、`line-webhook` 均以 server-side bundling 部署成功。
