# BNI 富聯分會副主席工作台

本專案是一套供 BNI 富聯分會副主席與會員委員使用的 SaaS 工作台，目標是將副主席的日常工作、會員關懷、會員委員會運作與職務交接集中在同一個系統中。

會員紅綠燈分析工具位於相鄰的 `../bni-analysis/` 模組，是唯一計分與診斷核心。正式環境由 Supabase 提供已發布分析快照，本機環境沿用 `bni-bridge.mjs` 的相同版本化契約；副主席系統不重寫計分規則。

## 正式運作狀態

- 正式前台：<https://seanchen0427.github.io/BNI-VP/>。
- 正式後端：Supabase Auth、PostgreSQL、Private Storage 與 Edge Functions。
- 正式功能、資料遷移與驗證證據見 `docs/DEPLOYMENT_LOG_*.md`；目前產品版本見 `release-version.json`。
- 需求蒐集、制度整理與功能改善仍持續進行，但系統不再屬於「尚未上線的本機原型」。

## 啟動本機開發與復原環境

在總專案根目錄執行：

```bash
npm start
```

再開啟 `http://127.0.0.1:4173/`。本機環境供開發、驗證、分析與災難復原；正式使用者仍由 GitHub Pages 進入，正式資料以 Supabase 為準。

BNI 橋接預設讀取整合專案內的 `../bni-analysis/index.html`，也可用環境變數 `BNI_ANALYSIS_ROOT` 指定受控分析工作副本。

橋接 API：`GET /api/bni-analysis`  
資料格式：`fulian.bni-analysis.v1`  
儀表板：`http://127.0.0.1:4173/member-care.html`

新任副主席上手課程包含 12 章、章節目錄、原生流程圖／表格／情境卡、完成進度、續看、進度重設及手機版版面。課程與操作導覽進度屬非正式個人狀態，保存在使用者瀏覽器；清除網站資料會一併清除該裝置的進度。

## 專案目錄

- 根目錄 `*.html`：穩定頁面網址，不任意搬動。
- `assets/js/`：頁面功能程式。
- `assets/css/`：頁面樣式。
- `assets/images/`：圖片資源。
- `core/`：案件共用規則。
- `docs/`：現行需求、制度與架構文件。
- `archive/`：已停用但暫時保留的舊版程式。
- `scripts/`、`tests/`：專案健檢與自動測試。

## 已確認的正式原則

- 採 SaaS 形式，新任副主席以網址接手，不需安裝開發環境。
- 正式登入維持 Admin／副主席／會員委員三組共用帳號，副主席與委員登入後選擇本人姓名；角色權限由前後端共同強制執行。
- 系統需支援職務交接、權限移轉、卸任撤權與資料完整匯出。
- GitHub 保存程式碼；正式會員資料不得放入公開程式碼倉庫。
- 敏感會員資料、關懷紀錄與衝突案件需有清楚的存取限制。
- 本機私密資料必須作為可驗證復原鏡像持續保存，與正式資料核對後才可標記為可還原；不得提交 GitHub。
- 日期化決策、CHANGELOG、部署紀錄及審查報告保留原文，作為改版與除錯的追溯證據。

詳細內容見 [需求草案](docs/requirements-draft.md) 與 [決策紀錄](docs/decision-log.md)。

## AI 協作入口

- Claude Code：先讀 [CLAUDE.md](CLAUDE.md)。
- Codex／其他代理：先讀 [AGENTS.md](AGENTS.md)。
- 最省 token 的開發入口：讀 [AI 開發入口](docs/AI_START_HERE.md) 與 [專案 manifest](project-manifest.json)。
- 快速接手業務：讀 [交接摘要](docs/HANDOFF.md)。
- 架構與重構：讀 [架構地圖](docs/ARCHITECTURE_MAP.md) 與 [重構路線圖](docs/REFACTOR_ROADMAP.md)。
- 尚未決定：讀 [未決事項](docs/OPEN_QUESTIONS.md)。

`CLAUDE.md` 與 `AGENTS.md` 必須保持完全相同，讓不同 AI 工具使用同一套規則與現況。

## 開發健檢

每次修改共用案件邏輯或準備交付前執行：

```bash
node scripts/project-audit.mjs
node tests/case-domain.test.mjs
node --test tests/*.test.mjs
```
