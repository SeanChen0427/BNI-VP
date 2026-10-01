# 2026-10-01 跨屆結案回饋鎖定修正

版本 v1.8.11，分類 fix。Sean 在 v1.8.10 上線後實際結案，回報「回饋者不是當期有效投票成員」。前次只修正頁面名單，未涵蓋資料庫結案鎖定回饋的驗證；本次補齊後端。

## 原因與修改範圍

`edge_save_case_state_as_user` 驗證新任操作者後呼叫結案交易；交易先更新既有 `case_feedback.locked_at`，但 `private.validate_feedback_write` 對這個純鎖定也檢查作者的現任資格，造成卸任作者使整筆交易回滾。

本次只替換 `private.validate_feedback_write()`：未結案、未鎖定的既有回饋，只在登入角色為副主席／Admin，且全列除 `locked_at` 與系統自動更新的 `updated_at` 外完全相同時，允許原樣鎖定。其他內容修改、作者／案件更換、一般委員或未知角色、已鎖定及已結案資料維持拒絕；新增與修改回饋仍檢查現任資格及本人迴避。

沒有修改結案前置條件、票數、案件狀態、回饋、角色、RLS、函式權限或換屆函式；沒有代替使用者結案、建立正式測試案件或發送通知。

## 實際資料庫驗證

- 使用 PGlite 隔離 PostgreSQL，載入既有驗證 trigger、結案交易與身份包裝函式；先重現卸任作者導致結案失敗並確認整筆回滾。
- 套用修正後，31 項 SQL 檢查通過，涵蓋副主席／Admin 完成交易、任務及投票快照關閉、回饋作者／代填者／原文／提交時間不變、一般委員與其他角色拒絕、過期身份、revision 衝突、新增／編輯資格、本人迴避、已鎖定與已結案不可更動、RPC 權限。
- 完整 `npm run check`：339 項通過／0 失敗；稽核 0 錯誤、19 項既有格式改善提醒；BNI 官方回歸 46／46 一致。

## 正式套用與回讀

- 使用 [單一 apply](../../../supabase/manual-deployments/20261001-feedback-closure/001-feedback-closure.apply.sql)；只執行本次 DDL，不重放歷史 migration，不執行 `db push`，未更新 CLI migration ledger。
- 原函式 body MD5：`0deba6c1f317d5b92309b09fc800e500`；新函式：`ed8b9f37de114b7eb8f2d7edab74385a`。交易內先比對原函式與六個依賴函式指紋，套用後再比對。
- 八張業務表（回饋、票、投票快照、資格快照、案件、任務、案件狀態與任期）前後雜湊一致。owner、ACL、SECURITY DEFINER 與空 search_path 不變；換屆 guard MD5 保持 `a492d816864f38014f7e1be613034f50`。
- 提交後使用 [獨立唯讀 verify](../../../supabase/manual-deployments/20261001-feedback-closure/001-feedback-closure.verify.sql) 查回 `patch_matches=true`、正確新函式雜湊與原有執行權限。
- [緊急程式 rollback](../../../supabase/manual-deployments/20261001-feedback-closure/001-feedback-closure.rollback.sql) 先核對新函式雜湊再還原原定義，不改業務資料。
- 正式資料僅做唯讀盤查及 DDL 前後指紋核對；完整結案寫入驗證在隔離資料庫執行，實際案件由副主席再按結案。
