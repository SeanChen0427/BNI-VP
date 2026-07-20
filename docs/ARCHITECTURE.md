# 整合架構

## 現階段

```text
瀏覽器
├── 副主席工作台
└── BNI 完整分析工具
          │
          ▼
本機預覽伺服器
          │
          ▼
BNI 橋接層
          │
          ▼
apps/bni-analysis
├── PALMS／會籍／會齡／審計資料
├── 驗證規則與診斷規格
└── 會員關懷儀表板
```

工作台只負責呈現與工作流程。分析工具負責資料真實性、計分、續約、診斷及關懷依據。

## 正式上架架構

```text
GitHub repository／GitHub Pages
只保存並發布前端程式
        │
        ▼
前端工作台與分析介面
        │
        ▼
Supabase Auth／Database／Private Storage
        │
        ▼
伺服器端 BNI Analysis Core
        │
        ▼
版本化分析快照
```

正式版仍維持同一個總專案，但原始報表與會員資料不進 GitHub。分析核心必須在受保護的伺服器環境執行，AI 助手只解讀已有結果，不自行決定正式燈號或會員資格。

2026-07-20 已建立 Supabase 正式後端並遷移 44 位會員、12 份原始報表與第一版分析快照；正式前台已部署至 <https://seanchen0427.github.io/BNI-VP/>。同日已部署受 JWT 保護的 `app-api` Edge Function，原本僅能由 `preview-server.mjs` 提供的 9 組 API 均改由 Supabase 執行；分析 Function 直接引用同一份 `apps/bni-analysis/engine`，不在工作台或資料庫重寫計分規則。Sites 公開入口已關閉，Supabase 暫時前台已刪除，詳見 `apps/vice-chair/docs/DEPLOYMENT_LOG_2026-07-20.md`。

## 遷移原則

1. 先完成目錄與本機執行整合，不改計分公式。
2. 將解析與診斷逐項從靜態產出流程抽成可測試的分析核心。
3. 建立 Supabase 資料表與私密儲存。
4. 將本機上傳、分析快照及附件保存改接後端。
5. 完成權限、稽核紀錄及去識別化測試後再正式部署。
