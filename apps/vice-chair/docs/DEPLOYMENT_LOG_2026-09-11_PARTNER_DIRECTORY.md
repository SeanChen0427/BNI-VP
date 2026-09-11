# 2026-09-11｜v1.6.0 夥伴名錄正式部署

Sean 明確要求直接推上正式版，實際使用發現問題再修正。

- 前版 Git：`7d42fff6c1eceb9dd515855a029c9b2089fa4049`；產品 v1.5.0；app-api v80。
- 本次功能提交：`c5f159e35a7704c16c26602c6f499bbd0ad831ab`；產品 v1.6.0。
- 先發布 app-api v81，狀態 ACTIVE，保留 verify_jwt=true；沒有資料遷移或會員資料改寫。
- GitHub Pages [34576298506](https://github.com/SeanChen0427/BNI-VP/actions/runs/34576298506) 發布成功。
- 正式入口：[夥伴名錄](https://seanchen0427.github.io/BNI-VP/partners.html)。
- 發布前 277 項測試通過、0 失敗；稽核 0 錯誤、20 項既有 CSS 格式提醒；BNI 官方回歸 46／46 相符。新增內容會員姓名及金鑰格式掃描無命中。
- Pages 顯示既有 Actions Node 20 棄用提醒，但建置與部署均成功；未為本次功能擴張工作流升級。
- 依 Sean 最新指示不再擴充正式資料操作驗收，由 Sean 實際試用後回報。既有虛構資料桌面／手機驗證不冒充正式會員資料驗證。
- 根目錄 AGENTS.md／CLAUDE.md 的先前改動及 artifacts 未納入本次提交。

回復時以新的提交恢復前版前端與 app-api，再部署；不刪除或改寫會員、報表與分析資料。
