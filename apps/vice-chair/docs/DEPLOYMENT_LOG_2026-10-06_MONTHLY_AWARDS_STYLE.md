# 2026-10-06｜v1.8.14 績優公告樣式一致化

Sean 以正式畫面截圖指出績優公告與既有首頁表格風格不一致；延續其直接上架後調整授權完成修正。

- 直接共用每月資料更新的 panel、head、bundle-grid 與 item 樣式，移除金色邊框、獨立圓角小卡與過大字級／留白。
- 同一套分欄線、白底、頁首背景及標題；複製按鈕改用紅色外框，重新整理移至頁尾；桌機四欄、平板兩欄、手機一欄沿現有斷點。
- 僅改首頁呈現、版本及文件。公告資料、現役評比、並列、全零、月份選擇與複製行為維持；未部署 Edge、執行 SQL 或發送 LINE。
- 完整 `npm run check`：352／352，稽核 0 錯誤、19 項既有 CSS 格式提醒，BNI 官方逐項 46／46。
- 將上方資料更新與公告一起以虛構資料驗證：1280px 桌機、390／320px 手機無水平溢出，複製拒絕時手動備援可用。
- 公開來源掃描通過，公開前端建置 200 檔。提交 `62412ef`，[Pages 發布 37433631179](https://github.com/SeanChen0427/BNI-VP/actions/runs/37433631179) 成功。
- 正式首頁、公告 CSS／JS／domain 及 release-notes 共 5 檔 HTTP 200，SHA-256 與發布建置一致。
- Actions 提示既有 actions 的 Node 20 宣告已被平台強制以 Node 24 執行，以及 ubuntu-latest 將於 10/19 遷移；建置及部署均成功，本次未改 CI 流程。

公開檔案驗證保存於私密 `apps/bni-analysis/data/updates/2026-10-06-monthly-awards/pages-style-verification.json`。若需回復外觀，回退本次前端提交並發布即可，不涉及資料還原。
