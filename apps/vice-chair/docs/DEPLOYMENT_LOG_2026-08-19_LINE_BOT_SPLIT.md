# LINE 雙 Bot 拆分部署紀錄

日期：2026-08-19  
Supabase 專案：`fahrblkukuhgveiptufn`  
LINE Provider：`Fulian`

## 固定發送邊界

- `committee`：只允許「會員委員秘書Bot」（`@930oijgp`）發送；涵蓋每月委員會提醒、每週工作摘要、案件回饋與投票通知。
- `attendance`、`leadership`、`exchange`：只允許「副主席秘書Bot」發送。
- 前端只顯示所屬 Bot 可用的用途；後端再次核對路由、群組所屬 OA 與 Token；資料庫 check constraint 阻擋交叉綁定。
- 兩個 Bot 使用不同 Channel Secret、Channel Access Token 與每月免費訊息額度。

## LINE 設定

- 「會員委員秘書Bot」已建立 Messaging API Channel，Channel ID 為 `2011167570`。
- 長效 Channel Access Token 已發行；Channel Secret 與 Token 只保存於 Supabase Edge Function Secrets：
  - `LINE_COMMITTEE_CHANNEL_SECRET`
  - `LINE_COMMITTEE_CHANNEL_ACCESS_TOKEN`
- Webhook URL 已設定為 `https://fahrblkukuhgveiptufn.supabase.co/functions/v1/line-webhook`，LINE Developers Verify 成功且 Use webhook 已啟用。
- 已允許 Bot 加入群組；自動回應與加入好友歡迎訊息均已關閉。

## Supabase 部署

- Migration `20260819090000_line_committee_bot_split.sql` 已正式套用，local／remote 版本一致。
- 已部署並確認為 `ACTIVE`：
  - `app-api` version 55
  - `line-webhook` version 6
  - `line-reminder-cron` version 4
- 無簽章 Webhook 請求回傳 HTTP 401 `Invalid signature`。
- 未帶 Cron Secret 的排程請求回傳 HTTP 401 `Unauthorized`。
- `app-api` 正式 CORS 預檢回傳 HTTP 200。

## 驗證

- `npm run check`：116 項測試全部通過。
- 專案健檢：0 錯誤，20 項既有 CSS 格式提醒。
- 跨模組健檢通過。
- BNI 分析回歸：46／46 完全一致。

## 尚待人工完成

- 若會員委員會群內已有「副主席秘書Bot」，先將它移出，再邀請「會員委員秘書Bot」加入。
- 在會員委員會群傳送任意一則普通訊息，讓 Webhook 發現群組。
- 由副主席／Admin 在系統設定將該目標核對為 `committee / production`，再執行一次真正 `@所有人` 的測試提醒。
- 設定兩個 OA 的第二管理者、Token 輪替責任與換屆交接流程。
