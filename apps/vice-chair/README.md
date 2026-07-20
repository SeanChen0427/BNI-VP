# BNI 富聯分會副主席工作台

本專案是一套供 BNI 富聯分會副主席與會員委員使用的 SaaS 工作台，目標是將副主席的日常工作、會員關懷、會員委員會運作與職務交接集中在同一個系統中。

會員紅綠燈分析工具已作為相鄰的 `../bni-analysis/` 模組，透過唯讀橋接層接入「會員關懷儀表板」。副主席系統不重寫或修改既有計分規則。

## 目前階段

需求蒐集與流程整理持續進行中。目前已有登入、訪談表單、點名、案件決議及 BNI 分析橋接等本機互動原型；正式 Supabase 後端尚未建立。

## 啟動本機工作台

在專案根目錄執行：

```bash
node preview-server.mjs 4173
```

再開啟 `http://127.0.0.1:4173/`。BNI 橋接預設讀取相鄰的 `../bni-analysis/index.html`，也可用環境變數 `BNI_ANALYSIS_ROOT` 指定分析工具位置。

橋接 API：`GET /api/bni-analysis`  
資料格式：`fulian.bni-analysis.v1`  
儀表板：`http://127.0.0.1:4173/member-care.html`

目前原型包含 12 章、image2 課程封面、章節目錄、原生流程圖／表格／情境卡、完成進度、重新整理後續看、進度重設及手機版版面。進度保存在該瀏覽器的 localStorage；清除瀏覽器網站資料會一併清除測試進度。

## 專案目錄

- 根目錄 `*.html`：穩定頁面網址，不任意搬動。
- `assets/js/`：頁面功能程式。
- `assets/css/`：頁面樣式。
- `assets/images/`：圖片資源。
- `core/`：案件共用規則。
- `docs/`：現行需求、制度與架構文件。
- `archive/`：已停用但暫時保留的舊版程式。
- `scripts/`、`tests/`：專案健檢與自動測試。

## 已確定方向

- 採 SaaS 形式，新任副主席以網址及個人帳號登入，不需安裝開發環境。
- 第一版只有「副主席」與「會員委員」兩種使用角色。
- 系統需支援職務交接、權限移轉、卸任撤權與資料完整匯出。
- GitHub 保存程式碼；正式會員資料不得放入公開程式碼倉庫。
- 敏感會員資料、關懷紀錄與衝突案件需有清楚的存取限制。

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
