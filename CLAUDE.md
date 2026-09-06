# 富聯分會會員委員會整合系統－AI 協作入口

## 專案定位

本專案是 BNI 富聯分會會員委員會的單一總專案。它由兩個清楚分工的應用組成：

1. `apps/vice-chair/`：副主席與會員委員的日常操作介面。
2. `apps/bni-analysis/`：會員資料、PALMS 解析、紅綠燈、續約、審計與關懷診斷的唯一核心。

## 不可違反的架構原則

- BNI 計分與診斷只存在於 `apps/bni-analysis/`，不得在工作台重寫。
- 工作台透過 `apps/vice-chair/bni-bridge.mjs` 讀取版本化分析快照。
- 修改分析規則前，必須完整遵守 `apps/bni-analysis/AGENTS.md` 的驗證、對帳與證據要求。
- 修改工作流程、權限、訪談或投票前，先讀 `apps/vice-chair/AGENTS.md` 與其指定文件。
- 真實會員資料、PALMS、附件、投票明細、Token、API Key 與密碼不得提交到 GitHub。
- 本專案由原本兩個專案的複本建立；原始 `/Users/chenkuixiang/Desktop/CCHOME/BNI` 與 `/Users/chenkuixiang/Desktop/CCHOME/副主席系統` 不再作為整合版的修改目標。

## 任務路由

| 任務 | 先讀 |
|---|---|
| 工作台頁面、案件、表單、權限 | `apps/vice-chair/AGENTS.md` |
| PALMS、燈號、續約、審計、關懷診斷 | `apps/bni-analysis/AGENTS.md`、`apps/bni-analysis/skill/SKILL.md` |
| 上架與資料安全 | `docs/ARCHITECTURE.md`、`apps/vice-chair/docs/architecture-hosting-security.md` |
| 整合橋接 | `apps/vice-chair/bni-bridge.mjs`、`apps/vice-chair/preview-server.mjs` |

## 固定驗證

每次跨模組修改後執行：

```bash
npm run check
```

### 測試與 token 使用原則

- 開發迭代先執行與本次修改直接相關的測試；不因單一小改動反覆輸出整套成功清單。
- 跨模組修改完成後，以及每次正式部署前，仍必須完整執行一次 `npm run check`；精簡輸出不得縮小測試範圍、忽略非零結束碼或略過稽核與 BNI 回歸。
- 全部通過時只保留階段、總數、成功／失敗與必要警告摘要。逐項成功內容可使用精簡 reporter 或暫存於本機臨時紀錄，不要整批載入 AI 上下文。
- 任何失敗、新警告或結果數量異常都必須展開原始細節並完成排查，不得以精簡輸出掩蓋。
- 新測試只為新增行為、已修正缺陷、重要權限／資料契約或跨模組風險增加；可合併重複案例，但不得只為降低數量或 token 而刪除有意義的回歸保護。

根目錄 `AGENTS.md` 與 `CLAUDE.md` 必須完全相同。
