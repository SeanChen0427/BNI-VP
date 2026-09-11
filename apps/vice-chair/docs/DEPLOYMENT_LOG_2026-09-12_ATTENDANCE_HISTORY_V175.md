# 2026-09-12｜v1.7.5 點名歷史查找正式部署

Sean 已操作本機示範並確認「操作起來沒什麼問題你確認好就推上去吧」，授權完整驗證後直接發布。

- 分類：`fix`，改善既有點名流程的歷史查找與草稿切換；v1.7.4 → v1.7.5。
- 前版提交：`ee592f5ae594cbd8e6fac27385f407cf75454ee8`；前版 app-api 為 v82。
- 功能提交：`535c9cd7cc4b411cb5a60a655d82297f67afa1fa`。
- 正式入口：[每週點名與出席公告](https://seanchen0427.github.io/BNI-VP/attendance.html)。最近選單最多 8 筆；查歷史依年月顯示該月週次；回到本週載入當週最新已保存紀錄，當週無紀錄時使用今天。
- 修正後端最近 30 筆限制：分批讀取精簡日期索引，指定日期獨立載入。較早資料仍保留，未執行資料遷移或修改正式會員、點名及 PALMS 資料。
- Supabase app-api v83 ACTIVE，`verify_jwt=true`；匿名點名請求回傳 401。先更新後端，再發布前端。
- GitHub Pages [34628551597](https://github.com/SeanChen0427/BNI-VP/actions/runs/34628551597) 成功完成。
- 台北時間 2026-09-12 01:37:00 核對 9 個異動公開檔案 SHA-256，全數與驗證打包版本相符：attendance.html、attendance-usability.css、attendance.js、onboarding-page-guides.js、release-notes.js、index.html、settings.html、course.html、system-updates.html。
- 完整 `npm run check`：294 項測試通過、0 失敗；稽核 0 錯誤、20 項既有 CSS 格式提醒；BNI 官方回歸 46/46。
- 公開前端打包 184 檔、安全掃描 442 檔通過。新增回歸涵蓋跨資料庫分批上限的完整日期索引、舊日期獨立載入、草稿保存失敗與等待中保存的日期切換。
- 使用 105 個示範週次完成跨年月份查找、確認版歷史公告、回到本週、切換後草稿保留與窄螢幕排版檢視；未以正式會員資料進行自動寫入測試。正式資料內容由日常授權登入操作持續核對。
- 根目錄 AGENTS／CLAUDE、先前版本政策／工具修改及 artifacts 保留於本機，未混入本次提交。

回復方式：以新提交還原前版前端與 app-api 程式並重新部署；不刪除、不覆寫會員、點名、報表或歷史紀錄。
