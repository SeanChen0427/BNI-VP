# 整合架構

狀態：正式運作中

現況確認：2026-09-06

## 現行正式架構

```text
GitHub Pages 公開前端
        │ 登入後請求
        ▼
Supabase Auth／PostgreSQL／Private Storage
        │
        ▼
Supabase Edge Functions
        │ 引用同一份分析核心
        ▼
apps/bni-analysis/engine
        │
        ▼
版本化分析快照與工作台
```

工作台負責呈現與工作流程；`apps/bni-analysis/` 是資料解析、對帳、計分、續約、診斷及關懷依據的唯一核心。正式前台透過受保護的 API 讀寫 Supabase，不依賴 Sean 的電腦保持開機。

2026-07-20 已建立 Supabase 正式後端並遷移第一批會員、原始報表與分析快照；正式前台已部署至 <https://seanchen0427.github.io/BNI-VP/>。後續案件、附件、點名、LINE 與換屆功能的上線證據保留於 `apps/vice-chair/docs/DEPLOYMENT_LOG_*.md`。

## 本機開發、分析與復原架構

```text
本機瀏覽器
├── 副主席工作台預覽
└── BNI 完整分析工具
          │
          ▼
preview-server.mjs
          │
          ▼
apps/vice-chair/bni-bridge.mjs
          │
          ▼
apps/bni-analysis
├── 私密資料工作副本／復原鏡像
├── PALMS 解析、對帳與回歸驗證
└── 與正式版相同的分析規則
```

本機環境不是第二套正式系統，也不是可與線上各自人工修改的資料來源。日常正式資料以 Supabase 為準；本機私密資料必須保留，並以資料期間、schema／migration 版本、筆數、檔案清單、雜湊及備份時間核對後，才能視為可用的復原版本。

正式分析核心在受保護的伺服器環境執行；AI 助手只解讀核心已計算的結果，不自行決定正式燈號或會員資格。本機與正式環境必須引用同一份 `apps/bni-analysis/engine`，避免規則分岔。

## 資料延續與回溯原則

1. 線上 Supabase 是日常正式資料來源；本機是必須維護的私密復原鏡像與分析工作副本。
2. Git 保存程式、migration、規則與去識別化測試；真實資料、附件及 Secret 保存在 Git 之外。
3. 每份可還原備份必須能指出正式來源、資料期間、產出時間、schema／migration 版本與完整性核對結果。
4. 還原前先在隔離環境驗證，不直接以未核對的本機資料覆蓋正式環境。
5. `decision-log.md`、`CHANGELOG.md`、部署紀錄與日期化審查是不可改寫的追溯證據；現行文件只描述現在怎麼運作，並連回歷史依據。

## 已完成的架構演進

1. 已完成目錄與本機執行整合，未複製第二套計分公式。
2. 已將解析、對帳與診斷抽成可測試的分析核心。
3. 已建立 Supabase Auth、資料表、RLS、Private Storage 與 Edge Functions。
4. 已將正式上傳、分析快照、案件、附件及出席等資料接上後端；瀏覽器只保留必要快取與非正式個人進度。
5. 已完成 GitHub Pages 正式部署、權限與稽核保護；詳細演進不在本文件重寫，改由日期化部署紀錄保存。
