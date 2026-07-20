# 專案架構地圖

## 現況

目前是無建置步驟的多頁式原型：

每月資料橋接由 `assets/js/monthly-data-update.js` 呼叫 `preview-server.mjs` 的 `/api/monthly-data`；伺服器驗證副主席／管理員身分、檔案大小及報表期間後，寫入相鄰 `BNI/data/` 對應目錄。

```text
瀏覽器頁面
├─ localStorage：案件、表單草稿、公告、出席、設定
├─ Supabase Auth：三組共用帳號的密碼驗證、短期登入 token
├─ sessionStorage：登入工作階段、AI 對話（關閉分頁即移除）
├─ IndexedDB：案件 Word 附件
└─ preview-server.mjs
   ├─ 靜態檔案
   ├─ BNI 分析橋接
   ├─ 公司統編查詢代理
   ├─ 會員委員會月會紀錄（本機私有應用資料）
   ├─ 個人 AI Key 本機加密保存
   └─ AI 制度查詢代理
```

這是可測試原型，不是正式 SaaS 架構。

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
| `bni-bridge.mjs` | 讀取相鄰 BNI 分析系統 |
| `assets/js/member-directory.js` | 原型會員選單 |
| `preview-server.mjs` | 本機 HTTP 與敏感 API 代理 |

### 月會紀錄

- 會議紀錄由 `/api/committee-meetings` 保存至 macOS 使用者私有應用資料區的 `committee-meetings.json`，不寫入 GitHub。
- 副主席與會員委員皆可建立、編輯及查閱草稿；只有副主席或系統開發人員可調整分會目標與完成正式結案。
- 月會關懷清單只保留需要立即決定追蹤委員與日期的續約、需輔導、期中關懷及既有案件；新會員、審計及其他分析細節留在會員關懷儀表板。
- 月會排定完成後寫入共用案件工作 Key，讓首頁與案件工作區立即取得同一項任務。
- `attendance.html` 會依例會日期保存點名快照，但只供現場作業與公告使用，不是正式統計來源。
- 月會頁透過 `/api/bni-monthly-attendance` 讀取 `BNI/data/monthly/` 中期間吻合的上月單月 PALMS；半年 PALMS 仍由會員關懷儀表板與每週公告累計使用。
- 正式跨裝置使用時，月會 API 的資料層應改接 Supabase PostgreSQL，前端資料格式可維持不變。

新增案件共用規則時，優先擴充 `core/case-domain.js`，不要在頁面複製判定。
訪談 Word 保存與 `wordSaved` 階段推進一律使用 `services/case-files.js`。

## 外部邊界

### BNI 分析工具

相鄰 `/Users/chenkuixiang/Desktop/CCHOME/BNI` 是計分與診斷唯一來源。本專案不得重寫紅綠燈公式。

### 正式後端

Supabase 專案 `fahrblkukuhgveiptufn` 已建立正式 schema、RLS、Private Storage 與三組共用 Auth 帳號。前端登入已於 2026-07-20 接上 Supabase Auth；多數案件與表單資料仍待由瀏覽器本機儲存遷移至 PostgreSQL／Private Storage。

正式前台已確認由 GitHub Pages 託管，但尚未建立／連接 GitHub repository。2026-07-20 的 Sites 與 Supabase `web-app`／`site` 只屬暫時前台，GitHub Pages 驗證後必須移除；操作證據與清理清單見 `docs/DEPLOYMENT_LOG_2026-07-20.md`。

## 已知架構債

1. 多數 CSS 與部分 JS 被壓成單行，閱讀與差異審查成本高。
2. `localStorage` 資料沒有 schema migration。
3. 登入與角色已由 Supabase Auth＋`app_accounts` RLS 驗證；多數業務資料仍在本機原型，尚未全面改由後端 RLS 強制。
4. 表單的 Word 產生程式高度重複。
5. 真實會員名單已從 `member-directory.js` 移除並改由登入後查詢 Supabase；仍須在首次 GitHub 提交前執行完整敏感資料掃描。
6. `preview-server.mjs` 同時負責多種 API，後續應拆成路由與服務。
7. 無 ESLint、Prettier、型別檢查與完整自動測試。

## 本機預覽安全界線

- `preview-server.mjs` 的 `/api/*` 只允許 `localhost`／`127.0.0.1` 呼叫。
- 不得用 localtunnel、ngrok 或其他公開隧道暴露含 AI Key、會員資料或附件的本機 API。
- 若需跨網路使用，必須先完成正式登入、後端權限、私有資料庫與秘密管理。

## 目標架構

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

正式 SaaS 時再評估 React＋TypeScript；在資料模型與測試未穩定前，不做整套重寫。
