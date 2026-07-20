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

根目錄 `AGENTS.md` 與 `CLAUDE.md` 必須完全相同。
