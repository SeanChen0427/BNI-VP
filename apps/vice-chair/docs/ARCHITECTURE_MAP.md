# 專案架構地圖

## 現況

目前是由 GitHub Pages 發布、Supabase 提供正式後端的多頁式應用。Supabase 是日常正式資料來源；本機環境負責開發、驗證、分析與災難復原，不是另一套可各自修改的正式資料庫。

每月資料橋接由 `assets/js/monthly-data-update.js` 呼叫 Supabase `app-api` Edge Function；Function 驗證 JWT、角色、姓名、檔案大小及報表期間後，寫入 Private Storage 與 `report_imports`。`preview-server.mjs` 只保留本機開發用途。

```text
GitHub Pages 公開前端
├─ Supabase Auth：三組共用帳號的密碼驗證、短期登入 token
├─ Supabase PostgreSQL：會員、案件、表單、月會、公告、出席、投票、報表索引、分析版本與 RLS
├─ Supabase Private Storage：PALMS／會籍／會齡／審計原始報表與案件附件
├─ Supabase Edge Functions
│  ├─ app-api：案件、月會、每月資料、分析、AI、LINE、離會與公司查詢
│  └─ manage-shared-credentials：Admin 更新三組共用密碼
├─ sessionStorage：登入工作階段、AI 對話（關閉分頁即移除）
└─ 瀏覽器本機層：正式資料快取、離線失敗備援、個人已讀與課程進度

本機開發／分析／復原環境
├─ preview-server.mjs：localhost 預覽與正式 API 契約相容層
├─ ../bni-analysis：PALMS 計分、診斷與版本化分析快照唯一核心
└─ 私有本機資料：分析工作檔與復原副本；不得進 Git，且須經版本與完整性核對後才能宣稱可還原
```

正式網址只發布公開前端；真實會員、報表、密碼與 AI Key 均不進 GitHub。

## 頁面分區

### 日常工作

- `index.html`：首頁、案件摘要、公告、提醒、AI 助手。
- `case-board.html`：多案件工作佇列。
- `case-workflow.html`：訪談完成後的回饋、投票、董顧與結案。
- `member-care.html`：會員關懷儀表板與排定關懷。
- `attendance.html`：每週點名與公告產生。
- `monthly-meeting.html`：每月第一場例會後的會員委員會月會、歷史紀錄與 Word 輸出。

### 訪談表單

- `terminal-form.html`：終期輔導。
- `midterm-form.html`：期中輔導。
- `new-member-form.html`：新會員訪談。
- `industry-change-form.html`：轉換行業別。
- `departure-form.html`：離會訪談。

各表單目前由 `assets/js/` 內的主程式 `*-form.js` 加上案件資料帶入層 `*-form-live.js` 組成。

### 系統與交接

- `course.html`：副主席上手課程。
- `settings.html`：角色、人員、共用密碼更新與個人 AI Key。
- `login.html`：維持 `admin`／`vice`／`Fulian` 簡單帳號介面，背後由 Supabase Auth 驗證。

## 共用模組

| 模組 | 責任 |
|---|---|
| `assets/js/auth.js` | Supabase Auth 登入、token 更新、逾時、角色驗證與前端權限 |
| `assets/js/supabase-config.js` | 可公開的 Supabase URL 與 publishable key；不得放 secret／service role key |
| `core/case-domain.js` | 案件 Key、階段、回饋／投票計數、迴避與過半 |
| `core/calendar-domain.js` | 月份標題、截止倒數、本月工作與預設日期 |
| `core/monthly-meeting-domain.js` | 月會新會員檢視辨識、關懷分工與結案檢查 |
| `services/case-files.js` | 五種訪談 Word 附件保存與案件進入回饋階段 |
| `services/interview-completion.js` | 五種訪談完成／失敗回饋、下一步與再次下載 |
| `bni-bridge.mjs` | 讀取整合專案內 `../bni-analysis` 的版本化分析結果 |
| `assets/js/member-directory.js` | 登入後載入正式會員目錄，並保留本機相容處理 |
| `assets/js/supabase-data.js` | 正式網站將 `/api/*` 請求導向 Supabase Edge API |
| `preview-server.mjs` | localhost 開發、驗證與復原演練用 HTTP/API 相容層 |

### 月會紀錄

- 會議紀錄由 `/api/committee-meetings` 經正式 Edge API 保存至 Supabase `committee_meetings`；本機預覽保留相同 API 契約供開發與復原驗證，不寫入 GitHub。
- 只有副主席與 Admin 可建立、編輯及查閱月會草稿、調整分會目標與完成正式結案；會員委員只能查閱及下載已結案歷史紀錄。
- 月會關懷清單只保留需要立即決定追蹤委員與日期的續約、需輔導、期中關懷及既有案件；新會員、審計及其他分析細節留在會員關懷儀表板。
- 月會排定完成後寫入共用案件工作 Key，讓首頁與案件工作區立即取得同一項任務。
- `attendance.html` 會依例會日期保存 Supabase 點名快照，供現場作業與公告使用；PALMS 仍是正式統計與後續對帳來源。
- 月會頁透過 `/api/bni-monthly-attendance` 讀取正式匯入且期間吻合的上月單月 PALMS 衍生摘要；半年 PALMS 仍由會員關懷儀表板與每週公告累計使用。
- 本機分析資料與匯出副本是必要復原資產，但不得以人工雙寫維持。每次復原副本都要帶來源期間、產出時間、版本／雜湊與核對結果。

新增案件共用規則時，優先擴充 `core/case-domain.js`，不要在頁面複製判定。
訪談 Word 保存與 `wordSaved` 階段推進一律使用 `services/case-files.js`。

## 外部邊界

### BNI 分析工具

整合專案內的 `../bni-analysis` 是計分與診斷唯一來源，本工作台不得重寫紅綠燈公式。原始 `/Users/chenkuixiang/Desktop/CCHOME/BNI` 只保留為整合前來源與歷史追溯，不再是修改或執行目標。

### 正式後端

Supabase 專案 `fahrblkukuhgveiptufn` 已建立正式 schema、RLS、Private Storage 與三組共用 Auth 帳號。前端登入與正式案件、表單、附件、月會、公告、出席、投票及分析資料已接上 Supabase；課程進度、已讀狀態等非正式個人狀態仍可留在瀏覽器。

正式前台已由 GitHub Pages 託管於 `SeanChen0427/BNI-VP`；2026-07-20 的 Sites 公開入口已關閉，Supabase `web-app`／`site` 暫時前台已移除。操作證據與清理紀錄見 `docs/DEPLOYMENT_LOG_2026-07-20.md`。

## 已知架構債

1. 多數 CSS 與部分 JS 被壓成單行，閱讀與差異審查成本高。
2. 部分舊版 `localStorage` 快取與個人課程進度尚未收斂到統一 schema／migration 服務；它們不得被誤認為正式資料。
3. 正式業務資料已由 Supabase Auth／RLS／Edge API 保護；本機完整復原副本的自動匯出、加密保存、差異核對與隔離還原演練尚未形成可驗證的固定流程。
4. 表單的 Word 產生程式高度重複。
5. 真實會員名單已從 `member-directory.js` 移除並改由登入後查詢 Supabase；每次 GitHub Pages 發佈前由 workflow 執行敏感資料掃描。
6. `preview-server.mjs` 保留本機預覽相容；正式環境的 9 組舊 API 已由 `app-api` Edge Function 接管。
7. 已有跨模組健檢與領域／回歸測試，但仍缺 ESLint、Prettier、型別檢查及完整瀏覽器端到端覆蓋。

## 本機預覽安全界線

- `preview-server.mjs` 的 `/api/*` 只允許 `localhost`／`127.0.0.1` 呼叫。
- 不得用 localtunnel、ngrok 或其他公開隧道暴露含 AI Key、會員資料或附件的本機 API。
- 跨網路正式使用只走 GitHub Pages、Supabase Auth／RLS／Edge Functions 與 Private Storage；不得用公開隧道替代正式環境。

## 現行程式碼配置

目前根目錄只保留網址入口與專案級檔案：

```text
*.html         頁面網址入口
assets/
├─ css/        全部前端樣式
├─ js/         全部頁面程式
└─ images/     圖片資源
core/          純業務規則，可單元測試
services/      共用瀏覽器服務（附件保存、流程協調）
archive/       已停用但暫時保留的舊版程式
docs/          規格唯一來源
scripts/       健檢與維護工具
tests/         純規則與資料相容測試
vendor/        第三方瀏覽器套件
```

是否改用 React＋TypeScript 屬未來技術評估；在資料模型與測試未穩定前，不做整套重寫，也不影響目前正式服務。

## 官方培訓課程查詢

`training-catalog.html` → 既有登入／Supabase transport → `app-api/api/training-catalog` → 官方課程、異動與同步狀態三表。名稱搜尋、期間篩選與台北時間由 `core/training-catalog-domain.js`、`core/calendar-domain.js` 共用。

每日台北 06:00 的專用 `training-catalog-cron` 與手動更新引用同一份 `_shared/training-catalog-sync.mjs`；不耦合 LINE 發送、不重算 PALMS，也不寫會員完成紀錄。部署與資料契約見 [培訓課程庫](training-catalog.md)。

新會員／續約表單透過共用 `assets/js/training-picker.js` 讀取課表，`core/training-selection-domain.js` 處理選課及異動比較，沿用案件草稿同步保存場次快照；不新增正式資料來源或排程。
