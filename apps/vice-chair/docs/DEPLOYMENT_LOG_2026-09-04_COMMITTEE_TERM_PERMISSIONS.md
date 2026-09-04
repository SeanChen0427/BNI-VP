# 委員任期直寫收權部署紀錄

日期：2026-09-04

Supabase 專案：`fahrblkukuhgveiptufn`

版本：`v1.0.25`

程式提交：`ff0e5eb`（限制一般登入直接寫入委員任期）

## 上線內容

- `committee_terms` 對 `authenticated` 只保留 `SELECT`，收回 `INSERT`、`UPDATE`、`DELETE` 及其他寫入型權限。
- 移除早期允許 Admin／副主席直接新增、修改任期的兩支 RLS policy。
- `service_role` 保留 `SELECT`、`INSERT`、`UPDATE`，Admin-only 年度換屆 API 與到期自動生效函式維持原流程。
- 本次只收緊 `committee_terms`；未變更 `people`、`members` 或其他業務資料權限。

## 正式驗證

- Migration `20260904180000_lock_committee_term_writes.sql` dry-run 只列出本次一支檔案，正式套用成功且 local／remote 版本一致。
- 正式資料庫 ACL 純讀取查詢結果：
  - `authenticated`：`SELECT = true`，`INSERT = false`，`UPDATE = false`，`DELETE = false`。
  - `service_role`：`INSERT = true`，`UPDATE = true`。
  - `committee_terms` 寫入型 RLS policy：0 支。
- 正式資料庫 `error` 級別 lint：0 項錯誤。
- GitHub Pages workflow `33885902582` 成功，正式站已載入 `v1.0.25` 更新說明。

## 資料安全邊界

- Migration 只變更 policy、GRANT 與資料表註解，不含任何業務資料的 `INSERT`、`UPDATE` 或 `DELETE`。
- 部署後純讀取確認仍為 7 筆有效任期、0 筆結束任期及 0 筆待生效換屆排程。
- 沒有建立換屆排程，也沒有修改現任／歷史任期、案件、任務、附件或指派歷程。
- 一般登入姓名與角色仍由 `committee_terms` 唯讀載入；不增加日常操作按鈕。

## 自動驗證

- Node 全套測試：184 項通過、0 失敗。
- 專案與跨模組健檢：0 錯誤；20 項為既有單行 CSS 格式提醒。
- BNI 分析回歸：46／46 逐人逐項完全一致。
