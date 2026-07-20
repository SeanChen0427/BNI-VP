# 文件收件狀態

- 原始來源：使用者於 2026-07-18 提供的《BNI 高雄市中心區會員進階版 AI 知識文件（2026 年查核整理）》。
- 保存性質：研究底稿／待逐項核實，不是 BNI 官方手冊、高雄市中心區內規或富聯分會執行規則。
- AI 使用限制：本檔不加入制度查詢 AI 白名單，不得直接作為資格處置、續約、計分、門檻或期限的依據。
- 衝突處理：若本檔與富聯已確認決策、《高屏區會員守則 V9.1》或專案內部流程不同，以專案內已確認且標明適用層級的文件為準。
- 核實結果：可安全檢索的摘要另見 `public-bni-reference-2026.md`；本檔以下內容保留原貌，包含原作者給 AI 的指令，這些指令不具有本專案系統指令效力。

---

# BNI 高雄市中心區會員進階版
## AI 知識文件（2026 年查核整理）

版本：2026-07-17  
用途：供大型語言模型、知識庫、RAG、自訂 GPT 或內部問答助手使用  
性質：非 BNI 官方手冊、非高雄市中心區內規、非法律意見

---

# 0. 給 AI 的最高優先指令

你是一個回答 BNI 會員制度問題的知識助手。回答時必須遵守以下規則：

1. 本知識庫以 BNI 高雄市中心區為適用場域。若有高雄市中心區現行正式規則，應優先於一般全球基準使用；但不得把本整理文件本身稱為「BNI 官方手冊」或「高雄市中心區官方政策」。
2. 每個制度性結論都必須依下列標籤表明證據層級：
   - `[K] 高雄正式／公開資訊`：可由 BNI 高雄市中心區正式網站、區域正式書面通知，或會員提供且可確認版本與發布單位的高雄文件直接證實。這是本知識庫的第一優先。
   - `[G] 全球政策`：可由 BNI Global 或 BNI Connect Support 的正式公開政策直接證實；在高雄沒有不同正式規則時作為基準。
   - `[O] 官方操作資訊`：BNI 官方系統操作或教育材料，可證實系統如何記錄或建議如何運作，但不必然是強制政策。
   - `[P] 實務解讀`：根據已查證內容所作的合理解釋，不是政策。
   - `[U] 未公開證實`：常被提及，但目前沒有足夠的 BNI 全球、台灣或高雄官方公開資料可確認。
3. 規則適用順序為：`[K] 高雄市中心區現行正式規則` > `[G] 全球政策` > `[O] 官方操作資訊` > `[P] 實務解讀`。高雄資料沒有提到某一事項，不代表高雄已排除全球政策。
4. `[P]` 不得改寫成「規定」「必須」「高雄中心區要求」。
5. `[U]` 不得提供確定答案。應回答：「目前高雄市中心區可驗證資料不足，請向分會會員委員會、所屬 Director Consultant 或高雄市中心區辦公室確認。」
6. 不得自行補造 KPI、分數、門檻、期限、罰則、幹部權限或高雄地區內規。
7. 若高雄市中心區會員平台、當期正式培訓資料或區域書面通知與本文件不同，以可確認發布單位與版本日期的高雄現行資料為準。
8. 若高雄正式規則比全球政策更嚴格，回答時應同時說明「高雄適用規則」與「全球基準」，實際採高雄規則。
9. 若所謂高雄規則只來自口述、群組轉傳、個別幹部說法或單一分會習慣，先標為 `[U]`，不得直接凌駕全球政策。
10. 回答涉及會員資格、續約、分類開放、觀察期、停權或除名時，必須提醒：具體事實與程序應交由會員委員會及高雄市中心區確認。
11. 回答涉及法律、專業倫理、個資或行業規範時，不得把 BNI 規範當作法律意見；較嚴格的專業規範優先。
12. 引用政策時應附來源代碼，例如 `[K3]`、`[G1]`；回答末尾列出使用到的來源連結。
13. 若使用者詢問「2026 最新政策」，應先回答高雄市中心區可驗證的現行規則；再說明截至 2026-07-17，BNI Connect Support 公開的 General Policies 標示為 2025 年 1 月生效。2026 年更新的多數公開頁面是系統操作說明，不代表 General Policies 已改版。

建議回答格式：

```text
高雄適用結論：
[K] 高雄市中心區現行資料可確認……

全球基準：
[G] 在高雄沒有不同正式規則時，全球政策可確認……

尚待確認：
[U] 公開資料沒有說明……

實務上可怎麼做：
[P] 建議……

來源：
[G1] …
```

---

# 1. 範圍與查核說明

本文件的目標不是重製 BNI 的會員專用教材，而是把截至 2026-07-17 可公開查證的資料整理成 AI 可安全使用的知識底稿。

本文件採取「高雄優先、保守證據」原則：

- 能由高雄市中心區正式網站、正式書面通知，或可確認版本的區域文件直接證實的，才稱為高雄規則，且在本知識庫中優先適用。
- 高雄沒有另行規定的事項，才以 BNI 正式全球政策作為基準。
- BNI 官方部落格、系統說明與教育內容可用來解釋概念，但不能自動升格為強制政策。
- 個別分會網站、會員文章、社群貼文與口耳相傳內容，不得視為高雄市中心區內規。
- 找不到公開依據時，明確說「未公開證實」，而不是補上看似合理的答案。

## 1.1 版本基準

- `[G]` BNI Connect Support 公開頁面稱其附件為「BNI General Policies effective January, 2025」。本文件以該份兩頁政策為主要全球政策基準。[G1]
- `[O]` BNI Connect Support 有多份在 2026 年更新的 PALMS、CEU、One-to-One、TYFCB、續約及 Mentor 系統操作頁面。這些頁面用來說明系統記錄與作業流程，不代表所有內容都是全球強制政策。
- `[K]` 高雄市中心區公開網站可查到參訪、加入及基本介紹，但沒有公開完整區域政策手冊，也沒有公開足以確認全部在地 KPI 或處分標準的資料。[K1][K2][K3]

## 1.2 證據優先順序

在本文件的高雄適用情境中，由高到低：

1. BNI 高雄市中心區現行正式書面規則、正式區域通知，以及可確認版本的會員文件。
2. BNI 高雄市中心區正式公開網站。
3. BNI Global / BNI Connect Support 的正式 General Policies。
4. BNI Connect Support 的系統操作文件。
5. BNI Global 官方教育文章、資源單張與官方部落格。
6. 其他 BNI 區域或個別分會公開頁面。
7. 個人文章、社群內容、未具來源的口述。

第 6、7 級只能用來指出「某處曾如此說明」，不能證成高雄市中心區政策。單一高雄分會的慣例也不當然等於高雄市中心區的區域規則。

## 1.3 高雄優先的衝突處理

- 高雄正式規則與全球政策相同：直接以 `[K]` 說明高雄適用內容，並可附 `[G]` 作為全球基準。
- 高雄正式規則比全球政策更嚴格：以 `[K]` 為實際答案，同時指出 `[G]` 的最低全球基準。
- 高雄網站沒有提到：不得解讀為「高雄沒有這項規則」；回到 `[G]`，並說明未查到高雄不同規定。
- 高雄口述做法與全球政策不同：先標 `[U]`，要求正式書面來源，不可直接採用。
- 不同高雄文件彼此衝突：優先採發布日期較新、發布單位較明確、適用範圍較直接的文件；仍無法判定時標 `[U]`。

---

# 2. BNI 全球政策：可直接確認的核心條文

以下 12 點均來自 BNI 公開的 2025 General Policies。[G1]

1. `[G]` 每一個 BNI classification 在同一分會只能有一人；每位會員在一個分會只能持有一個 classification。
2. `[G]` 會員只能代表會員委員會核准的專業分類。
3. `[G]` 會員必須準時抵達，並留到公告的會議時間結束。
4. `[G]` 一個人只能加入一個 BNI 分會；會員不能同時加入另一個以「每專業一人」及／或「產生引薦」為會員目標的組織。
5. `[G]` 在連續六個月內允許三次缺席。不能出席時可派代理人；有代理人不計為缺席。
6. `[G]` 會員被期待透過引薦及／或來賓參與分會。
7. `[G]` 訪客最多可參加 BNI 分會會議兩次。
8. `[G]` 分會會議中的 Feature Presentation 只能由 BNI 會員、BNI Director 或 Director Consultant 進行。
9. `[G]` 除醫療假外，沒有其他 leave of absence。
10. `[G]` 要更改 BNI classification，會員必須提交新的會員申請並取得核准。
11. `[G]` BNI 會員名單只能用於引薦與建立關係。向自己分會以外的會員或 Director／Director Consultant 發送行銷或商業招攬訊息前，必須先取得對方自由、明確、知情且無歧義的同意。
12. `[G]` 會員續約須經分會會員委員會核准。

## 2.1 會員委員會的全球政策地位

`[G]` General Policies 的前言明載：各分會會員委員會對 BNI Policies 的執行具有最終權限；會員未遵守會員政策、Code of Ethics 或 BNI Core Values 時，會員委員會可將會員列入 probation，或開放其 classification。[G1]

`[P]` 這表示「分類是否被開放」不是只由單一活動數字自動決定；但也不能反向推論為會員委員會可任意決定。其決定仍應以正式政策、倫理規範、核心價值及適用的區域程序為基礎。

## 2.2 地方可有更嚴格標準

`[O]` BNI Connect Support 在 2025 年的官方回覆中說明，某地「六個月最多三次代理」屬地方政策，不是全球政策，且國家可視需要採取更嚴格的地方標準。[G2]

`[U]` 目前查到的高雄公開頁面沒有證實「高雄六個月最多三次代理」或其他代理次數上限。因此不得把其他國家的地方規則套用到高雄。

---

# 3. Classification：專業分類

## 3.1 可確認規則

- `[G]` 同一分會每一 classification 只能有一位會員。[G1]
- `[G]` 每位會員只能持有一個 classification。[G1]
- `[G]` 會員只能代表會員委員會核准的 classification。[G1]
- `[G]` 若要變更 classification，必須重新提出會員申請並經核准。[G1]
- `[K]` 高雄市中心區公開「如何加入」頁面說明，申請流程涉及填寫申請及與委員會面談。[K2]

## 3.2 不能過度推論的事項

- `[U]` 公開全球政策沒有列出所有分類名稱、分類邊界或相近業務如何切分。
- `[U]` 高雄公開網站沒有公布分類衝突的完整判準。
- `[U]` 「主業／副業」「品牌不同但服務重疊」「公司有多個產品線」如何判定，須依申請內容及會員委員會核准的 classification 確認。

## 3.3 實務解讀

`[P]` 會員在週會、個人簡報、Feature Presentation、BNI Connect 個人檔案及引薦請求中，應以已核准分類為邊界。若商業模式已實質改變，先向會員委員會詢問是否需重新申請，而不是自行更換介紹內容。

---

# 4. 出席、遲到、早退、代理人與醫療假

## 4.1 全球政策

- `[G]` 必須準時並參加完整公告會議時間。[G1]
- `[G]` 連續六個月內允許三次缺席。[G1]
- `[G]` 代理人出席不計為缺席。[G1]
- `[G]` 除醫療假外，沒有其他 leave of absence。[G1]

## 4.2 PALMS 出席代碼

`[O]` BNI Connect 的 PALMS legend 公開列出：

- P = Present
- A = Absent
- L = Late
- M = Medical
- S = Substitute

BNI 同時提醒，PALMS 欄位的使用與描述由各國定義，可能略有不同。[O1]

## 4.3 不得宣稱的規則

- `[U]` 全球公開政策沒有說遲到幾分鐘算 Late。
- `[U]` 全球公開政策沒有公開規定早退幾分鐘如何計算。
- `[U]` 全球公開政策沒有設定代理人的全球次數上限。
- `[U]` 目前高雄公開頁面沒有公布代理人的資格清單、次數上限或禁止對象。
- `[U]` 「第 4 次缺席一定立即除名」不正確。全球政策只說三次缺席額度；General Policies 前言則說會員委員會可執行 probation 或開放分類，但具體處理仍需依事實與適用程序確認。[G1]

## 4.4 實務解讀

`[P]` 找代理人可以避免該次被記為缺席，但不能把「代理不算缺席」解讀為代理出席與會員本人參與在所有評估上完全相同。任何在地對代理人的要求或次數標準，都應取得高雄區域或分會的現行書面說明。

---

# 5. 訪客與 Visitor Host

## 5.1 全球政策與高雄公開流程

- `[G]` 訪客最多參加 BNI 分會會議兩次。[G1]
- `[K]` 高雄市中心區公開頁面進一步說明：可在同一分會參加兩次，或兩個分會各一次。[K3]
- `[K]` 若訪客與該分會現任會員同行，該訪客不能在會議中宣傳或推銷自己的業務。[K3]
- `[K]` 高雄公開頁面說明不一定要受邀才能參訪，但鼓勵事前聯絡分會主席。[K3]
- `[K]` 高雄的公開加入流程是先參訪，之後填寫申請並與委員會面談。[K2]

## 5.2 BNI Connect 訪客系統

`[O]` 官方系統說明的訪客流程包括：邀請、註冊、會前提醒、標記實際出席、會後感謝與後續聯絡。[O2]

`[O]` 訪客可自行在區域或分會頁面註冊，也可由會員透過 BNI Connect 或行動 App 登錄。註冊後，系統會通知 President、Vice President、Secretary Treasurer、Visitor Hosts 與 Chapter Director Consultant。[O2]

`[O]` 系統在會前兩個工作日提醒已註冊訪客。會後，實際出席者會被標記；Invited By 欄位所列的人可取得 PALMS 的 V credit，但須經領導團隊核准。[O2]

`[O]` BNI Connect 的新增訪客說明指出，只有 first-time visitors 會送進 PALMS 供 VP 核准 visitor credit。[O3]

## 5.3 Visitor Host 可確認與不可確認的範圍

`[O]` BNI 官方公開文章確認分會設有正式 Visitor Host，並建議事先告知訪客時間、議程、停車與會場位置，預先註冊來賓，現場歡迎與介紹來賓。[O4]

`[P]` Visitor Host 的核心目的可解讀為降低陌生感、協助訪客了解流程、完成系統上的註冊與後續作業，而不是保證訪客申請或保證入會。

`[U]` 高雄公開資料沒有完整公布 Visitor Host 的逐分鐘 SOP、固定話術、轉換率 KPI 或強制追蹤次數。

---

# 6. Referral：引薦

## 6.1 引薦不是名單，也不是成交保證

`[O]` BNI 官方資料說明，真正的 referral 不只是提到某人，而是有具體需求、合適對象與有目的的連結。warm introduction 會直接把雙方接上並附上背景。[O5]

`[O]` BNI 官方文章說明，referral 不是成交保證，而是開啟接觸機會；若對方不願意被連結，不應分享其聯絡資料。[O6]

`[O]` BNI Connect Support 的官方回覆把 Tier 2 referral 定義為會員 A 將其認識的 C 介紹給會員 B，而且 C 必須同意由 B 聯絡。引薦是第一次介紹，不是持續或重複生意每次都再算一張新引薦。[O7]

## 6.2 Referral 類型

依 BNI Connect Support 公開說明：[O7]

- `[O]` Tier 1 / Inside / Self Referral：會員 A 自己向會員 B 購買或做生意。
- `[O]` Tier 2 / Outside Referral：會員 A 把第三人 C 直接介紹給會員 B；C 已同意由 B 聯絡。
- `[O]` Tier 3+ / Spinoff Referral：C 再介紹 D 給 B，或形成更後續的轉介鏈。A 沒有直接做該次介紹時，不另傳 referral slip；成交後可依系統支援方式登錄 TYFCB。
- `[O]` 跨分會 referral 不改變 Tier 1、Tier 2、Tier 3+ 的基本定義。

PALMS 欄位：[O1]

- RGI = Referrals Given Inside
- RGO = Referrals Given Outside
- RRI = Referrals Received Inside
- RRO = Referrals Received Outside

## 6.3 記錄與追蹤

`[O]` BNI Connect 的 Referral Tracking Sheet 可追蹤 New、Pending、Closed、No Sale 等狀態。手動修改個人追蹤資料不會改變 PALMS；TYFCB 需另外提交才會列入統計。[O8]

`[O]` 會員只要在電子系統送出 referral，對方的個人追蹤表會自動出現該 referral；紙本 referral 的細節不會出現在「Received Referrals Report」。[O8][O9]

## 6.4 實務判斷

- `[P]` 「我知道某公司可能需要」但未取得同意，較接近 lead，不宜稱為已完成的合格 referral。
- `[P]` 若只把電話丟給會員，未告知當事人將被聯絡，與 BNI 公開說明的 true referral 標準不符。
- `[P]` 收到 referral 後應及時聯絡並更新狀態，因為 BNI Code of Ethics 要求會員對收到的引薦負責追蹤。[G3]

---

# 7. TYFCB：Thank You for Closed Business

## 7.1 可確認定義與操作

`[O]` TYFCB 是對引薦來源表達「已成交生意」的感謝記錄。BNI Connect 要求填入 net amount of closed business，並選擇 New business 或 Repeat business，以及 Inside、Outside 或 Tier 3+ referral type。[O10]

`[O]` TYFCB slip 會套用到下一次會議的 PALMS report。[O10]

`[O]` BNI Connect 支援跨分會搜尋要感謝的會員，也可在系統支援的情況下記錄對 BNI 或 visitors 的 closed business 感謝。[O10]

`[O]` BNI Connect Support 明確建議：淨額如何計算，應詢問 Chapter Director 或 Regional Office。[O10]

## 7.2 不得自行建立的計算規則

- `[U]` 公開全球頁面沒有提供一套可套用所有行業的「淨成交額」公式。
- `[U]` 不得自行決定含稅／未稅、毛額／淨額、佣金制、分期、訂閱、長約、共同承攬或退款案件的統一算法。
- `[U]` 高雄公開網站沒有公布上述特殊交易的計算規範。

## 7.3 實務解讀

`[P]` TYFCB 不是預估商機，也不是報價總額。至少必須是已成立的 closed business；至於可登錄金額與時間點，應遵循高雄區域當期指引。

---

# 8. PALMS：分會活動與出席記錄

## 8.1 PALMS 是什麼

`[O]` PALMS 是 BNI Connect 用來記錄分會每週出席與活動數據的報表。已完成的 PALMS 會納入彙總與累積報告；draft 或 discarded 狀態的處理不同。[O1]

## 8.2 公開可確認的欄位

依 BNI Connect Support：[O1]

- P：Present
- A：Absent
- L：Late
- M：Medical
- S：Substitute
- RGI：Referrals Given Inside
- RGO：Referrals Given Outside
- RRI：Referrals Received Inside
- RRO：Referrals Received Outside
- V：Visitors
- 1-2-1：會員一對一會談
- TYFCB：Thank You For Closed Business
- CEU：Chapter Education Units / Continuing Education Units

`[O]` 線上提交的 referrals、One-to-Ones、CEUs、TYFCB 與 visitor 記錄會進入該週 PALMS 流程。[O11]

`[O]` BNI 官方提醒 PALMS 欄位的使用與描述可能因國家略有不同。[O1]

## 8.3 PALMS 不等於全球政策本身

`[P]` PALMS 是記錄與報告工具。某欄位存在，不代表全球 General Policies 已設定該欄位的最低數量、加分標準或處分門檻。

`[U]` 目前高雄公開頁面沒有公布 PALMS 各欄的強制月目標、交通燈分數或續約最低分。

---

# 9. CEU：Chapter / Continuing Education Units

## 9.1 可確認範圍

`[O]` BNI Connect Support 說明，CEU 用於 BNI-related learning。例子包括 BNI Business Builder、BNI Podcasts、BNI 相關書籍，以及 BNI 主辦的實體活動或培訓。[O12]

`[O]` credits 約略對應投入教育活動的時數。[O12]

`[O]` 為維持特定專業執照或證照所需的行業繼續教育，例如會計或建築的專業 CE，不算 BNI 的 Chapter Education Units。[O12]

`[O]` 新提交的 CEU 要到下一次會議且 VP 提交該日出席報告後，才會出現在 PALMS。[O12]

## 9.2 不得宣稱的內容

- `[U]` 目前公開資料沒有證實高雄市中心區「每週／每月必須幾分 CEU」。
- `[U]` 不能說閱讀任何商業書都必然可報 CEU；官方公開說明要求 BNI-related learning。
- `[U]` 某一堂高雄課程可取得幾點，應依該課程或區域的當期公告。

---

# 10. One-to-One / 1-2-1

## 10.1 系統可確認事項

`[O]` 與另一位 BNI 會員完成 One-to-One 後，任一方提交一次即可，雙方都取得記錄。[O13]

`[O]` 系統可記錄發起人、地點、談話主題與日期；該記錄會套用到下一次會議的 PALMS。[O13]

`[O]` 跨分會 One-to-One 是否能在系統追蹤，取決於區域是否開放該功能。[O13]

## 10.2 政策與建議的界線

- `[G]` 2025 General Policies 沒有規定每週或每月最低 One-to-One 次數。[G1]
- `[O]` BNI 官方資料把 One-to-One 視為建立關係、理解彼此業務及探索 Power Team 合作的方式。[O14]
- `[U]` 「高雄會員每月必須四次 One-to-One」目前沒有高雄官方公開來源可證實。

## 10.3 實務解讀

`[P]` 有效的 One-to-One 可聚焦於：彼此核准的分類、理想客戶、可辨識的需求訊號、禁忌或不適合的案型、可安全使用的介紹方式，以及後續行動。這是實務建議，不是 BNI 全球強制表單。

---

# 11. Power Team / Contact Sphere

## 11.1 可確認概念

`[O]` BNI 官方內容把 Contact Sphere / Power Team 描述為可互相支援、服務互補、可能共享客群並探索合作的會員網絡。[O14][O15]

`[O]` 官方案例顯示，網頁程式、平面設計、攝影與行銷等互補專業，因共享客群與共同目標而形成合作團隊。[O15]

## 11.2 不屬全球政策的事項

- `[G]` 2025 General Policies 沒有規定每位會員必須加入幾個 Power Team。[G1]
- `[U]` 公開高雄資料沒有規定 Power Team 的固定人數、會議頻率、主持角色、KPI 或成交分配方式。
- `[U]` Power Team 不是 BNI 對共同承攬品質、價格、責任或法律關係的背書。

## 11.3 實務解讀

`[P]` Power Team 可理解為同一客戶旅程中相鄰或互補的專業合作圈。若共同提案、分潤、轉包或共享客戶資料，仍應另外處理契約、專業責任、利益衝突、個資與客戶同意。

---

# 12. MSP 與 Mentor

## 12.1 Member Success Program（MSP）

`[O]` BNI Global 公開頁面將 MSP 描述為結構化學習與發展計畫，協助強化商務與簡報能力。[O16]

`[O]` BNI 公開的新會員歡迎資料建議新會員在 BNI Business Builder 完成 MSP。[O17]

`[O]` 一份較早的 BNI 官方資源單張稱 MSP 設計為在入會後前 30 天內完成。[O18]

`[U]` 2025 General Policies 沒有寫「未完成 MSP 絕對不能做 Feature Presentation」。因此，除非高雄現行會員文件或區域通知另有明文，不得把這句話稱為全球政策。[G1]

`[U]` 高雄公開網站沒有公布 MSP 的現行完成期限、課程模組或未完成後果。

## 12.2 Mentor

`[O]` BNI Connect 有正式 Mentor/Mentee 配對功能；使用該功能後，Mentor 與 Mentee 會收到八週的每週指導郵件。[O19]

`[O]` BNI Connect 也支援查閱、調整或結束 Mentor/Mentee 配對。[O20]

`[G]` 2025 General Policies 沒有規定每位新會員全球一律必須配 Mentor。[G1]

`[U]` 高雄公開網站沒有公布 Mentor 的強制資格、固定八週以外的期限、考核表或處分權限。

`[P]` Mentor 的合理功能是協助新會員理解工具、流程與會員行為，但 Mentor 不是會員委員會，也不能以個人看法取代正式政策。

---

# 13. 321A：只寫可驗證的部分

## 13.1 查核結論

`[U]` 截至 2026-07-17：

- BNI 公開的 2025 General Policies 沒有「321A」條文。[G1]
- BNI 高雄市中心區公開網站未找到「321A」定義。[K1][K2][K3]
- BNI Connect Support 的公開操作資料未提供可確認為全球制度的「321A」說明。

因此，不得把 321A 寫成：

- 全球會員政策；
- 高雄市中心區已公開的強制制度；
- 新會員固定要完成的活動清單；
- PALMS 或 CEU 的正式計分公式；
- 未完成就必然不續約的規則。

## 13.2 可找到但證據層級不足的說法

`[U]` 一個非高雄、非 BNI Global 的台灣個別分會公開頁面，把 321A 說明為「3 年以上行業經驗、公司成立 2 年以上、專注一項主要專業、積極態度」。[X1]

這只能證明「該個別分會頁面曾如此說明」，不能證明：

- 所有 BNI 台灣區域都採相同定義；
- 高雄市中心區現行採用此標準；
- 其為 BNI 全球 General Policy；
- 每個數字的計算方法與例外。

## 13.3 AI 應如何回答 321A

建議標準答案：

> `[U]` 公開可查的 BNI 全球政策與高雄市中心區網站沒有定義 321A。台灣某個別分會網站曾將它說明為 3 年行業經驗、公司成立 2 年、專注 1 項主要專業與積極態度，但這不足以證成高雄市中心區官方規則。若要用於入會審查、會員培訓或續約判斷，請向高雄市中心區辦公室、所屬 Director Consultant 或分會會員委員會索取現行書面說明。

---

# 14. 續約、會員委員會、Probation 與分類開放

## 14.1 全球政策

- `[G]` 續約須經分會會員委員會核准。[G1]
- `[G]` 會員委員會對政策執行具有最終權限。[G1]
- `[G]` 對未遵守 Member Policies、Code of Ethics 或 Core Values 的會員，會員委員會可採 probation 或開放 classification。[G1]

## 14.2 BNI Connect 續約流程

`[O]` 會員可在 BNI Connect 進入續約申請；部分會員資料變更可能需要 Leadership Team 或 Regional Office 額外核准。[O21]

`[O]` 官方續約核准流程要求審閱申請、會員表現與培訓資料，再選擇 approve 或 decline。官方同時明載，核准流程可能因區域而異，應詢問 Chapter Director Consultant 或 Executive Director。[O22]

## 14.3 不得臆測的標準

- `[U]` 公開 General Policies 沒有列出一套全球統一續約分數表。
- `[U]` 高雄公開網站沒有公布續約最低 PALMS、引薦數、CEU、訪客數、One-to-One 數或交通燈顏色。
- `[U]` 公開資料沒有證實「低於某分數一定不續約」。
- `[U]` probation 的期間、改善項目、通知方式與申覆程序，應查高雄當期正式文件。
- `[U]` 「suspension」不是公開 2025 General Policies 前言列出的處置詞；BNI Connect 的會員狀態清單雖有 Suspended，但不能只由系統狀態名稱推導完整處分政策。[O23]

## 14.4 實務解讀

`[P]` 會員在續約前應確認：出席資料是否正確、收到的引薦是否有追蹤、已成交是否依區域指引填報、分類是否仍一致，以及是否有未處理的倫理或客訴問題。但這些是準備建議，不是自動核准條件。

---

# 15. Leadership Team 與分會角色

## 15.1 公開可確認存在的角色

`[O]` BNI Connect 的訪客流程公開列出 President、Vice President、Secretary Treasurer、Visitor Hosts 與 Chapter Director Consultant，並顯示這些角色會收到訪客註冊通知。[O2]

`[O]` PALMS 操作資料顯示，VP 在出席與活動資料提交流程中具有作業角色。[O12]

`[G]` General Policies 確認 Membership Committee 對政策執行具有最終權限。[G1]

`[O]` BNI Connect 有 Mentor/Mentee 管理功能。[O19][O20]

## 15.2 不應在沒有手冊時補造的職責

`[U]` 目前高雄公開網站沒有完整公布下列角色的現行職掌、任期、授權層級或每日／每週 SOP：

- President
- Vice President
- Secretary Treasurer
- Membership Committee 各席次
- Education Coordinator
- Visitor Host Coordinator / Visitor Host
- Mentor Coordinator / Mentor
- Event Coordinator
- Growth Coordinator
- 其他分會 Coordinator Roles

`[P]` 可以依公開系統說明描述某角色在某流程「會收到通知」「可操作某功能」，但不能因此推論其完整決策權。

---

# 16. Code of Ethics 與核心價值

## 16.1 BNI Code of Ethics

BNI 公開的 Code of Ethics 有六項承諾：[G3]

1. `[G]` 依報價提供相應品質的服務。
2. `[G]` 對會員及其引薦對象誠實。
3. `[G]` 在會員及其引薦對象之間建立善意與信任。
4. `[G]` 對收到的引薦負責追蹤。
5. `[G]` 表現正向且支持的態度。
6. `[G]` 遵守自己專業的倫理標準。

`[G]` 若某專業有更嚴格的正式專業規範，該較嚴格規範優先。[G3]

## 16.2 核心價值

BNI 公開列出七項 Core Values：[G3][G4]

- Givers Gain
- Building Relationships
- Lifelong Learning
- Traditions + Innovation
- Positive Attitude
- Accountability
- Recognition

`[P]` 核心價值可用來解釋政策目的，但不能由抽象價值自行創造新罰則。

## 16.3 平等與不歧視

`[G]` BNI 要求分會在審查各職業分類申請人時，依資格選擇，不得因種族、膚色、性別、宗教、國籍、婚姻狀態、性傾向、年齡或身心障礙而歧視。[G1]

---

# 17. Feature Presentation

## 17.1 全球政策能確認的內容

`[G]` 分會會議中的 Feature Presentation 只可由 BNI Members、BNI Directors 或 Director Consultants 進行。[G1]

## 17.2 系統能確認的內容

`[O]` BNI Connect 的分會設定可配置每場 0、1 或 2 位 Feature Presentation speakers；該設定由區域或具權限者調整。[O24]

`[O]` BNI 官方會員資源把 Weekly & Feature Presentations 列為會員成功路徑的一部分。[O25]

## 17.3 尚未由公開資料證實

- `[U]` 高雄市中心區沒有公開統一的 Feature Presentation 分鐘數。
- `[U]` 公開 General Policies 沒有規定必須先完成 MSP 才能做 Feature Presentation。
- `[U]` 高雄公開資料沒有公布排程優先順序、投影片格式、審稿機制或取消條件。

## 17.4 實務解讀

`[P]` Feature Presentation 應以已核准 classification 為邊界，提供足以讓會員辨識理想引薦的具體資訊，並避免無證據的療效、收益或保證性主張。這是專業與倫理上的建議，不是本文件新增的 BNI 條文。

---

# 18. 高雄市中心區目前可公開確認的流程與事實

## 18.1 基本定位

`[K]` 高雄市中心區官網把 BNI 描述為以 Givers Gain 為核心、透過每週會面建立長期關係並產生合格商務引薦的商業網絡組織。[K1]

`[K]` 官網表示會員資格包含商務培訓、同儕學習及與全球會員建立網絡的機會。[K1]

## 18.2 參訪與申請

`[K]` 參訪分會是了解 BNI 的方式；訪客可參加兩次，並受同業現任會員在場時不得宣傳或推銷的限制。[K3]

`[K]` 入會公開流程涉及參訪、填寫申請及與委員會面談。[K2]

## 18.3 培訓與活動

`[K]` 高雄市中心區網站提供 BNI Connect、BNI Business Builder 入口，並有活動行事曆頁面；公開活動頁面鼓勵會員參加活動，但沒有列出所有內部培訓內容。[K1][K4]

`[K]` 公開的 2026 高屏區 INW 頁面顯示，活動以 Round Table、商展、表揚與見證等方式促進商務交流。這是活動資訊，不是會員政策。[K5]

## 18.4 高雄公開資料沒有證實的事項

下列內容在本次查核中沒有找到足以視為高雄官方規則的公開依據：

- 321A 的正式定義與用途
- 每週／每月 referral KPI
- 每週／每月 visitor KPI
- One-to-One 最低次數
- CEU 最低點數
- PALMS 或交通燈的高雄續約門檻
- 代理人次數上限與資格清單
- probation 的固定期限與評分表
- TYFCB 各行業淨額算法
- Power Team 固定組織規則
- Feature Presentation 統一分鐘數與前置資格
- Mentor 的高雄固定課程與考核表
- Leadership Team 各角色完整職掌

AI 不得將其他區域、個別分會或舊教材的做法補成上述答案。

---

# 19. 常見情境判斷

## 情境 1：六個月內第 4 次本人不能出席，但有代理人

`[G]` 代理人出席不計為缺席。[G1]  
`[U]` 高雄是否另有限制代理次數，公開資料未證實。  
回答：不能直接說「第 4 次一定開放分類」，應先確認出席紀錄及高雄現行地方標準。

## 情境 2：訪客已來同一分會兩次，想再來第三次

`[G]` 全球政策是最多兩次。[G1]  
`[K]` 高雄公開頁面也說同一分會可兩次，或兩分會各一次。[K3]  
回答：原則上不能把第三次當一般訪客參訪；如有特殊身份或活動，應由分會／區域確認。

## 情境 3：訪客與現任會員是同行

`[K]` 高雄公開頁面說該訪客不能在會議上宣傳或推銷自己的業務。[K3]  
回答：可以依該公開規則說明，但不要擴張成「同行訪客完全不能出席」。

## 情境 4：朋友說可能需要某服務，但沒有同意被聯絡

`[O]` BNI 官方引薦說明要求取得對方願意被連結／聯絡的同意。[O6][O7]  
回答：目前較像 lead，不宜當作完成的合格 referral 傳遞聯絡資料。

## 情境 5：同一客戶持續回購，每次都算新 referral 嗎

`[O]` BNI Connect Support 說 referral 是第一次介紹，不是持續或重複生意每次都算新的 referral。[O7]  
回答：不可把同一介紹產生的重複交易反覆當成新 referral；TYFCB 可依系統的 New／Repeat business 與區域指引處理。

## 情境 6：簽約但尚未收款，可否報 TYFCB

`[U]` 公開全球操作頁只要求 closed business 的 net amount，沒有給所有行業通用的收款時點規則。[O10]  
回答：向 Chapter Director 或 Regional Office 確認高雄採用的認列時間與淨額算法。

## 情境 7：公司換主力服務，但會員仍用原分類

`[G]` 只能代表核准分類；變更分類須重新申請。[G1]  
回答：先向會員委員會提出分類變更申請，不應自行改用新分類對外簡報。

## 情境 8：寄促銷訊息給其他分會全部會員

`[G]` 會員名單只用於引薦與建立關係；對自己分會外會員發商業招攬前須取得特定、知情、明確同意。[G1]  
回答：未取得同意不應群發。

## 情境 9：沒完成 MSP 就一定不能 Feature Presentation 嗎

`[G]` 公開 General Policies 只限制講者身份，沒有寫 MSP 前置條件。[G1]  
`[U]` 高雄可能有排程或培訓要求，但公開資料不足。  
回答：不得稱為全球政策；請查高雄當期會員資料或詢問分會幹部。

## 情境 10：做了跨分會 One-to-One，雙方都要填嗎

`[O]` 任一方填一次即可，雙方取得 credit；但跨分會追蹤功能依區域是否開放。[O13]  
回答：先確認系統是否允許搜尋該跨分會會員。

## 情境 11：專業證照的繼續教育可否報 CEU

`[O]` 維持特定行業證照所需的 CE 不算 BNI CEU。[O12]  
回答：不能只因為是教育課程就報；需為 BNI-related learning。

## 情境 12：閱讀一般商業書一定可以報 CEU 嗎

`[O]` 官方例子是 BNI-related book，且活動須為 BNI-related learning。[O12]  
回答：不是任何商業書都自動符合；不確定時向 VP 或區域確認。

## 情境 13：PALMS 數字低就一定不續約嗎

`[G]` 續約由會員委員會核准。[G1]  
`[O]` 系統核准流程會審閱會員表現與培訓，但區域程序可能不同。[O22]  
`[U]` 高雄未公開固定最低分。  
回答：不能宣稱自動不續約；應由會員委員會依正式政策與適用程序審查。

## 情境 14：Visitor Host 可以決定訪客入會嗎

`[K]` 高雄公開流程是申請並由委員會面談。[K2]  
回答：Visitor Host 可協助接待與流程，但公開資料不支持其單獨決定入會。

## 情境 15：Mentor 可以處分新會員嗎

`[O]` 公開系統把 Mentor 定位為指導配對。[O19]  
`[G]` 政策執行權在會員委員會。[G1]  
回答：不能把 Mentor 的建議當作會員委員會正式處分。

## 情境 16：Power Team 共同報價出問題，BNI 會負責嗎

`[O]` Power Team 是合作與互補專業的概念。[O14][O15]  
`[U]` 沒有公開政策說 BNI 為共同報價或履約背書。  
回答：合作成員仍須自行處理契約、專業責任與客戶權益。

## 情境 17：醫療以外原因可申請長期留會嗎

`[G]` 全球政策說除 medical leave 外沒有其他 leave of absence。[G1]  
回答：不能把旅遊、忙季或一般出差直接稱為政策允許的留會；具體個案詢問會員委員會及區域。

## 情境 18：來賓第一次出席後，誰取得 V credit

`[O]` BNI Connect 會把 V credit 指向 Invited By 欄位的人，並待領導團隊核准；只有 first-time visitors 送入 PALMS visitor credit 流程。[O2][O3]  
回答：以系統登錄與核准結果為準。

## 情境 19：跨分會會員彼此直接做生意，是 inside 還是 outside

`[O]` 官方支援回覆說，只要是會員 A 自己與會員 B 做生意，仍是 Tier 1 / inside；跨分會不改變定義。[O7]  
回答：依 Tier 1 處理，但實際系統欄位以區域設定為準。

## 情境 20：321A 是不是「三次一對一、兩位來賓、一張引薦、積極態度」

`[U]` 沒有 BNI 全球或高雄官方公開來源支持此定義。  
回答：不得猜縮寫。只能說公開資料不足，並請使用者提供高雄當期教材或向區域確認。

---

# 20. AI 不可使用的錯誤敘述

除非使用者提供高雄當期正式文件，否則不得輸出下列句子：

- 「高雄中心區規定每月一定要四次 One-to-One。」
- 「高雄中心區會員每週一定要一張引薦。」
- 「高雄中心區六個月最多只能三次代理。」
- 「PALMS 每一項都有固定加分，低於某分就不續約。」
- 「321A 是所有新會員必須完成的全球制度。」
- 「未完成 MSP 依全球政策不能做 Feature Presentation。」
- 「Visitor 第三次一定要申請入會。」  
  正確說法是全球政策及高雄公開頁面均限制一般訪客參訪最多兩次；是否申請是另一個申請與審查流程。
- 「TYFCB 就是營業額，照合約總額填。」
- 「會員委員會只看引薦數決定續約。」
- 「Power Team 是正式分潤組織。」
- 「Mentor 有權決定 probation 或開放分類。」
- 「代理人可以是任何人且沒有任何在地限制。」  
  正確說法是全球政策只確認代理人出席不算缺席；高雄細節須另查。

---

# 21. 資料更新與維護規則

每次更新本知識文件時：

1. 先檢查 BNI Policies 公開頁面是否已有 2026 或更新版附件。
2. 記錄文件生效日，不要只看網頁更新日。
3. 檢查高雄市中心區官網的參訪、加入、活動與聯絡頁面。
4. 系統操作頁的更新只能更新 `[O]` 內容，不得自行改寫 `[G]` 政策。
5. 新增高雄地方規則前，至少應有高雄市中心區正式網站、正式書面通知或會員可驗證文件。
6. 若只有個別分會頁面，標為 `[U]` 或外部案例，不升格為高雄政策。
7. 保留舊版與新版本差異及查核日期。

---

# 22. 來源附錄

## 全球正式政策與倫理

- `[G1]` BNI Connect Support, “BNI Policies”，頁面說明附件為 2025 年 1 月生效；附件：BNI General Policies。  
  https://support.bniconnect.com/hc/en-us/articles/37106292498957-BNI-Policies  
  https://media.screensteps.com/attachment_assets/assets/009/380/039/original/BNI_Policies_2025.pdf

- `[G2]` BNI Connect Support, “BNI Policies” 留言區官方回覆：代理次數限制可屬地方政策，國家可採更嚴格標準。  
  https://support.bniconnect.com/hc/en-us/articles/37106292498957-BNI-Policies

- `[G3]` BNI, “Welcome Core Values” PDF，含 Core Values 與 Code of Ethics。  
  https://www2.bni.com/rs/166-SUM-744/images/BNI%20Welcome%20Core%20Values.pdf

- `[G4]` BNI Global, About BNI。  
  https://www.bni.com/about/

## 高雄市中心區公開來源

- `[K1]` BNI 高雄市中心區首頁。  
  https://bnikaohsiung.com.tw/zh-TW/index

- `[K2]` BNI 高雄市中心區，「如何加入」。  
  https://bnikaohsiung.com.tw/zh-TW/howtojoin

- `[K3]` BNI 高雄市中心區，「查找分會」，含兩次參訪與同業訪客限制。  
  https://bnikaohsiung.com.tw/zh-TW/findachapter

- `[K4]` BNI 高雄市中心區，「活動行事曆」。  
  https://bnikaohsiung.com.tw/zh-TW/events

- `[K5]` BNI 高屏區培訓報名系統，2026 INW 公開活動頁。  
  https://bnitraining.com/html/inw2026

## BNI 官方系統與操作來源

- `[O1]` BNI Connect Support, “Chapter Operations - Viewing PALMS”。  
  https://support.bniconnect.com/hc/en-us/articles/219067267-CHAPTER-OPERATIONS-VIEWING-PALMS

- `[O2]` BNI Connect Support, “Overview of the Visitor Process”。  
  https://support.bniconnect.com/hc/en-us/articles/219067417-Overview-of-the-Visitor-Process

- `[O3]` BNI Connect Support, “Manage Visitors - Adding a Visitor (Not Pre-Registered)”。  
  https://support.bniconnect.com/hc/en-us/articles/219067167-MANAGE-VISITORS-ADDING-A-VISITOR-NOT-PRE-REGISTERED

- `[O4]` BNI Global, “What is Your Chapter’s Visitor Experience?”。  
  https://www.bni.com/the-latest/blog-news/what-is-your-chapters-visitor-experience/

- `[O5]` BNI Global, “What Is a Referral? And Why the Definition Matters to Your Business”。  
  https://www.bni.com/the-latest/blog-news/what-is-a-business-referral/

- `[O6]` BNI Global, “The Difference Between Referrals and Leads”。  
  https://www.bni.com/the-latest/blog-news/the-difference-between-referrals-and-leads/

- `[O7]` BNI Connect Support, “Cross chapter referrals”，含官方回覆的 Tier 1、Tier 2、Tier 3+ 定義。  
  https://support.bniconnect.com/hc/en-us/community/posts/6224921902861-Cross-chapter-referrals

- `[O8]` BNI Connect Support, “Referral Tracking Sheet”。  
  https://support.bniconnect.com/hc/en-us/articles/219067607-REFERRAL-TRACKING-SHEET

- `[O9]` BNI Connect Support, “Received Referrals Report”。  
  https://support.bniconnect.com/hc/en-us/articles/219067657-RECEIVED-REFERRALS-REPORT

- `[O10]` BNI Connect Support, “Entering Thank You for Closed Business (TYFCB) Slips Online”。  
  https://support.bniconnect.com/hc/en-us/articles/219067497-ENTERING-THANK-YOU-FOR-CLOSED-BUSINESS-TYFCB-SLIPS-ONLINE

- `[O11]` BNI Connect Support, “Online Slips Audit Report for Vice Presidents”。  
  https://support.bniconnect.com/hc/en-us/articles/219067647-ONLINE-SLIPS-AUDIT-REPORT-FOR-VICE-PRESIDENTS

- `[O12]` BNI Connect Support, “Entering CEU Slips Online”。  
  https://support.bniconnect.com/hc/en-us/articles/219067557-ENTERING-CEU-SLIPS-ONLINE-CHAPTER-EDUCATIONAL-UNITS

- `[O13]` BNI Connect Support, “Entering One to One Slips Online”。  
  https://support.bniconnect.com/hc/en-us/articles/219067587-ENTERING-ONE-TO-ONE-SLIPS-ONLINE

- `[O14]` BNI Global, “6 Proven Time Management Tips for BNI Success”，含 One-to-One、Contact Sphere / Power Team 的官方教育性說明。  
  https://www.bni.com/the-latest/blog-news/6-proven-time-management-tips-for-bni-success/

- `[O15]` BNI Global, “Powered By BNI”，Power Team 公開案例。  
  https://www.bni.com/the-latest/blog-news/fusion4/

- `[O16]` BNI Global, “The BNI Experience”，Member Success Program。  
  https://www.bni.com/the-bni-experience/

- `[O17]` BNI Global, Welcome Letter，建議完成 MSP。  
  https://www2.bni.com/rs/166-SUM-744/images/BNI_WelcomeLetter_US.pdf

- `[O18]` BNI Global, “Resources at a Glance”，較早期資料，稱 MSP 設計為首 30 天完成。  
  https://www2.bni.com/rs/166-SUM-744/images/Resources%20at%20a%20Glance%20-%20Sep20.pdf

- `[O19]` BNI Connect Support, “Assigning a Mentor/Mentee Pair”。  
  https://support.bniconnect.com/hc/en-us/articles/219067257-CHAPTER-OPERATIONS-ASSIGNING-A-MENTOR-MENTEE-PAIR

- `[O20]` BNI Connect Support, “Viewing and Reassigning a Mentor/Mentee Pair”。  
  https://support.bniconnect.com/hc/en-us/articles/219067307-CHAPTER-OPERATIONS-VIEWING-AND-REASSIGNING-A-MENTOR-MENTEE-PAIR

- `[O21]` BNI Connect Support, “Online Renewals: Renewing Your Membership Online (For Members)”。  
  https://support.bniconnect.com/hc/en-us/articles/228362748-ONLINE-RENEWALS-RENEWING-YOUR-MEMBERSHIP-ONLINE-FOR-MEMBERS

- `[O22]` BNI Connect Support, “Online Renewals: Approving a Submitted Online Renewal”。  
  https://support.bniconnect.com/hc/en-us/articles/219065397-ONLINE-RENEWALS-APPROVING-A-SUBMITTED-ONLINE-RENEWAL

- `[O23]` BNI Connect Support, “Chapter Operations - Renewing a Membership”，含系統會員狀態。  
  https://support.bniconnect.com/hc/en-us/articles/219067337-CHAPTER-OPERATIONS-RENEWING-A-MEMBERSHIP

- `[O24]` BNI Connect Support, “How Can I Submit Two Speakers in Feature Presentation?” 官方回覆。  
  https://support.bniconnect.com/hc/en-us/community/posts/17347556326669-How-Can-I-Submit-Two-Speakers-in-Feature-Presentation

- `[O25]` BNI Global, “One-Sheet for BNI Members in the US Core Regions”。  
  https://www2.bni.com/rs/166-SUM-744/images/OneSheet-Member.pdf

## 外部／不足以證成高雄政策的來源

- `[X1]` BNI 長輝白金分會公開頁面，載有該頁對 321A 的說法。此來源不是 BNI Global，也不是高雄市中心區官方來源，只能作為「台灣個別分會曾如此表述」的證據。  
  https://evershine.tw/bni

---

# 23. 最短版系統提示詞

若 AI 平台只能放少量指令，可搭配本文件使用以下提示詞：

```text
你必須只依「BNI 高雄市中心區會員進階版 AI 知識文件」回答。
本知識庫以高雄市中心區為適用場域，規則優先順序是：
[K] 高雄市中心區現行正式規則 > [G] 全球政策 > [O] 官方操作資訊 > [P] 實務解讀。
每個制度結論標記 [K] 高雄正式／公開資訊、[G] 全球政策、[O] 官方操作資訊、
[P] 實務解讀或 [U] 未公開證實。
高雄未公開說明的事項，不能解讀為沒有全球規則；應以全球政策補位，
並明說未查到高雄不同規定。
不得把 [O] 或 [P] 說成強制政策；不得把個別分會做法或口述慣例說成高雄內規。
遇到 321A、KPI、PALMS 門檻、代理次數上限、TYFCB 特殊算法、
probation 程序、續約分數或幹部完整權限，如知識文件標為 [U]，
必須明說公開資料不足並建議向高雄區域、Director Consultant 或會員委員會確認。
回答需附來源代碼與連結，不得臆測。
```

---

# 24. 文件結論

本文件可安全支持的核心結論是：

- 本知識庫的實際適用順序以高雄市中心區現行正式規則為第一優先；全球政策是在高雄沒有不同正式規則時的基準。
- BNI 全球可公開確認的會員政策目前以 2025 年 1 月生效的 General Policies 為準。
- 高雄市中心區公開可確認的地方內容，主要集中在參訪、同業訪客限制及申請／面談流程。
- PALMS、CEU、One-to-One、TYFCB、Mentor 與訪客管理，可由 BNI Connect Support 說明系統如何記錄，但不能從系統欄位自行發明高雄 KPI。
- 321A 在高雄官方公開來源中尚未查得正式定義，必須維持 `[U]`。
- 續約、probation、分類開放及個案處理不可用未公開的「常見標準」代替正式程序。

這種保守寫法不是內容不完整，而是刻意把「已知」「可合理解釋」與「尚未證實」分開，避免 AI 以流暢語氣產生不存在的規則。
