# 上線、資料安全與 BNI 分析橋接架構

狀態：GitHub Pages 正式前台與 Supabase 正式後端均已部署，三角色 Auth／RLS／44 位會員／PALMS 快照已完成線上驗證。  
確認日期：2026-07-20  
決策來源：Sean 現行決策

## 一、核心決策

- 現有完整 BNI 分析工具位於 `/Users/chenkuixiang/Desktop/CCHOME/BNI`，後續必須整合進副主席系統，不重寫、不複製第二套計分邏輯。
- GitHub 只保存程式碼、資料格式、空白範例與部署設定，不保存任何真實會員資料、原始報表、案件附件、正式帳密或 API Key。
- 副主席系統與 BNI 分析工具之間建立「分析資料橋接層」；BNI 工具是計分與診斷的唯一來源，副主席系統負責呈現結果、建立關懷任務及串接訪談案件。
- 正式上線採「GitHub Pages 靜態前台＋Supabase 後端」架構。真實資料不得部署為公開靜態檔。
- 正式前台：<https://seanchen0427.github.io/BNI-VP/>。
- 2026-07-20 建立的 OpenAI Sites 與 Supabase `web-app`／`site` 前台只屬暫時部署；GitHub Pages 驗證後，Sites 已改為 owner-only，Supabase 暫時前台已刪除。完整紀錄見 `DEPLOYMENT_LOG_2026-07-20.md`。

## 二、整體架構

```text
GitHub Pages
只放系統畫面與前端程式
        ↓ 登入後請求
Supabase Auth
帳號、登入與角色
        ↓
Supabase PostgreSQL
會員、案件、回饋、投票、出席及分析快照
        ↓
Supabase Private Storage
PALMS、Word、確認截圖、申請書與附件
        ↓
Supabase Edge Functions
LINE Bot、AI、敏感操作及後端橋接
        ↑
BNI 分析工具
解析報表、驗證計分、診斷與產生結構化結果
```

## 三、資料存放對照

| 資料 | 正式存放位置 | 最低權限要求 |
|---|---|---|
| PALMS、到期日、會齡及審計原始報表 | Supabase Storage 私人 bucket：`raw-reports` | 副主席、Admin |
| 會員姓名、專業類別、電話、Email、會籍資料 | PostgreSQL：`members` | 依角色及用途採 RLS |
| 結案後、待 PALMS 確認的新會員 | PostgreSQL：`provisional_members` | 副主席、Admin 經 Edge API 登錄；僅供點名，不進正式分析 |
| 身分證或本人佐證 | 原則上只現場核對、不留檔 | 若制度要求保存，另行確認最小欄位、遮罩與期限 |
| 訪談 Word、申請書、佐證附件 | 私人 bucket：`case-files` | 副主席及受指派案件人員 |
| 訪談確認截圖 | 私人 bucket：`case-confirmations` | 副主席及受指派案件人員 |
| 委員回饋 | PostgreSQL：`case_feedback` | 當期有效委員，結案後鎖定 |
| 投票資格、票向及時間 | PostgreSQL：`vote_snapshots`、`votes` | 依投票制度與查閱規則限制 |
| 董事顧問確認 | PostgreSQL：`advisor_confirmations`＋必要附件 | 副主席、Admin；其他角色依案件顯示結果 |
| 出席與紀律紀錄 | PostgreSQL：`attendance_sessions`、`attendance_records` | 委員可保存草稿，副主席／Admin 最終確認；正式與待 PALMS 會員均用內部 ID 記錄，只作 LINE 公告暫時增量 |
| BNI 分析結果 | PostgreSQL：`analysis_snapshots` | 登入且有權限者 |
| 完整分析交換檔 | 私人 Storage 或登入後即時 API | 不得部署為公開 JSON |
| LINE Bot Token | Supabase Edge Function Secrets | 前端與資料庫不可讀取 |
| LINE 群組目標與點名公告發送紀錄 | PostgreSQL：`line_group_targets`、`attendance_line_deliveries` | 只由 Edge Function/service role 讀寫；前端只取得去識別狀態與群組顯示名稱 |
| 每週委員工作進度發送稽核 | PostgreSQL：`committee_work_digest_deliveries` | 只由 Edge Function/service role 讀寫；不保存完整文案，只保存來源／文案雜湊與發送結果 |
| 案件委員回饋通知發送稽核 | PostgreSQL：`case_feedback_line_deliveries` | 只由 Edge Function/service role 讀寫；正式委員會群、每案一次、只保存文案雜湊與送達結果 |
| 個人 AI API Key | 後端加密欄位／Vault（按使用者隔離） | 前端只讀取綁定狀態與末四碼；完整 Key 不可讀回 |
| 富聯共用系統 Secret（若未來需要） | Supabase Edge Function Secrets | 前端與資料庫一般角色不可讀取 |
| 正式帳號與密碼 | Supabase Auth | 系統不得保存明碼密碼 |

### 共用登入第一階段實作（2026-07-20）

- 使用者畫面維持 `admin`、`vice`、`Fulian` 三個帳號名稱；內部 Email 對應只供程式呼叫 Supabase Auth，不要求日常使用者管理 Email。
- `auth.js` 不含預設密碼，也不從 `localStorage` 讀寫密碼；舊 V2 認證設定載入時會自動清除既有密碼欄位。
- 登入後以 `app_accounts` RLS 資料再次驗證 Admin／副主席／會員委員角色；停用或角色不一致即拒絕登入。
- 現任角色姓名由登入後的 `committee_terms` 查詢載入，不嵌入 GitHub Pages。
- token 只保存於分頁 `sessionStorage`，接近到期時自動更新；關閉分頁即移除，8 小時未操作要求重新登入。
- 登出固定使用 Supabase Auth `scope=local`，只撤銷目前裝置的 refresh token；首次登入尚未選姓名時亦不得讓共用帳號的其他裝置失效。
- 同分頁的並行請求共用一次 token refresh，並在後端驗證人員狀態與任期起訖。
- Admin 透過 `manage-shared-credentials` Edge Function 一次更新三組密碼；函式再次檢查 Supabase 使用者與 `app_accounts.role = admin`，service role key 只存在函式環境。

## 四、BNI 分析橋接層

### 第一版實作狀態（2026-07-14）

- 新增 `bni-bridge.mjs`，唯讀解析相鄰 BNI 專案現有的 `index.html` 分析成果。
- 新增本機端點 `GET /api/bni-analysis`，回傳版本化格式 `fulian.bni-analysis.v1`。
- 新增 `member-care.html`，呈現會員總數、燈號分布、續約雷達、審計觀察、黃燈突圍與期中關懷。
- 快照包含來源路徑、修改時間及 SHA-256 短指紋，便於確認畫面引用的是哪一版分析成果。
- 此版本不寫入 BNI 專案、不解析原始 PALMS，也不重算任何分數；未來改由 Supabase 供應快照時沿用相同 API 契約。

橋接層必須輸出有版本的結構化結果，例如 `analysis_snapshot`，至少包含：

- 分析版本、資料期間、產出時間及來源報表版本。
- 現任會員名單與姓名比對結果。
- 會員專業類別、會籍起訖及續約截止日。
- 六項 PALMS 原始數據、各項得分、總分與燈號。
- 行業別開放與即將開放警示。
- 續約雷達及全年審查數據。
- 黃燈突圍計算、期中關懷與新會員追蹤。
- 審計觀察證據、可能解釋與關懷方向。

整合規則：

1. 不在副主席系統重寫計分公式。
2. BNI 工具先完成對帳與驗證，再發布新的分析快照。
3. 副主席系統只讀取已發布快照，不直接修改原始分析結果。
4. 關懷任務、訪談及案件紀錄可以引用快照版本，避免日後數據更新造成歷史依據改變。
5. 分析工具仍可獨立使用，橋接失敗不能阻斷原本月度分析。

## 五、個人 AI Key 本機試作

- 2026-07-16 已確認每位副主席與會員委員使用自己的 OpenAI、Gemini 或 Anthropic API Key，不建立富聯共用 AI Key。
- 設定頁可同時綁定三家並選擇預設平台；儲存後前端只取得是否綁定、末四碼與更新時間。
- 完整 Key 不寫入 GitHub、localStorage、前端程式碼、會員資料或設定異動紀錄。
- 本機預覽伺服器使用 AES-256-GCM 加密，將密文與本機主金鑰分別保存於 `~/Library/Application Support/Fulian VP System/`，檔案權限限制為目前電腦使用者。
- 共用委員帳號只能提供「依登入時所選姓名分區」的隔離，不能視為嚴格身份驗證。**2026-07-19 Sean 決策：因系統僅內部 10 人以下使用且不對外公開，正式上線維持三組共用帳號，不建立一人一帳號**；姓名分區隔離屬信任機制，離任或懷疑密碼外洩時必須立即更換共用密碼。（舊要求「正式上線前必須改成一人一帳號」已被取代，保留於 2026-07-16 歷史紀錄）
- 正式 SaaS 應由 Supabase Auth 驗證共用帳號登入，再由 Edge Function 依登入後所選姓名讀取後端加密金鑰；不得把個人 Key 當成可公開讀取的資料列或一般 Edge Function Secret。

## 六、GitHub 邊界

### 可以進 GitHub

- 前端、後端函式及橋接程式碼。
- 資料庫 migration、RLS policy 與空白 schema。
- 去識別化測試資料與空白範例。
- GitHub Actions 工作流程。
- 文件、制度版本索引與不含個資的公版。

### 禁止進 GitHub

- `*.xls`、正式分析 JSON、原始報表及歷史報表。
- 真實會員名單、電話、Email、身分證號及健康／爭議資料。
- 訪談 Word、申請書、確認截圖及董事顧問附件。
- 回饋、票向、完整出席明細與正式備份。
- `.env`、正式帳密、LINE Token、AI Key、Supabase secret/service key。

正式建置前必須建立 `.gitignore`、上傳前敏感資料掃描及測試資料去識別化規則。

## 七、帳號所有權與交接

- GitHub、Supabase、LINE 官方帳號及網域不應只綁 Sean 個人帳號。
- 優先使用富聯共用管理 Email 或分會正式持有的組織帳號。
- Admin 保留緊急復原權；副主席負責日常管理；會員委員依任期授權。
- 換屆時完成候任者加權、卸任者撤權、未結案件移交及備份確認。
- 付款人、帳號復原人、第二管理者及緊急聯絡方式仍待確認。

## 八、建議實作順序

1. 已建立第一版橋接格式、解析器與自動測試。
2. 已在副主席系統加入「會員關懷儀表板」，本機唯讀目前 BNI 分析成果。
3. 已建立 Supabase 專案、Auth、資料表、私人 buckets 與 RLS。
4. 已遷移 44 位會員、12 份原始報表與第一版已發布分析快照；排程、案件草稿、附件、回饋、投票與現場點名均已接上 Supabase，課程進度等非正式個人狀態仍保留瀏覽器端。
5. 已讓前台讀取正式分析快照，並完成月度上傳、月會、草稿審閱、確認發佈、離會、公司查詢、任務、訪談草稿、案件流程與 Word 附件的 Edge API 跨裝置同步。
6. 已建立個人 AI API Key 的 Supabase Edge AES-GCM 加密綁定與三家官方申請教學。
7. 串接只依系統資料回答的制度查詢 AI、LINE Bot 與備份／還原流程。

## 九、正式啟用後仍待確認

- 輪替／撤銷 2026-07-20 曾顯示於本機 Codex CLI 輸出的 legacy service role key。
- Supabase 專案由哪個富聯帳號持有、誰付款及誰是第二管理者。
- 正式環境方案、資料區域與備份需求。
- 各類文件與個資保存年限、離會後刪除或封存規則。
- 委員票向是否記名及哪些角色可以查閱。
- 個人 AI Key 已完成 Edge AES-GCM 加密；仍待建立加密 secret 輪替、離任撤銷及使用量提示流程。
- （2026-07-19 已決策：不建立一人一帳號，維持共用帳號）共用帳號下個人 Key 依所選姓名隔離，屬信任機制；仍待確認：離任時更換共用密碼與撤銷 Key 的執行責任人與流程。
- LINE 採兩個獨立官方帳號：現有「副主席秘書Bot」負責公告／董顧／交流群；新增「會員委員秘書Bot」只負責委員會群。兩組 Secret 皆只保存於 Edge Function Secrets；新 Bot 的正式群綁定、兩個 OA 的第二管理者及換屆交接仍待完成。

## 十、官方技術參考

- GitHub Pages：<https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site>
- Supabase Storage 私人 bucket：<https://supabase.com/docs/guides/storage/buckets/fundamentals>
- Supabase Storage RLS：<https://supabase.com/docs/guides/storage/security/access-control>
- Supabase Edge Function Secrets：<https://supabase.com/docs/guides/functions/secrets>
