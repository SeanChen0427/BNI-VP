# AI 開發入口

本文件讓 Codex、Claude 或其他 AI 在最少上下文下安全修改專案。

## 每次作業只讀這些

1. 根目錄 `AGENTS.md`。
2. 根目錄 `project-manifest.json`。
3. 本次功能對應的主題文件與程式檔。

不要一開始載入全部 `docs/`、所有表單或完整課程內容。

## 修改路由

| 要修改的功能 | 先讀 |
|---|---|
| 案件狀態、草稿 Key、回饋數、投票數 | `core/case-domain.js` |
| 投票、過半、迴避 | `docs/voting-rules.md`、`core/case-domain.js`、`assets/js/case-workflow.js` |
| 首頁案件摘要 | `index.html`、`assets/js/work-planner.js` |
| 進行中案件 | `case-board.html`、`assets/js/case-board.js` |
| 通知鈴鐺 | `assets/js/notification-center.js` |
| 當責信門檻、待寄提醒與寄發留痕 | `docs/accountability-email-workflow.md`、`core/accountability-email-domain.js`、`accountability-emails.html`、`assets/js/accountability-emails.js`、`assets/js/notification-center.js` |
| 表單欄位與 Word | 對應 `*-form.html`、`assets/js/*-form.js`、`services/case-files.js`、`docs/forms/interview-forms.md` |
| PALMS、燈號、關懷診斷 | 相鄰 `../bni-analysis` 模組；本工作台只讀 `bni-bridge.mjs` |
| AI 助手 | `assets/js/ai-assistant.js`、`preview-server.mjs`、`docs/architecture-hosting-security.md` |
| 權限與登入 | `assets/js/auth.js`、`assets/js/settings.js` |
| 制度文字 | 對應 `docs/` 主題文件，不要直接從畫面猜規則 |

## 修改前的三個問題

1. 這條邏輯的唯一來源在哪裡？
2. 哪些頁面是這條邏輯的消費者？
3. 有沒有舊版文字、Key 或畫面仍會顯示不同結果？

如果找不到唯一來源，先建立共用模組或記錄技術債，不要再複製一份。

## 固定驗證

```bash
node scripts/project-audit.mjs
node tests/case-domain.test.mjs
node --test tests/*.test.mjs
```

再依修改範圍測試對應頁面。不得用真實 API Key、LINE Bot 或正式會員案件做自動測試。

## 文件規則

- 現行需求只寫 `docs/requirements-draft.md`。
- 現行決策只寫 `docs/decision-log.md`。
- 未決問題只寫 `docs/OPEN_QUESTIONS.md`。
- 歷次程式變更寫 `CHANGELOG.md`。
- 外部模型審查報告放 `docs/reviews/`，只作歷史證據，不得當作現行規格。
- 根目錄不得再建立第二份 `requirements-draft.md` 或 `decision-log.md`。
- `AGENTS.md`、`CLAUDE.md` 改動後必須保持完全相同。

## 停止條件

以下情況不得自行猜測：

- 會員資格、開放專業別、續約與入會處置。
- 投票門檻、迴避或票向可見性。
- PALMS 計分公式。
- 中心區規範與富聯內規衝突。
- 正式資料要公開、上傳或刪除。
- 需要把本機預覽伺服器或含 API Key 的功能開放成公開網址。

先把差異、影響檔案與建議方案列給 Sean 確認。
