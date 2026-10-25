# 2026-10-25 續約 V1.1 同案雙文件

來源：Sean 指定兩份中心區 V1.1（20261012）原檔，確認先會員共同訪談、再委員內部評估、再回饋；同一案件保存，兩份 Word 分開下載回傳中心區。

## 發布準備與驗證

- 產品版本依「新增流程／頁面」分類為 feature，從 v1.8.16 升 v1.9.0。既有舊案保留原件與已進行流程，未完成訪談改用新版。
- 新版會員訪談與內部評估分為 `terminal-form.html`、`renewal-assessment.html`，共同控制器 `assets/js/renewal-form.js`。第一頁不呈現內部評估答案與地基編輯；第二頁由受指派人員或領導角色使用，本人迴避。
- `task_case_files.documents` 保存兩份獨立物件描述；訪談仍為主附件。評估綁定訪談檔 SHA-256 與填答指紋，兩份均成功保存且與目前填答一致才可回饋；回饋呼喚建立後鎖定文件。重產前索引留在私密歷史，刪案清理涵蓋全部版本。
- 本次 SQL 只新增 JSONB 欄位，使用 CLI `db query --linked` 執行單一檔案，不執行 db push、不重播歷史 migration；此手動補丁沒有 CLI migration ledger 紀錄。
- 正式欄位新增前後：tasks 25、task_case_states 25、task_case_files 22；新增索引 0。欄位為 JSONB、NOT NULL、預設 `{}`，沒有修改正式案件內容。
- Sep23 來源 guard 對照：`edge_apply_due_committee_handoffs` 定義 MD5 `5469c251996305c4d7099a15891886a0`；RESTRICTIVE policy `chair_boundary_source_analysis` 條件 MD5 `791c80daf59798d3ee6995ff31f76693`。部署前後須相同。
- 完整 `npm run check`：366 項測試通過，零失敗／略過；工作台及跨模組稽核零錯誤、19 項既有 CSS 格式提醒；BNI 官方回歸 46／46。Pages 打包 203 檔，未含私密模板／原始 Word／會員資料。
- 本機 Chrome 三角色合成案例全部通過：實際模板產檔、獨立附件保存、訪談 → 內部評估 → 回饋、重新開啟、桌機及 390px 手機寬度。沒有建立／寫入正式測試案件。
- 原文件各 14 個 OOXML 部件；四份正常／長答案合成輸出均只有 document.xml 變動，其他 13 個部件逐位元一致。正式版保留頁首所需空間與簽名日期連續性，內部評估改沿文流表格；正常訪談 4 頁／評估 2 頁，長答案訪談 5 頁／評估 2 頁均逐頁視覺核對，沒有截字。
- 私密復原證據存於專案外 `/private/tmp/fulian-renewal-20261025/`；原 DOC、核對轉換及模板另保存於既有使用者 Application Support 表單目錄，不提交 Git。

## 私密來源及模板雜湊

| 文件 | 原 DOC SHA-256 | 私密模板 JSON SHA-256 |
|---|---|---|
| 會員續約訪談 V1.1 | `7113a0e133dea14c044a1b6ccd653175d2c469a0cdbcdf5be54f8700560e6214` | `51e4e2bd022284b172f029cdf1871ea8010cb4c6a6158c5fb72f6a1680f813dc` |
| 委員會內部評估 V1.1 | `e7f7116b594f5959ddb8d4a6c814f55a446df933a6a9a9193e8d85e428fc30dd` | `008ce9e8362bf3e86d0c5cb14cfac36a07724a55d567595ab77daf06f5717961` |

正式發布與線上核對結果接續記錄於下方。既有正式共用帳密在上一輪登入驗收回覆 invalid_credentials，本次未重試失效帳密、建立帳號或重設密碼；不得把本機三角色合成驗收冒充正式三角色登入驗收。

## 後端部署結果

- 私密模板兩份由 CLI 回讀後，SHA-256 均與上表完全相同。
- 單一欄位已套用，原案件筆數與文件索引不變；來源 handoff guard 與 restrictive RLS 條件雜湊前後完全相同。
- Supabase `app-api` 已從 v93 部署為 v94，狀態 ACTIVE、verify_jwt=true；沒有修改 Auth 帳號或正式案件。
