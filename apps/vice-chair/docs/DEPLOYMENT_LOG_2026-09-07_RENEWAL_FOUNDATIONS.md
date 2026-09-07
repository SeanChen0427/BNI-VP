# 2026-09-07 續約地基追蹤正式部署

來源：Sean 明確授權推上正式系統試用，若不合用再修改或回復。

## 正式版本與部署次序

- 前版：Git `96703f7c6cac95cd878d3dda7d58486b511f7866`，產品 v1.1.3，app-api v75。
- 新版：產品 v1.2.0，功能提交 `3f16d267917f9b3f976301abb4932a166c7a0c44`。
- 先套用 `20260907090000_renewal_foundation_tracking.sql`；dry-run 只列本支，套用後再次 dry-run 無待套用 migration。只新增地基與事件表及受保護交易函式，沒有改寫會員、案件或會籍。
- 再發布 app-api v76：狀態 ACTIVE，保留 `verify_jwt=true`；未發布其他 Edge Functions。
- 最後推送 main，GitHub Pages [34106945011](https://github.com/SeanChen0427/BNI-VP/actions/runs/34106945011) 成功。正式入口：[續約地基追蹤](https://seanchen0427.github.io/BNI-VP/renewal-foundations.html)。

## 驗證與限制

- 部署前完整 `npm run check`：242 項成功、0 失敗；稽核 0 錯誤，原有 20 項 CSS 格式提醒；BNI 官方逐人逐項 46／46 一致。
- 公開前端產物準備成功，164 個檔案。正式 HTML、地基 JS、訪談整合 JS、CSS 與 release-notes 逐檔比對本次來源一致。
- 現有副主席登入頁面成功載入正式空清單、補登入口、在籍會員與追蹤人選單；開啟後取消表單，未儲存測試資料。匿名地基 API 回應 401。
- 本機舊 bootstrap Admin 登入憑證回應 400，因此三角色自動登入驗收未完成；未修改或重設帳密，改以使用者已登入的副主席頁面驗證。Admin／委員正式登入驗收仍待補做，權限與資料交易的去識別化測試已通過。
- 公開 repository 掃描仍指出三份原有歷史文件包含會員姓名。逐檔與部署前 HEAD 核對，命中數均未增加；本次沒有新增真實個案資料或 Secret。歷史去識別化另依文件治理處理，不將此掃描宣稱為全數通過。
- 正式個案尚未建檔；本機私密 intake 不等於正式地基資料。沒有為測試建立、修改或刪除任何真實會員及地基紀錄。

## 回復方式

1. 以新 commit 回復本次功能前端及 app-api 相關變更，再發布 Pages；避免 force push 或重設後續正常提交。
2. 如需回復後端，使用上述前版 Git 的完整依賴重新部署 app-api。先回復前端，再回復後端，避免新表單呼叫不存在的路由。
3. 保留新增資料表與全部地基、提醒及事件資料；不執行 drop table、清表或覆寫會員資料。再次啟用功能時可接續原紀錄。

本機保留 `/private/tmp/fulian-pre-v1.2.0` 的前版 Git 程式副本。CLI 直接下載舊 Function 因跨目錄分析核心依賴的抽取路徑限制失敗，因此此副本明確屬 Git 來源封存，不冒充雲端完整 Function 匯出；永久回復依據為前版 Git SHA。正式資料的復原鏡像核對仍依 OPEN_QUESTIONS 追蹤。

## 同日 v1.2.1 試用修正部署

- 功能提交 `5ad321d5731e8e813c40f530d096a05e74fbfc5f`，Pages [34109297353](https://github.com/SeanChen0427/BNI-VP/actions/runs/34109297353) 成功。先發布包含選填文字與自動摘要的 app-api，再發布前端；沒有新 migration 或正式地基資料改寫。
- 正式首頁、地基 HTML、JS 與共用 domain 均與來源逐檔一致；首頁位置確認為會員概況後、我的工作／優先案件前。
- 使用現有副主席登入確認正式表單已顯示收合的「補充說明（選填）」及「儲存並新增下一項」。未填寫或儲存正式會員資料。
- 發布前完整驗證 244 項通過、稽核 0 錯誤、20 項既有 CSS 提醒、BNI 46／46 一致；細節見 `reviews/2026-09-07-foundation-simplification.md`。
- 教學導覽及課程未變動。若需回復這次簡化，前版 Git 為 `62a6f8f4b3eef452c1ae1f22721458c2efde77ad`；仍保留所有地基及事件資料。
