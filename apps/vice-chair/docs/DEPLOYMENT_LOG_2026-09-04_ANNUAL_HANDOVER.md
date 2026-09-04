# 年度換屆與月會續約修正部署紀錄

日期：2026-09-04

Supabase 專案：`fahrblkukuhgveiptufn`

版本：`v1.0.21`、`v1.0.22`

程式提交：`707d46b`（續約修正、年度換屆與歷史保護）

## 上線內容

- 月會續約項目可記錄「確認不續約」而不建立工作；結案後會員恢復續約時，以追加更正保留原決議並建立新的追蹤工作。
- Admin 設定頁新增年度換屆預排，可先預覽、修改或取消下一屆完整名單與未來生效日。
- 同角色留任者的未完成工作不變；含卸任或轉任人員的未完成工作保留原指派並進入單一集中交接清單。
- 指派變動改以追加歷程保存。已結案任務、指派、敏感備註、流程狀態及 Word 索引由資料庫鎖定為唯讀。
- 正式環境沒有建立任何換屆排程；本次只部署工具、資料結構與保護規則。

## Supabase 部署

- 已套用 `20260904150000_annual_committee_handover.sql`。
- 已套用 `20260904153000_fix_annual_handover_schedule_ambiguity.sql`；只重建排程函式，修正 PostgreSQL lint 找到的 `plan_id` 名稱歧義，不讀寫業務資料。
- 第一支 migration 的首次嘗試因多函式授權清單語法失敗，交易完整回滾；修正後重新套用成功，沒有部分完成狀態。
- Edge Functions 已部署並確認為 `ACTIVE`：
  - `app-api` version 73，`verify_jwt = true`
  - `line-reminder-cron` version 7，`verify_jwt = false`，仍由既有 Cron Secret 驗證
- 正式資料庫 `error` 級別 lint：0 項錯誤。

## 正式資料不變證據

migration 前後以排除新增 `handover_*` 欄位的相同欄位集合計算匿名指紋，結果完全一致：

| 資料集 | 筆數 | 前後指紋 |
|---|---:|---|
| `committee_terms` | 7 | `3f96e9e0e7eb46a7743b521ceefdfea4` |
| `tasks` | 16 | `723e8e216de42da03ab8619b6a07b372` |
| `task_assignments` | 22 | `5f5a53c5413048b5995465e900e6bb7d` |
| `task_private_details` | 16 | `e974e3a37ce23ae61aa8c8a85aeb3695` |
| `task_case_states` | 16 | `6d5879f4bf36c15ce53909cc339e9106` |
| `task_case_files` | 10 | `e0db2e111f7389e83fe21bf0d3351e01` |
| `cases` | 4 | `f35b5291bdb94e1335588e00f2513466` |
| `case_assignments` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |

部署後再次純讀取確認：`committee_handover_plans`、`committee_handover_members`、`committee_handover_events` 與 `task_assignment_history` 均為 0 筆。沒有手動呼叫正式換屆套用函式；它只會在未來確有到期排程時由既有登入或背景排程觸發。

## 驗證

- Node 測試：176 項通過、0 失敗。
- 專案及跨模組健檢：0 錯誤；20 項為既有單行 CSS 格式提醒。
- BNI 分析回歸：46／46 逐人逐項完全一致。
- migration dry-run 每次只列出預期檔案；正式套用後 local／remote migration 一致。
- 閏年任期截止日以純讀取查詢驗證：`2028-02-29` 生效的一年任期截止於 `2029-02-28`。

## 換屆啟用提醒

- Sean 確認下一屆完整名單與生效日後，才由 Admin 進入「系統設定 → 年度換屆預排」操作。
- 儲存前必須看完影響預覽；生效前仍可修改或取消。
- 密碼更新與名單換屆相互獨立。舊副主席卸任後改用 Admin 帳號，新任副主席使用副主席共用帳號並選擇自己的姓名。
- 生效後若首頁出現「換屆待指派」，新任副主席／Admin 應一次完成全部工作接手；不可刪除舊委員或已結案案件來代替交接。
