# 委員會工作進度指令部署紀錄

日期：2026-09-04

Supabase 專案：`fahrblkukuhgveiptufn`

版本：`v1.0.23`

## 已上線流程

- 正式會員委員群組內的文字訊息經 NFKC 正規化並去除前後空白後，必須完整等於 `委員會進度` 才會觸發。
- Webhook 每次觸發都重新讀取正式任期內尚未完成的任務、負責人、期限與案件流程，產生當下最新的工作摘要。
- 摘要透過當次 Webhook 的 Reply API 回覆原訊息，並使用 LINE `textV2` 真正標註 @所有人；不改用 Push API。
- 原工作台「發送委員會工作摘要」保留為 Push 備援，介面會明確提醒該操作計入 LINE 推播額度。
- 僅啟用中、正式用途且路由為 `committee` 的已驗證群組可觸發；私訊、測試群與其他群組不會觸發。

## Supabase 部署

- Migration `20260904160000_committee_work_digest_reply_command.sql` 已正式套用，local／remote 版本一致。
- 新增 service-only `committee_work_digest_reply_deliveries` 稽核表；`anon`／`authenticated` 無資料表權限。
- `line-webhook` 已部署並確認為 `ACTIVE` version 13，維持由程式驗證 LINE 簽章。
- 本功能不依賴 `app-api` 變更，因此本次未重新部署 `app-api`。

## 防重複與隱私

- 同一個 LINE Webhook 事件只允許一筆觸發紀錄；Webhook 重送不會再次回覆，同一群組日後新的指令仍可隨時觸發。
- 稽核表只保存雜湊、群組目標、事件／訊息 ID、時間與狀態，不保存指令原文、摘要全文、`replyToken` 或 `source.userId`。
- 目前系統刻意不建立 LINE 使用者 ID 與會員身分對照，因此正式委員群中的任何成員都能使用此指令。

## 驗證

- Node 全套測試：176 項通過、0 失敗。
- 專案與跨模組健檢：0 錯誤；20 項既有單行 CSS 格式提醒。
- BNI 分析回歸：46／46 逐人逐項完全一致。
- Supabase database lint：0 個 schema error。
- Migration dry-run 只列出本次檔案；正式套用後再次核對 local／remote 版本一致。
- 驗證期間沒有產生真實 LINE 群組事件，因此沒有發送測試訊息或消耗推播額度；端到端驗收由正式委員群輸入 `委員會進度` 完成。

## 使用提醒

- 可在指令前後輸入空白，但不能加稱呼、問號或其他文字；例如 `委員會進度？` 不會觸發。
- Reply API 的 `replyToken` 只能使用一次且時效短，因此 LINE 回覆逾時或失敗時只留下失敗稽核，不自動改用會計費的 Push。
