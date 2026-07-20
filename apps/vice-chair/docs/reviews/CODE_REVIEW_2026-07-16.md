# 富聯分會副主席系統－程式碼審查報告（2026-07-16）

> 狀態：歷史審查紀錄，供追蹤當時發現使用；不是現行規格或唯一事實來源。修正狀態以 `CHANGELOG.md`、`docs/decision-log.md` 與實際程式測試為準。

審查者：Claude Code（只讀審查，未修改任何專案檔案）
交付對象：Codex（第二次核對與排序）
專案狀態：無建置步驟的多頁式 HTML／CSS／JavaScript 本機原型，約完成 70%，正式後端預定採 Supabase。

---

## 給 Codex 的核對指示

1. 本報告所有問題均附檔案與行號，請逐項核對是否成立，再決定修正順序。
2. 標記為「已確認」者為靜態程式碼可證；「高可信風險」與「待驗證」需實際操作或啟動伺服器重現後才可升級為已確認。
3. 涉及投票基數、迴避、出席累計、會員資格的修正（P1-2、P2-委員快照），必須先取得 Sean 確認規則，不得自行決定。
4. 修正原則：最小且安全的修改，不做框架重寫，不動相鄰 `../BNI` 專案。
5. 每次修正後執行：`node scripts/project-audit.mjs`、`node --test tests/*.test.mjs`，並依「驗證方式」欄逐項確認。
6. 修正完成後更新 `CHANGELOG.md`，並同步檢查 `CLAUDE.md` 與 `AGENTS.md` 保持相同（`cmp CLAUDE.md AGENTS.md`）。

---

## 1. 執行摘要

整體健康程度：中上，適合繼續開發，但有數項影響案件流程正確性的問題需在擴充功能前處理。

程式結構清楚，`core/case-domain.js` 確實作為案件階段與 storage Key 的單一來源，多數頁面透過它讀取階段，域邏輯有單元測試護欄。健檢 0 錯誤、測試全過。

- P0：0 項（無立即的密鑰外洩或資料不可回復風險）
- P1：3 項
- P2：6 項
- P3／非必要建議：另列

最需要注意的三個區域：

1. 案件階段同步：新會員與轉換行業別表單未把 Word 完成狀態寫回案件流程。
2. 出席計算：「已到但未完成簡報」與「遲到」可重疊，同一人同時列入遲到與缺席名單。
3. 權限模型純前端：所有副主席限定操作皆可由修改 sessionStorage 繞過，屬原型已知限制，但文件敘述需正名，正式上線前必須改為後端控制。

---

## 2. 已執行的檢查

| 指令／檢查 | 結果 |
|---|---|
| `node scripts/project-audit.mjs` | 成功。0 錯誤、19 個格式化提醒（皆為單行高密度檔） |
| `node --test tests/*.test.mjs` | 成功。2 套件、2 通過、0 失敗 |
| `cmp CLAUDE.md AGENTS.md` | 完全相同 |
| 13 個 HTML 是否存在 | 通過 |
| 本機 CSS／JS／圖片／vendor 引用是否存在 | 通過（無缺失；外部僅 Google Fonts） |
| `core/case-domain.js` 是否先於消費者載入 | 通過（每頁順序：auth.js → case-domain.js → 消費者） |
| 根目錄是否重新出現散落 CSS／JS | 通過 |
| `assets/js`、`assets/css` 未被引用檔 | 無完全未引用者 |
| `archive/` 是否被正式頁面引用 | 未被任何 HTML 引用 |
| 文件是否引用搬移前舊路徑 | 未發現失效連結 |

未執行項目：未啟動 `preview-server.mjs`、未呼叫任何真實 AI／LINE／公司統編 API、未寫入 localStorage／IndexedDB（依只讀限制）。涉及執行期狀態的問題均標記為「高可信風險」或「待驗證」。

---

## 3. 問題清單（P1 → P2）

### [P1-1] 新會員與轉換行業別案件產生 Word 後不會進入回饋階段

狀態：已確認

證據：
- `assets/js/terminal-form.js:90`：`saveWordToCase()` 會寫入 `fulian-case-workflow-v2-{caseId}` 並設 `wordSaved:true`，同時把 Word 存入 IndexedDB `fulian-case-files`。
- `assets/js/new-member-form.js`（`downloadWord()`，約第 57–79 行）與 `assets/js/industry-change-form.js`：全檔搜尋 `workflowStorageKey`、`wordSaved`、`fulian-case-files` 出現次數為 0，兩者只下載檔案，不寫案件流程、不存附件。
- `core/case-domain.js:81`（`stageOf`）：需 `wordSaved || feedbackNotified || hasFeedback` 才進 FEEDBACK，否則有草稿即停在 INTERVIEW。
- `assets/js/case-board.js:6-13`（`typeMap`）：`renewal / new / industry` 皆 `flow:true`（都要走回饋與投票流程）。

實際影響：三種需投票的案件中，只有續約在產出 Word 後自動進入「等待委員回饋」；新會員與轉換行業別永遠停在「訪談草稿進行中」，需到案件流程頁手動上傳 Word 才能推進，且附件不會自動保存。

觸發／重現方式：
1. 首頁排定一件「新會員」案件並開啟訪談表單。
2. 填寫後按「下載 Word」。
3. 回案件中心或首頁，案件仍顯示「訪談草稿進行中」。

預期行為：任何 `flow:true` 案件產生正式 Word 後，皆應與續約一致推進到回饋階段並保存附件。

目前行為：僅續約推進。

建議修正：把 `terminal-form.js` 的 `saveWordToCase()` 抽為共用函式，讓 `new-member-form.js`、`industry-change-form.js` 的 `downloadWord()` 產生 Blob 後一併呼叫。

連動檔案：`assets/js/new-member-form.js`、`assets/js/industry-change-form.js`、`assets/js/work-planner.js`、`core/case-domain.js`。

修正時機：正式上線前（建議最優先）。

驗證方式：三種 flow 案件各跑一次「產 Word → 案件中心階段變為回饋 → 案件流程頁可下載該 Word」，並補單元測試。

---

### [P1-2] work-planner 進度判定只認續約專屬欄位

狀態：已確認

證據：
- `assets/js/work-planner.js:26`（`taskProgress`）：`if(formDraft&&(formDraft.summary||formDraft.interviewerOpinion))return{label:"訪談已完成・待回饋"...}`。
- `summary`、`interviewerOpinion` 只存在於 `assets/js/terminal-form.js` 的序列化欄位；新會員、轉換行業別、期中草稿皆無這兩個 id。

實際影響：與 P1-1 疊加，非續約類型案件的首頁進度顯示不準。

建議修正：與 P1-1 一併處理，導入統一「訪談完成」旗標（各表單完成時寫入 workflow 的 `wordSaved`），`taskProgress` 改讀該旗標。

連動檔案：所有 `*-form.js`、`work-planner.js`、`case-board.js`、`notification-center.js`。

修正時機：正式上線前（與 P1-1 同一次改）。

驗證方式：各類型案件草稿狀態在首頁與案件中心顯示一致。

---

### [P1-3] 出席公告可能把同一會員同時列入「本周遲到」與「本週缺席」

狀態：高可信風險（靜態邏輯可證，建議 UI 實測確認）

證據：
- `assets/js/attendance.js:16`：`currentLate(r)=!r.absent&&!r.proxy&&(r.late||r.early)`
- `assets/js/attendance.js:17`：`currentAbsence(r)=r.absent||((r.at630||r.at700)&&!r.proxy&&!r.speech)`
- `assets/js/attendance.js:15`（`bindTable`）：對 `late` 無互斥處理。

實際影響：會員若「已到（at630/at700）＋遲到（late）＋未完成 25 秒簡報（speech 未勾）」，兩條件同時成立，公告的遲到與缺席名單各出現一次，且 6 個月缺席累計 +1，可能重複計算影響資格。

觸發／重現方式：
1. 出席頁勾某會員「07:00 到」。
2. 再勾「遲到」，不勾「25 秒簡報」。
3. 公告預覽：該員同時出現在兩份名單。

預期行為：遲到與「未簡報視同缺席」應互斥，或明確定義優先順序。

建議修正：先與 Sean／中心區確認「遲到且未簡報」的正式歸類，再於 `currentAbsence` 或 `currentLate` 加互斥，並在勾選時同步清另一狀態。此規則影響會員資格，不得自行決定。

連動檔案：`assets/js/attendance.js`、`docs/task-management.md`、`docs/OPEN_QUESTIONS.md`。

修正時機：正式上線前。

驗證方式：建立上述狀態組合，確認公告與累計不重複計算。

---

### [P1-4] 角色權限為純前端，可由 sessionStorage 提權（文件敘述須正名）

狀態：已確認（原型已知限制，非新 Bug）

證據：
- `assets/js/auth.js:31-36`（`validate`）：role 為 `vp` 時無條件回傳 true。
- `assets/js/case-workflow.js:44`（`isVp()`）只看下拉選項 `dataset.role`，該值由 session.role 產生。
- 投票、回饋、董顧、結案的防護（`case-workflow.js:262-269`）皆以前端判斷，資料存 localStorage。

實際影響：任何委員在 Console 將 `fulian-auth-session-v1` 的 `role` 改為 `vp` 即取得開票、送三長群、結案權限；直接改 `fulian-case-workflow-v2-*` 的 `votes` 或 `advisorStatus` 可偽造投票結果與董顧狀態，也可投他人的票。

建議修正：
- 現在：在 `docs/ARCHITECTURE_MAP.md` 既有「權限保護主要在前端」旁補「可被一般使用者繞過，非安全邊界」；避免任何文件把前端隱藏描述成存取控制。
- 正式上線前：以 Supabase Auth + RLS 讓角色與投票資格成為伺服器端控制。

連動檔案：`assets/js/auth.js`、所有以 `isVp()`／`can()` 判斷的頁面、`docs/architecture-hosting-security.md`。

修正時機：文件正名可立即；架構面為上線前底線。

驗證方式：上線版以兩個真實帳號測試委員無法觸發副主席操作。

---

### [P2-1] 真實會員姓名硬編碼於三個前端檔（GitHub 公開前必須移出）

狀態：已確認

證據：
- `assets/js/member-directory.js:2-7`：44 位真實會員全名。
- `assets/js/auth.js:11`：副主席姓名＋6 位委員全名，並含共用帳密明文預設值。
- `assets/js/attendance.js:2`：同一份 44 人全名（與 member-directory 重複、另一份維護來源）。

實際影響：屬個人資料；repository 公開即外洩全體會員名單。`docs/ARCHITECTURE_MAP.md` 架構債第 5 點已記載此事，此處補明「共用密碼明文」與「名單有兩份來源」。`.gitignore` 涵蓋 `data/` 等目錄，但不保護 `assets/js/` 內的名單。

建議修正：上 GitHub 前將名單改為去識別化範本或改由 `/api/bni-analysis` 帶入。確定 repo 公開／私有前，不要 push 這三個檔的真實內容。

修正時機：GitHub 化之前。

驗證方式：`git grep` 確認無真實姓名與密碼進入版本庫。

---

### [P2-2] 本機 API 無 CSRF／來源防護

狀態：待驗證（需啟動伺服器實測）

證據：
- `preview-server.mjs:114`：`/api/ai-chat`、`/api/ai-settings` 無 CORS 限制、無 Origin/Host 檢查、無認證；身分僅靠 body 的 `identity` 字串（格式 `vp:姓名`，可猜）。
- `preview-server.mjs:107`：`/api/ai-chat` 有每身分 1.8 秒節流；`/api/ai-settings` 無節流。

實際影響：預覽伺服器運行時，其他網站的頁面可用 no-cors POST 觸發 `/api/ai-chat`（消耗個人 token）或 `/api/ai-settings`（覆寫、移除金鑰綁定）。跨來源讀取回應會被瀏覽器擋下，但觸發副作用不會。

建議修正：對 `/api/*` 檢查 `Origin`／`Host` 是否為本機預覽網域，非本機一律 403。正式版改由 Supabase Edge Function 加使用者驗證。

修正時機：後續（原型階段風險有限，值得記錄）。

驗證方式：跨來源請求測試 API 是否被拒。

---

### [P2-3] 委員名單於案件進行中變動時，回饋門檻與基數隨即改變（回饋階段無資格快照）

狀態：高可信風險

證據：
- `assets/js/case-workflow.js:9`：`committee` 於載入時取自即時設定。
- `assets/js/case-workflow.js:47-49`：`eligibleMembers()`、`threshold()`、`feedbackCount()` 全依即時名單計算；只有投票開啟時才存 `voterSnapshot`（第 263 行）。

實際影響：某案回饋中若於設定頁增減委員，該案回饋門檻與基數立即變動。`docs/voting-rules.md` 第五節要求投票資格快照，但回饋階段與投票開啟前不受保護。

建議修正：案件建立或進入回饋時即保存委員快照，回饋與投票門檻皆以快照計算。屬投票資格邏輯，變更前先向 Sean 確認。

修正時機：正式上線前。

驗證方式：開啟一案回饋中，變更委員名單，門檻不應變動。

---

### [P2-4] `terminal-form.js` 的 Word 產生無 docx 未載入防護

狀態：已確認

證據：
- `assets/js/midterm-form.js:40`、`new-member-form.js:58`、`industry-change-form.js`、`departure-form.js` 皆有 `if(typeof docx==="undefined")` 防護。
- `assets/js/terminal-form.js:184-185`（`downloadWord`）直接解構 `docx.*`，無防護（全檔搜尋為 0）。

實際影響：`vendor/docx.iife.js` 載入失敗時，續約表單按下載會拋未處理例外且無提示。

建議修正：在 `terminal-form.js downloadWord` 開頭補上與其他四份表單一致的存在檢查與 toast。

修正時機：正式上線前（低風險小修，可立即）。

驗證方式：暫時移除 vendor 引用，確認五份表單一致顯示「元件尚未載入」而非無聲失敗。

---

### [P2-5] 出席名單有兩份獨立來源，易失同步

狀態：已確認

證據：`assets/js/attendance.js:2` 自帶 44 人陣列；`assets/js/member-directory.js:2` 另有一份；兩者未互相引用，`attendance.html` 也未載入 member-directory.js。

實際影響：會員異動需改兩處，漏改會使點名總人數（公告的「富聯會員總人數」以 `rows.length` 計）與其他頁面不一致。

建議修正：出席頁改引用 `window.FulianMemberDirectory.members` 作為單一名單來源（需同步在 attendance.html 加載 member-directory.js）。

修正時機：後續重構（第 3 階段共用化）。

驗證方式：修改一處名單後兩頁一致。

---

### [P2-6] 單行高密度檔集中在最易出錯的案件與表單邏輯

狀態：已確認（維護性）

證據：健檢列 19 檔；其中 `assets/js/case-creator.js`（1 行約 6KB）、`assets/js/new-member-form-live.js`（1 行）、`assets/js/settings.js`（20 行含多條長邏輯）風險最高，同時涉及案件建立、投票基數與帳密。

建議修正：依 `docs/REFACTOR_ROADMAP.md` 第 1 階段導入 Prettier 或 Biome，只格式化不改邏輯；上述三類檔優先。

修正時機：後續重構。

驗證方式：格式化後跑既有測試與各頁煙霧測試。

---

## 4. 待驗證風險（證據不足，值得後續測試，不列為已確認 Bug）

1. 登入開放轉址：`assets/js/login.js:5` `next=params.get("next")||"index.html"; location.href=next`，`next` 直接來自網址參數。理論上 `login.html?next=https://evil.com` 可於登入後轉外部站。建議白名單為站內相對路徑。
2. 公司統編代理無節流：`preview-server.mjs:17` `/api/company` 無速率限制，可被本機頁面當查詢代理濫用；風險低。
3. BNI 橋接欄位級校驗不足：`bni-bridge.mjs` 依賴相鄰 BNI 的 HTML class 與 XLS 固定欄位索引（如 `palmsMembers` 第 76-83 行）。BNI 端改版面或欄序時會靜默產生錯誤數據而非報錯。前端 `member-care.js:57` 有 schema 版本檢查，但欄位無健全性斷言。
4. 早退指標恆為 0：`assets/js/terminal-form-live.js:10` `early:0`（BNI PALMS 無早退欄位），續約 Word 第 8 題「早退 0 次」可能不反映實況，需確認資料來源。
5. AI 外部回應 XSS：`assets/js/ai-assistant.js:7` 回應與來源均經 `escapeAi()` 逃逸，看來安全，建議實測特殊字元確認。

---

## 5. 未使用或疑似重複檔案（僅列有證據者）

| 項目 | 證據 | 建議 |
|---|---|---|
| `archive/legacy/app.js` | 無任何 HTML 引用；`docs/STORAGE_SCHEMA.md:21` 稱它讀 `fulian-vp-course-v1`，實際讀舊 key 的是 `assets/js/dashboard.js:7` | 可保留於 archive；`REFACTOR_ROADMAP` 已規劃移除 |
| 首頁課程進度讀舊 key | `dashboard.js:7` 讀 `fulian-vp-course-v1`；`app-v2.js:1` 寫 `fulian-vp-course-v2` | 相容缺口：首頁「上手指南 %」不反映新課程進度。建議 dashboard 改讀 v2（一行小修） |
| Word 產生邏輯重複 | 五份表單各自複製相同的 `run/para/noBorders/meta` 樣板 | 第 3 階段抽共用 Word 工具模組，現階段勿動 |
| 表單共用函式重複 | `fileDateStamp/safeFileName/toast/localDateTime/answer/mark` 在五份表單各複製一份 | 第 3 階段抽共用 |
| `*-extra.css`、`*-v2.css`、`fixes.css` | 皆被對應 HTML 引用，非死檔 | 保留；屬樣式整併議題（P3） |

---

## 6. 文件與程式不一致清單

| 文件內容 | 實際程式 | 建議 |
|---|---|---|
| `docs/workflows.md:269` 第 8 點仍以「進階 MSP」為流程原文（第 283 行有註記已取代） | 程式與 decision-log、HANDOFF、requirements-draft 一致採「MSP 上／下任一堂」 | 以現行決策為準；在原文旁更醒目標註已廢止 |
| `docs/STORAGE_SCHEMA.md:21` 稱 `fulian-vp-course-v1` 讀取者為 `archive/legacy/app.js` | 實際讀取者是 `assets/js/dashboard.js:7`；`app.js` 未被引用 | 以程式為準更新文件，並處理上表的相容缺口 |
| 表單預設備註「灰燈不予續約」（`terminal-form.js:7`） | 程式燈號僅產生綠／黃／紅／黑燈（`bni-bridge.mjs:98`、`terminal-form.js:118`），無「灰燈」 | 釐清灰燈與黑燈是否同義，統一命名 |
| `docs/voting-rules.md` 第九節多項待確認（棄權、記名、平票終局） | 程式已實作：同票不決議、門檻 `floor(基數/2)+1`、迴避只比對申請者本人 | 一致；未決項屬制度面，程式行為符合已確認規則 |

文件路徑檢查：CLAUDE.md、README、manifest、AI_START_HERE 引用的 docs 路徑全部存在。CLAUDE.md 與 AGENTS.md 完全相同。

---

## 7. 建議處理順序（低風險高收益優先）

1. P1-1 與 P1-2 一起修：抽共用 `saveWordToCase`＋統一「訪談完成」旗標。先修原因：主流程正確性，一次改動解掉兩個 P1。
2. P2-4 terminal docx 防護：補一行守衛。先修原因：極低風險，避免續約下載無聲失敗。
3. P1-4 文件正名：權限敘述修正，零程式風險。
4. P1-3 出席重疊：先向中心區確認「遲到且未簡報」歸類，再改互斥邏輯。先修原因：影響資格累計。
5. dashboard 課程進度改讀 `fulian-vp-course-v2`。先修原因：一行小修，首頁數據正確。
6. P2-3 委員名單快照：回饋階段加快照，需 Sean 確認後改。
7. P2-5 名單單一來源：attendance 改用 member-directory。
8. P2-2 本機 API Origin 檢查。
9. 第 1 階段格式化：Prettier 處理單行檔（先 case-creator、settings、*-form-live）。
10. BNI 橋接欄位健全性斷言（待驗證第 3 點）。

---

## 8. 不建議現在進行的工作

- 框架重寫（React／Vue／TypeScript）：資料模型與測試尚未穩定，依 `REFACTOR_ROADMAP` 第 5 階段再評估。
- 在副主席系統重寫 BNI 計分／燈號公式：相鄰 `../BNI` 為唯一來源，橋接唯讀即可。
- 大規模 CSS 重整（合併 extra／v2／fixes）：目前皆有引用且運作正常，風險高於收益。
- 把「尚未接 Supabase 後端」當成待修 Bug：屬既定階段規劃，非缺陷。

---

## 9. 建議補上的自動測試（依風險排序）

1. `stageOf`：三種 flow 類型在「有草稿＋wordSaved」時皆進 FEEDBACK（守住 P1-1 修正）。
2. 投票決議：基數 5／6／7 的門檻、2:2 平票不決議、3:1 通過、1:3 不通過等邊界。
3. 迴避：申請者本人為委員時排除且不列入基數；主訪、陪訪不排除（補投票基數斷言）。
4. 出席：已到未簡報與遲到不重複計缺席（守住 P1-3 修正）。
5. 出席累計：3 次遲到／早退折 1 缺席、第 4 缺席與第 9 代理警示邊界。
6. `draftStorageKey`／`workflowStorageKey`：各案件類型 Key 唯一且與 STORAGE_SCHEMA 一致。
7. 續約 PALMS 期間：第一次續約用實際會籍月數、第二次起用前 12 完整月。
8. 引薦金額門檻：低於等於 100 萬勾低、高於 400 萬勾高、中間不勾。
9. bni-bridge 欄位健全性：關鍵欄位缺失或欄序異常時報錯而非產生 0 值。
10. preview-server 路徑防護：`..`、URL 編碼、絕對路徑請求皆被拒，不逃出 ROOT。

---

## 10. 結論

適合繼續擴充功能。核心域模型設計正確、有測試護欄，健檢與測試全綠，文件與程式大體一致，靜態檔路徑防護（`preview-server.mjs:114` 的 `startsWith(ROOT+sep)`）與 AI 金鑰的專案外 AES-256-GCM 加密（`preview-server.mjs:32`）方向正確。未發現 P0。

正式上線前必須完成的底線工作：

1. 補齊新會員／轉換行業別的案件流程推進（P1-1、P1-2）。
2. 釐清並修正出席「遲到 vs 未簡報缺席」重疊（P1-3，需中心區確認）。
3. 以 Supabase Auth＋RLS 取代純前端權限（P1-4）。
4. GitHub 化前移出前端真實會員名單與共用密碼明文（P2-1）。
5. 回饋與投票的委員資格快照（P2-3）。

本報告為只讀審查產出，未修改任何程式檔案。等待 Sean 或 Codex 第二次核對與排序後再進行修正。
