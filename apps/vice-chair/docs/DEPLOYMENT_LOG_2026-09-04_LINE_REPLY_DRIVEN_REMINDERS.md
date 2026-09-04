# 交流群回覆驅動提醒部署紀錄

日期：2026-09-04

Supabase 專案：`fahrblkukuhgveiptufn`

版本：`v1.0.20`

## 已上線流程

- `weekly_meeting_alarm` 與 `monthly_data_entry` 的設定時間改為「最晚送達時間」，系統自前 12 小時開始建立交流群待發窗口。
- 窗口內任一群組新訊息可提供當次 `replyToken`；副主席秘書Bot立即用 Reply API 回覆原提醒並真正標註 @所有人，Reply 成功才記錄為送達。
- Webhook 不讀取觸發訊息內容或 `source.userId`；`replyToken` 只在同一次請求即時使用，不寫入資料庫。
- 窗口未命中時不再 Push 原提醒到交流群；副主席秘書Bot改用一次 Broadcast API 請求，向全部可送達好友依序送出「人工處理說明」與「原提醒全文」兩則訊息。
- 好友 Broadcast 成功只記為 `fallback_notified`；副主席／Admin 人工貼至交流群並確認後，才記為 `manual_delivered`。若 Broadcast 最終失敗或排程逾期，工作台也保留相同人工補救入口。
- 會員委員秘書Bot的月會提醒與每週工作摘要維持既有直接 Push，不受本次變更影響。

## Supabase 部署

- Migration `20260904090000_line_reply_driven_reminders.sql` 已正式套用，local／remote 版本一致。
- 新增 service-only `pending_announcements`，並為 `line_group_targets` 新增 `delivery_strategy` 與 `opportunistic_window_minutes`。
- `anon`／`authenticated` 對待發表無資料表權限；只允許 Edge Function 的 `service_role` 讀寫。
- 已部署並確認為 `ACTIVE`：
  - `app-api` version 72
  - `line-webhook` version 12
  - `line-reminder-cron` version 6
- 無簽章 Webhook、未帶 Cron Secret 的排程請求、未登入的工作台 API 請求，均回傳 HTTP 401。

## 防重複與停用保護

- 同一提醒、交流群、當地排程日只允許一筆排程待發紀錄。
- Webhook 先以 `pending → replying` 原子性佔位，同一請求最多處理一筆待發提醒；事件 ID 防止重送造成重複回覆。
- Broadcast 使用持久化 `X-Line-Retry-Key`，失敗最多重試三次。
- 停用提醒、停用交流群或更換群組時取消尚未投遞的待發項；執行好友備援前再核對提醒與交流群仍有效。

## 驗證

- Node 全套測試：166 項通過、0 失敗。
- 專案與跨模組健檢：0 錯誤；20 項既有單行 CSS 格式提醒。
- BNI 分析回歸：46／46 逐人逐項完全一致。
- migration dry-run 只列出本次檔案，正式套用後再次核對 local／remote 版本一致。
- 三個 Edge Functions 均由 Supabase server-side bundling 成功部署。
- 驗證期間沒有呼叫帶 Secret 的 Cron、沒有偽造有效 Webhook，也沒有按工作台測試鈕，因此沒有發送任何 LINE 測試訊息或消耗推播額度。

## 使用提醒

- 交流群的「建立 15 分鐘回覆測試」會等待下一則真實群訊息；命中後會真的 Reply 並 @所有人。15 分鐘未命中即結束，不會執行好友 Broadcast。
- 正式 12 小時窗口未命中時，所有仍是副主席秘書Bot好友且未封鎖的帳號都會收到 Broadcast；目前若只有副主席與管理者兩位可送達好友，該次預計計入 2 則。
- 好友收到的第二則訊息就是原提醒全文；貼到交流群前仍需人工標註 @所有人。
