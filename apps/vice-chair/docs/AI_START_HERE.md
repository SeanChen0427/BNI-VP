# AI 開發入口

本文件讓 Codex、Claude 或其他 AI 在最少上下文下安全修改專案。

## 先確認現在在哪個階段

- 系統已正式運作：前端為 GitHub Pages，正式登入、資料與敏感操作由 Supabase Auth、PostgreSQL、Private Storage 與 Edge Functions 承擔。
- 本機環境仍是必要的開發、驗證、分析與災難復原環境；本機私有資料不可刪除或提交 Git，也不可未經線上差異核對就宣稱可還原。
- 目前狀態先看本文件、`AGENTS.md`、`project-manifest.json`、`ARCHITECTURE_MAP.md` 與 `STORAGE_SCHEMA.md`。日期化部署紀錄、決策、CHANGELOG 和審查報告是歷史證據，只有追溯原因或排查回歸時才依主題展開。
- 文件出現「上線前」「未來改接」等文字時，先判斷它是否位於明確日期的歷史段落；不得直接用舊里程碑推翻現行架構。

## 每次作業只讀這些

1. 根目錄 `AGENTS.md`。
2. 根目錄 `project-manifest.json`。
3. 本次功能對應的主題文件與程式檔。

不要一開始載入全部 `docs/`、所有表單或完整課程內容。

## CHANGELOG 分層讀取

`CHANGELOG.md` 永久保留完整歷史，但一般任務不得預設整份載入。從總專案根目錄執行：

```bash
node scripts/changelog-context.mjs --app vice-chair --headings --recent 8 --search LINE --search Reply
```

- `--search` 可重複，表示所有文字都必須命中；同義詞用可重複的 `--any`。先查業務名稱，再查實際檔名、函式、資料表或 API 名稱。
- 工具只讀本機檔案，回傳命中的完整 `##` 條目，不會只截取單行。零命中時會列出完整標題索引並要求改用其他關鍵字。
- 權限、migration、投票、正式資料、PALMS／計分、跨模組、回滾或仍無法確認影響鏈時，才使用 `--all` 完整讀取。

## 修改路由

| 要修改的功能 | 先讀 |
|---|---|
| 案件狀態、草稿 Key、回饋數、投票數 | `core/case-domain.js` |
| 投票、過半、迴避 | `docs/voting-rules.md`、`core/case-domain.js`、`assets/js/case-workflow.js` |
| 首頁案件摘要 | `index.html`、`assets/js/work-planner.js` |
| 進行中案件 | `case-board.html`、`assets/js/case-board.js` |
| 通知鈴鐺 | `assets/js/notification-center.js` |
| 當責信門檻、待寄提醒與寄發留痕 | `docs/accountability-email-workflow.md`、`core/accountability-email-domain.js`、`accountability-emails.html`、`assets/js/accountability-emails.js`、`assets/js/notification-center.js` |
| 常用文稿內容、分段與動態欄位 | `docs/email-templates.md`、`core/message-template-domain.js`、`message-templates.html`、`assets/js/message-templates.js` |
| 表單欄位與 Word | 對應 `*-form.html`、`assets/js/*-form.js`、`services/case-files.js`、`docs/forms/interview-forms.md` |
| PALMS、燈號、關懷診斷 | 相鄰 `../bni-analysis` 模組；本工作台只讀 `bni-bridge.mjs` |
| AI 助手 | `assets/js/ai-assistant.js`、`preview-server.mjs`、`docs/architecture-hosting-security.md` |
| 全站系統操作導覽 | `docs/system-operation-guide.md`、`core/onboarding-domain.js`、`assets/js/onboarding*.js`、`assets/css/onboarding.css`、`assets/js/workspace-nav.js`；Admin 必須持續完全排除 |
| 權限與登入 | `assets/js/auth.js`、`assets/js/settings.js` |
| 制度文字 | 對應 `docs/` 主題文件，不要直接從畫面猜規則 |

## 修改前的三個問題

1. 這條邏輯的唯一來源在哪裡？
2. 哪些頁面是這條邏輯的消費者？
3. 有沒有舊版文字、Key 或畫面仍會顯示不同結果？

如果找不到唯一來源，先建立共用模組或記錄技術債，不要再複製一份。

## 固定驗證

開發中的每一輪先跑與修改直接相關的測試；功能完成、跨模組修改或正式部署前，再從總專案根目錄完整執行一次：

```bash
npm run check
```

完整檢查的範圍不得縮減，但輸出採分層讀取：全部成功時只讀取測試總數、失敗數、稽核摘要與 BNI 對帳摘要；逐項成功內容使用精簡 reporter 或保留在本機臨時紀錄。只有失敗、新警告或數量異常時才展開完整輸出。精簡顯示不得吞掉非零結束碼，也不得取代下列個別診斷指令：

```bash
node scripts/project-audit.mjs
node tests/case-domain.test.mjs
node --test tests/*.test.mjs
```

再依修改範圍測試對應頁面。不得用真實 API Key、LINE Bot 或正式會員案件做自動測試。

測試案例只在新增行為、修復缺陷、重要權限／資料契約或跨模組風險需要永久保護時增加。可以合併重複案例，但不得為了讓數字變少或節省 token 而刪除仍有意義的回歸測試。

## 文件規則

- 現行需求只寫 `docs/requirements-draft.md`。
- 現行決策只寫 `docs/decision-log.md`。
- 未決問題只寫 `docs/OPEN_QUESTIONS.md`。
- 現況架構與資料邊界以 `docs/ARCHITECTURE_MAP.md`、`docs/STORAGE_SCHEMA.md` 與 `docs/architecture-hosting-security.md` 為準；已完成事項不得繼續列為未決或未來式。
- 歷次程式變更完整寫入 `CHANGELOG.md`；讀取時遵守上方分層規則，不摘要或刪除原始歷史。
- 日期化部署紀錄與既有決策保持原始時點；若已被取代，新增指向現行文件的註記或新決策，不把歷史改寫成今天的敘述。
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
