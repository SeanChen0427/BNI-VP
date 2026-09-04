# LINE Bot 訊息額度架構設計

- 建立日期：2026-08-19
- 更新日期：2026-09-04
- 分支：`main`
- 文件性質：設計決策紀錄與實作規格
- 適用範圍：`supabase/functions/line-webhook/`、`supabase/functions/app-api/`、`supabase/functions/line-reminder-cron/`、副主席工作台前端

> 2026-08-28 追加決策：會員委員會的案件開票與案件回饋都不再走一般 Push。副主席從系統複製對應完整公版並貼至委員群，會員委員秘書Bot驗證文案內的一次性呼喚識別與指紋後，以該文字事件的 `replyToken` 免費回覆真正 @所有人通知與 Flex 圖卡。月會提醒當時仍維持 Push。

> 2026-09-04 追加決策：交流群的每週例會與月底 Key-in 提醒開啟 12 小時機會性投遞窗口；窗口未命中時，不自動 Push 到交流群，改由「副主席秘書Bot」對該官方帳號的全部好友發送 broadcast 備援通知。不保存個人 LINE `userId`。目前可送達好友為副主席與管理者共 2 人時，每次未命中備援預計計入 2 則。

> 2026-09-04 追加決策：委員工作進度改以正式委員群精確輸入「委員會進度」觸發，會員委員秘書Bot即時讀取最新正式工作並以免費 Reply＋@所有人回覆。原工作台 Push 僅保留為明示額度成本的備援。

---

## 一、問題定義

### 1.1 約束條件

- 本系統不營利，無任何預算，只能使用 LINE 官方帳號免費方案。
- 台灣輕用量方案：月費 0 元，免費訊息 200 則，不可加購。
- 一般排程提醒的主要路徑仍是「副主席不用記、不用搬、不用貼」。2026-09-04 確認交流群在 12 小時窗口內未命中時，接受改向副主席秘書Bot的全部好友群發人工處理提醒，以避免單次大群 Push 消耗約 45 則。案件開票與案件回饋另為 2026-08-28 確認的人工貼公版例外。

### 1.2 LINE 計費模型

- 計費單位是「收件人次」，不是 API 呼叫次數。傳一次到 45 人群組約扣 45 則。
- 同一次 API 請求內放多個 message object，仍只按收件人數計一次；分次發送則重新扣量。
- Reply API（使用 `replyToken` 回覆）不計入月額度，且與群組人數無關。
- 自動回應訊息不計入免費額度。
- LINE Notify 已於 2025-03-31 終止服務，不可作為免費替代通道。

### 1.3 現況數據

LINE Official Account Manager 顯示（截至 2026-08-18）：

| 日期 | 付費計算 Push 則數 |
|---|---|
| 8/08 | 8 |
| 8/10 | 56 |
| 8/11 | 43 |
| 8/17 | 44 |
| 8/18 | 44 |
| **合計** | **195 / 200** |

另有 3 則自動回應，不計入免費額度。8/10 的 56 則同時包含排程與多次測試紀錄，代表正式環境的測試發送也是額度流失來源。

單日扣量 43～44 則，與大群真人數（44 位會員 ＋ 1 位董顧 ＋ 1 個 Bot ＝ 46 人，Bot 不計為收件者）相符，實務上佐證了「按收件人次計費」的計費模型。

### 1.4 人數口徑

- 系統內 43 位已進入最新 BNI／PALMS 分析，另有 1 位新會員待 PALMS，實際作業會員數 44 位。
- 加董顧 1 位、Bot 1 個，LINE 群組成員顯示應為 46。
- 大群實際收件者約 45 位。此數字會隨會員增減變動，不得寫死。
- 會員委員會：副主席 1 位 ＋ 委員 6 位 ＝ 7 位；若委員群含董顧則為 8 位。

### 1.5 現行發送點盤點

以下為最初 Push 發送盤點；表內已標示 2026-08-28 後改用人工貼文呼喚＋免費 Reply 的項目。

| 功能 | 程式位置 | 目標群 | 頻率 |
|---|---|---|---|
| 每週例會鬧鐘 `weekly_meeting_alarm` | `supabase/functions/line-reminder-cron/index.ts:98` | 交流群 | 每週 |
| 月底資料 Key-in 提醒 `monthly_data_entry` | 同上 | 交流群 | 每月 |
| 委員會月會提醒 `monthly_committee_meeting` | 同上 | 委員群 | 每月 |
| 委員工作進度摘要 | `supabase/functions/line-webhook/index.ts` | 委員群 | 精確指令＋免費 Reply；工作台 Push 僅備援 |
| 排程提醒測試發送 `sendLineReminderTest` | `supabase/functions/app-api/index.ts:992` | 依設定 | 不可控 |
| 每週出席紀錄公告 `sendLineAttendance` | `supabase/functions/app-api/index.ts:1136` | 公告群 | 每週 |
| 案件回饋呼喚 `prepareCaseFeedbackCall` | `supabase/functions/app-api/index.ts` | 委員群 | 每案 1 次人工貼文呼喚＋免費 Reply；正式流程不走 Push |
| 案件投票呼喚 `prepareCaseVoteCall` | `supabase/functions/app-api/index.ts` | 委員群 | 每案 1 次人工貼文呼喚＋免費 Reply；正式流程不走 Push |
| 通過結果公告 `sendCaseResultAnnouncement` | `supabase/functions/app-api/index.ts:3627` | 公告群 | 每案 1 |

三個排程提醒鍵定義於 `supabase/functions/_shared/line-reminder-domain.mjs:1`。

### 1.6 月用量推算

以大群 45 位真人、委員群 8 位計算。

固定作業（四週月份）：

| 用途 | 計算 | 則數 |
|---|---|---|
| 每週出席公告 | 4 × 45 | 180 |
| 每週例會提醒 | 4 × 45 | 180 |
| 每月 Key-in 提醒 | 1 × 45 | 45 |
| 每月委員會提醒 | 1 × 8 | 8 |
| **小計** | | **413** |
| 每週委員工作摘要 | 精確指令＋Reply | 0 |
| **一般例行合計** | | **413** |

每件走完整決策流程的案件（續約／新會員／轉換行業別），2026-08-28 之後的正常路徑為：委員回饋呼喚 Reply 0 ＋ 委員投票呼喚 Reply 0 ＋ 通過公告 Push 45 ＝ 45 則。回饋與開票都不再扣委員群 8 則。

結論：

- 絕對最低自動需求（僅三項排程提醒）：233（四週）／278（五週）
- 正常固定作業（含免費工作摘要）：413（四週）／503（五週）
- 有 1～2 件決策案件的月份：458～593

200 則只夠發約 4 次大群訊息。**現行設計在架構上無法運作，且會隨分會人數線性惡化。**

---

## 二、已驗證的技術事實

### 2.1 Webhook 已收到所有群組訊息事件

`supabase/functions/line-webhook/domain.mjs:7-21`：

```js
export function collectGroupEvents(payload) {
  const groups = new Map();
  for (const event of Array.isArray(payload?.events) ? payload.events : []) {
    const groupId = event?.source?.type === "group" ? event.source.groupId : "";
    if (!validLineGroupId(groupId)) continue;
    groups.set(groupId, {
      groupId,
      kind: event.type === "leave" ? "leave" : "present",
      occurredAt: ...,
    });
  }
  return [...groups.values()];
}
```

第 10 行的過濾條件是 `source.type === "group"`，**沒有過濾 `event.type`**。因此群組內任何成員的任何一則訊息事件，都已經送達本 webhook，且每一筆都附帶一個可用的 `replyToken`。第 14 行將所有非 `leave` 事件壓為 `"present"`，只保留 groupId 與時間戳，`replyToken` 從未被讀取，直接丟棄。

**這是本設計的基礎：免費的 reply token 已經在流入系統，只是沒有被使用。**

### 2.2 Reply token 特性

- 一次性，使用後即失效。
- 短效，必須在收到事件後極短時間內用掉（以 LINE 官方文件為準）。
- **不可囤積**：綁定「該事件發生的當下」，無法儲存後延遲使用。
- 因此任何「讓低活躍群偶爾產生一次回應、系統存起來慢慢用」的設計都不成立。

### 2.3 Reply 支援真正的 @All

`textV2` message 的 mention object 支援 `mentionee.type = "all"`，且可用於 reply message、push message、群組與多人聊天室。

系統已有現成產生器：`supabase/functions/app-api/line-message.mjs:26` 的 `buildLineMentionAllMessage`。push 與 reply 使用相同的 message 格式，可直接複用，不需修改。

### 2.4 一群一 OA 限制

同一個 LINE 群組同時只能存在一個 LINE 官方帳號。衍生兩個結論：

- 不同群組可由不同 OA 負責，各自擁有獨立的 200 則免費額度。
- **跨 Bot 接力不可行**：A Bot 在甲群收到的 replyToken，B Bot 無法使用，更不能用於乙群。replyToken 綁定 channel、事件與會話。

### 2.5 群組推播不需要好友關係

Bot 只要在群組內即可 push 至該 groupId，會員無須加官方帳號好友。因此多 OA 架構對會員端幾乎無感，成本集中在後端 Token 與路由管理。

---

## 三、決策摘要

| 群組 | 內容 | 機制 | 月成本 | 副主席操作 |
|---|---|---|---|---|
| 交流群（約 45 人） | 每週例會提醒、每月 Key-in 提醒 | **12 小時機會性投遞**（免費 Reply）；未命中時改向 OA 全部好友群發備援 | 命中 0；以 2 位好友、每月 5 次全數未命中計算上限約 10 | 未命中後由副主席／管理者人工貼至交流群 |
| 委員群（8 人） | 每月委員會提醒 | **第二個 OA 直接 Push** | 每月約 8 | 無 |
| 委員群（8 人） | 工作摘要 | **精確輸入「委員會進度」後 Reply** | 0 | 群內輸入指令 |
| 委員群（8 人） | 案件回饋通知與免登入回饋圖卡 | **副主席貼完整公版呼喚 Bot，以 Reply 免費回覆** | 0 | 複製後貼群 |
| 委員群（8 人） | 案件開票通知與投票圖卡 | **副主席貼完整公版呼喚 Bot，以 Reply 免費回覆** | 0 | 複製後貼群 |
| 公告群（約 45 人） | 每週出席公告 | **點名後順手分享**（Web Share API） | 0 | 點名完點一下 |
| 公告群（約 45 人） | 通過結果公告 | 維持 Push | 45–90 | 無 |

額度分配：

- 副主席助理（交流群 ＋ 公告群）：45–100／200
- 會員委員會助理（委員群）：固定約 8／200；工作摘要、案件回饋與開票 Reply 都是 0 則

### 已否決的方案與理由

| 方案 | 否決理由 |
|---|---|
| 模糊關鍵字或可帶任意內容的泛用 Bot 指令 | 會誤判一般聊天並擴大資料與洗版風險。2026-09-04 核准的工作進度只接受完整相同的固定指令「委員會進度」，且只在已核對正式委員群生效。 |
| LIFF Share Target Picker ＋ 一次性指令 | 工程成本高（LINE Login channel、LIFF App、scope、前端部署），僅省下打字，且會在群組永久留下無意義的指令訊息。Web Share API 可用十行程式碼達成近似效果。 |
| 開多個 OA 分攤大群額度 | 無法解決「發送次數 × 人數」的乘法問題，只是延後破功時間。委員群例外，理由見 3.2。 |
| 全面改用 Email／Calendar／PWA | 有效但改變會員既有習慣，且分會溝通中心在 LINE。列為未來備案，非本次範圍。 |
| Bot 只通知副主席再轉傳（作為主要投遞路徑） | LINE 轉傳會失去 mention，@All 效果消失，因此不取代窗口內的 Reply 主路徑。2026-09-04 起只在 12 小時未命中後採用，並改為對 OA 全部好友群發的人工處理備援。 |

### 3.1 為何交流群適用機會性投遞

交流群定位為「大群／交流／聊天、打招呼與歡迎新人」（見 `apps/vice-chair/docs/line-templates.md:22`），每日必有大量訊息。經產品負責人確認：交流群基本上每天一定會有一堆人講話。

同時，佔用最大額度的兩項提醒（例會提醒 180 則、Key-in 提醒 45 則，合計 225 則，約佔固定作業 54.5%）目標群皆為交流群。最高成本與最高命中率重合。

### 3.2 為何委員群使用第二個 OA，且案件回饋／開票改採呼喚 Reply

委員會人數不隨分會規模成長（副主席 1 ＋ 委員 6 ＋ 董顧 1 ＝ 8），這與分會有 44 人或 100 人無關。

```
委員群 Push 月需求
= 群組人數 × 1 次委員會提醒

工作摘要
= 正式委員群精確指令 + Reply API 即時回覆
= 0 則 Push 額度

案件回饋／開票通知
= 人工貼出必要公版 + Reply API 回覆圖卡
= 0 則 Push 額度
```

委員群封閉、自然活躍度不確定，因此月會提醒仍使用獨立 OA 的 Push 額度。工作摘要不等待任意群訊息；需要時由群內成員主動輸入精確指令，當次事件立即提供有效 `replyToken`，因此可穩定使用免費 Reply。

案件回饋與開票不同：副主席本來就會在對應流程節點發布一份完整公版，該則貼文本身可立即提供有效 `replyToken`，不存在等待群組自然訊息的不確定性。2026-08-28 起，兩種文案都帶有各自的一次性呼喚識別與文案指紋；Bot只回覆已確認事件，使用 Reply API 回傳真正 @所有人通知與對應 Flex 圖卡，兩種通知成本都固定為 0 則。

### 3.3 為何公告群的出席公告採人工分享

公告群定位為「核心群發布公告；會員已讀即可，不需回應」（見 `apps/vice-chair/docs/line-templates.md:21`），設計上就不會產生訊息事件，因此永遠取不到 replyToken。結合 2.2 的「token 不可囤積」，公告群只有兩條路：花額度 Push，或人工發送。

產品負責人決策採人工分享，理由：出席公告的發布時機緊接在會後點名之後，副主席人已在系統內、手已在操作，追加一個分享動作幾乎零成本。人工成本的真正來源是 context switch 與記憶負擔，而非按鍵數；此時機兩者皆無。

取捨：以個人身分分享會失去 @All mention 通知。公告群本就不期待互動，判定可接受。此項待最終確認（見第八節）。

---

## 四、機會性投遞設計

### 4.1 流程

```
進入排程最晚送達時間的前 12 小時（例：週一 08:00）
   ↓
系統產生公告內容，寫入 pending_announcements
（不發送、不扣額度，設定投遞窗口 08:00–20:00）
   ↓
交流群任何成員發出任何訊息
   ↓
Webhook 收到 message 事件（含 replyToken）
   ↓
同步查詢：該群是否有 status='pending' 且在窗口內的公告
   ↓
有 → 原子性佔位 → 立即以該 replyToken 回覆 @All 公告 → 扣 0 則
   ↓
窗口到期仍未命中 → 副主席秘書Bot向全部好友群發「待人工貼出」通知
```

使用者在系統設定的時間定義為「最晚送達時間」，系統從該時間前 12 小時開始等待群組新訊息，不得在原設定時間後再延遲 12 小時。

觸發者為群組內任意成員，其本人不會察覺觸發了任何機制。LINE 的 reply message 不會呈現為「引用回覆」樣式，視覺上與一般 bot 訊息無異。

### 4.2 資料表

```sql
alter table line_group_targets
  add column delivery_strategy text not null default 'push',
  add column opportunistic_window_minutes integer not null default 720;

create table pending_announcements (
  id uuid primary key default gen_random_uuid(),
  delivery_key text not null unique,
  reminder_key text not null references line_reminder_rules(reminder_key),
  group_target_id uuid not null references line_group_targets(id),
  oa_channel text not null default 'vice_chair',
  trigger_source text not null default 'scheduled',
  local_due_date date not null,
  scheduled_for timestamptz not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  group_display_name text not null,
  message_text text not null,
  message_payload jsonb not null,
  message_sha256 text not null,
  status text not null default 'pending',
  delivery_mode text,
  reply_attempt_count integer not null default 0,
  fallback_attempt_count integer not null default 0,
  fallback_retry_key uuid not null default gen_random_uuid() unique,
  delivered_at timestamptz,
  fallback_notified_at timestamptz,
  manual_completed_at timestamptz,
  webhook_event_id text,
  line_request_id text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);

create index pending_announcements_lookup
  on pending_announcements (group_target_id, status, window_start, window_end, created_at);

create unique index pending_announcements_dedupe
  on pending_announcements (reminder_key, group_target_id, local_due_date)
  where trigger_source = 'scheduled';
```

欄位說明：

- `reminder_key`：本表只接受交流群的 `weekly_meeting_alarm`／`monthly_data_entry`；委員會月會提醒仍沿用既有 Push 稽核表。
- `message_payload`：完整的 LINE message object（`buildLineMentionAllMessage` 的輸出），投遞時直接使用，確保排程當下的內容與實際發出的內容一致。
- `message_text`：原提醒純文字，只在好友備援完成後提供工作台複製；`message_sha256` 與 `delivery_key` 防止同一排程重複建立。
- `status`：`pending` → `replying` → `delivered`；未命中則 `fallback_processing` → `fallback_notified` → `manual_delivered`。另保留 `fallback_failed`、`failed`、`expired`、`cancelled` 作為異常與停用稽核。好友群發成功只到 `fallback_notified`，不冒充交流群已送達。
- `delivery_mode`：只有交流群實際送達時才寫入 `reply` 或 `manual`；好友 Broadcast 是備援通知，不是原提醒的投遞模式。
- `fallback_notified`、`failed` 或 `expired` 的正式排程會在工作台保留「複製原提醒」與人工完成入口；15 分鐘人工測試逾期不會被誤列為正式待貼工作。
- RLS：本表啟用 RLS 並撤銷 `anon`／`authenticated` 全部權限，只允許 `service_role` 讀寫。表內不含好友 `userId`、觸發訊息全文或 `replyToken`。

### 4.3 Webhook 改動

在 `supabase/functions/line-webhook/` 內新增投遞邏輯。現有的簽章驗證（`domain.mjs:39` `verifyLineSignature`）與群組事件記錄（`index.ts` `recordGroupEvent`）維持不變。

判斷條件：

```
event.type === "message"
  && event.source?.type === "group"
  && typeof event.replyToken === "string"
```

處理步驟：

1. 以 `event.source.groupId` 查詢待投遞公告：
   `status = 'pending' AND now() BETWEEN window_start AND window_end`，依 `created_at` 取最舊一筆。
2. **原子性佔位**（關鍵）：
   ```sql
   UPDATE pending_announcements
      SET status = 'replying', reply_claimed_at = now()
    WHERE id = $1 AND status = 'pending'
   RETURNING *;
   ```
   若回傳 0 列，代表已被同時間的另一個事件搶先，直接略過本次。此步驟用於防止同一秒多則訊息造成的重複投遞。
3. 呼叫 `POST https://api.line.me/v2/bot/message/reply`，body 為 `{ replyToken, messages: [message_payload] }`。
4. Reply 成功後才寫入 `status = 'delivered'`、`delivery_mode = 'reply'` 與 `delivered_at`。失敗時回滾為 `pending`、增加 `reply_attempt_count` 並記錄錯誤，讓下一個新事件重試。

實作限制：

- **必須同步完成**，不可丟入背景佇列。replyToken 短效，非同步處理會導致 token 失效。
- 單一 webhook 請求內即使有多個事件，一次只投遞一則公告，避免洗版。
- 需對 LINE API 呼叫設定 fetch timeout（建議 3 秒內），確保 webhook 能及時回應 200，避免 LINE 端逾時重送。
- 現有的 `collectGroupEvents` 回傳結構不含 `replyToken`；若沿用該函式，需擴充其輸出，或在 `index.ts` 另行走一次原始 `payload.events`。

### 4.4 隱私影響

機會性投遞只擷取 `event.source.groupId`、`event.replyToken`、事件／訊息 ID 與 `event.timestamp`，**不讀取任何訊息內容或 `source.userId`**。`replyToken` 僅在同一次 Webhook 內即時使用且不落地；事件／訊息 ID 只用於防止 webhook 重送造成重複投遞。

案件呼喚與工作進度指令是上述原則的窄幅例外。Webhook只對會員委員秘書Bot收到的文字事件暫時讀取內容：案件回饋／投票須同時命中該案指定群組、一次性呼喚識別與完整文案雜湊；工作進度則須位於正式 `committee` 群且完整等於「委員會進度」。兩者都不保存完整觸發文字，也不對一般聊天做部分關鍵字、語意或會員內容分析。工作進度稽核不保存 `source.userId` 或 `replyToken`，只保存來源／文案雜湊、群組目標、事件／訊息 ID、時間與回覆結果。

### 4.5 案件開票呼喚 Reply

```
副主席按「啟動投票流程」
   ↓
系統建立投票資格快照、無登入投票網址、一次性呼喚識別及完整公版
   ↓
副主席選擇測試群或正式群，複製並原樣貼到該群
   ↓
Webhook 驗證 OA、群組、文字事件、呼喚識別、文案指紋、快照與截止版本
   ↓
立即以該 replyToken 回覆真正 @所有人通知＋Flex 投票圖卡
   ↓
保存 Reply 送達稽核；同一 webhookEventId 或同一版本不得重複回覆
```

這不是等待任意群訊息的排程機會性投遞，而是由副主席貼出必要公版時同步觸發。測試群／正式群只表示發布位置，呼喚及送票仍屬正式案件；同一文案貼到非綁定群組不得觸發。完整公版中的投票網址與圖卡指向同一份投票，但只有 Reply 成功後才收票；若 Reply 失敗，副主席重新貼上同一份完整文案到相同群組以取得新的 `replyToken`，不得另建第二份投票或自動降級為耗額度的 Push。測試群 Reply 驗收後可單向改發正式群：系統撤銷舊測試連結、保留同一正式案件的既有回饋／票數，再用正式群文字事件免費 Reply 新圖卡；即使先測試再正式發布，兩次皆為 Reply，仍消耗 0 則 Push 額度。

### 4.6 委員工作進度精確指令 Reply

```text
正式委員群成員輸入完整文字「委員會進度」
   ↓
Webhook 驗證會員委員秘書Bot簽章、正式 committee 群與精確文字
   ↓
即時讀取 Supabase 正式未完成案件、分工、期限與流程版本
   ↓
沿用工作摘要唯一格式，使用當次 replyToken 回覆 @所有人
   ↓
Reply 不計月訊息額度；事件鍵防止 Webhook 重送造成重複回覆
```

前後空白可忽略，但「請給我委員會進度」、「委員會進度？」或其他夾帶文字不觸發。系統不保存指令全文、完整回覆、LINE 使用者 ID 或 `replyToken`；不同時間再次輸入會重新讀取最新資料並正常回覆。工作台原 Push 按鈕只作備援，須明示會計入額度並二次確認。

### 4.7 群組活躍度日誌（可選但建議）

目前 `line_group_targets.last_event_at` 每次收到事件即覆寫，只保留最後一筆，無法統計活躍度分布。

若需以實測數據驗證命中率與最佳窗口長度，可追加一張只含 `line_group_id` 與 `occurred_at` 兩個欄位的事件日誌表。此改動不影響任何現有行為，隱私面與現況完全相同（不觸及訊息內容），累積兩週即可得出各群組在任意時間窗口內的活躍機率。

---

## 五、排程端改動

`supabase/functions/line-reminder-cron/index.ts:98` 目前直接呼叫 push。需改為依群組設定選擇投遞策略。

在 `line_group_targets` 增加投遞策略欄位：

```sql
alter table line_group_targets
  add column delivery_strategy text not null default 'push',
  add column opportunistic_window_minutes integer not null default 720;
```

- `delivery_strategy = 'opportunistic'`：不 push，改寫入 `pending_announcements`。交流群規則以原排程時點為 `window_end`，`window_start = window_end - opportunistic_window_minutes`。
- `delivery_strategy = 'push'`：維持現行直接推播。

同一支 cron 每次執行時追加一段過期掃描：查出 `status = 'pending' AND window_end < now()` 的紀錄，依降級鏈處理。掃描頻率需與 cron 實際執行頻率相符（待確認，見第八節）。

三個排程鍵的目標分派：

| 提醒鍵 | 目標群 | 策略 |
|---|---|---|
| `weekly_meeting_alarm` | 交流群 | `opportunistic` |
| `monthly_data_entry` | 交流群 | `opportunistic` |
| `monthly_committee_meeting` | 委員群 | `push`（會員委員會助理） |

另註：目前系統設定的 Key-in 提醒為「會議前三天 17:30」，與「到期前一天提醒」的需求陳述不一致。此為既有規則落差，需獨立確認（見第八節）。

---

## 六、多 OA 架構

### 6.1 帳號分工

| OA | Channel | 負責群組 | 額度用途 |
|---|---|---|---|
| 副主席助理 | 現有 | 交流群、公告群 | 結果公告 Push、OA 好友群發備援 |
| 會員委員會助理 | 新增 | 委員群 | 委員會提醒、工作摘要指令 Reply、案件回饋與投票 |

中央排程系統決定使用哪一個 OA、哪個群組與哪一池額度。兩個 Bot 之間不互相呼叫。

### 6.2 資料與設定

```sql
alter table line_group_targets
  add column oa_channel text not null default 'vice_chair';
```

環境變數：

| 變數 | 用途 |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | 副主席助理（現有） |
| `LINE_CHANNEL_SECRET` | 副主席助理（現有） |
| `LINE_COMMITTEE_CHANNEL_ACCESS_TOKEN` | 會員委員會助理（新增） |
| `LINE_COMMITTEE_CHANNEL_SECRET` | 會員委員會助理（新增） |

`supabase/functions/app-api/index.ts:359` 的 `lineRequest` 目前綁定單一 token，需擴充為依 `oa_channel` 選取對應憑證。所有 push 呼叫點（第 710、992、1136、3288、3446、3627 行）皆須改為攜帶目標群組的 `oa_channel`。

Webhook 需支援兩組 channel secret，各自驗證各自的簽章。可採兩個獨立 endpoint，或單一 endpoint 以路徑參數區分。

### 6.3 部署前置作業

**因一群一 OA 限制，委員群若目前已有副主席助理在內，必須先將其移出，才能加入會員委員會助理。** 順序顛倒會導致無法加入。

### 6.4 灰色地帶說明

多開官方帳號本質上是分攤免費額度上限。本案的功能分離具有實質依據（公告／交流 對 委員會工作，權限範圍與資料敏感度不同），且為非營利分會委員會使用，判定風險低。此為已知的取捨，記錄於此以備日後檢視。

---

## 七、降級鏈與額度守門員

### 7.1 未命中備援鏈

```
【第一順位】機會性投遞
  窗口內群組有訊息事件 → 免費 Reply ＋ 真 @All → 0 則 → 無人操作
      ↓ 窗口到期未命中
【第二順位】副主席秘書Bot對全部好友群發
  同一次 Broadcast API 請求發送「操作說明」＋「原提醒全文」兩則訊息
  不儲存個人 userId；目前只有 2 位可送達好友時，預計扣 2 則
  不得自動 Push 原提醒至交流群
      ↓
【第三順位】工作台顯示待發清單，人工處理
```

LINE Official Account Manager 的「管理員」權限不代表該 LINE 帳號自動成為 Bot 好友。要收到本備援通知，副主席與管理者的 LINE 帳號都必須實際加入「副主席秘書Bot」好友且未封鎖。未來若新增好友，broadcast 將同時送給新好友，額度也會依實際可送達人數增加。

第一則固定操作說明如下，第二則為原提醒全文，讓收件人可直接長按複製：

```text
🔔【交流群提醒尚未送達】
副主席秘書 Bot 在 12 小時等待期間內，沒有遇到可用的交流群新訊息，因此尚未將提醒送到交流群。

請副主席或管理者：
1. 長按並複製下一則訊息
2. 貼到「{交流群名稱}」
3. 送出前在群內手動標註 @所有人

提醒項目：{提醒名稱}
原訂最晚送達：{台北日期時間}
```

### 7.2 額度守門員

現行所有發送皆無事前檢查。需在每次 push 前加入：

| 查詢 | API |
|---|---|
| 本月額度 | `GET /v2/bot/message/quota` |
| 本月已用量 | `GET /v2/bot/message/quota/consumption` |
| 群組真人數 | `GET /v2/bot/group/{groupId}/members/count` |

規則：

- 三項結果快取約 10 分鐘，避免每次發送都多打三次 API。
- 群組人數即時讀取，**不得寫死 44 或 45**，隨分會增減自動重算。OA 好友群發的預估人數也不可永久寫死為 2，工作台應提醒管理者定期核對好友數。
- 發送前於工作台顯示「本次將扣 N 則，發送後剩餘 M 則」。
- 保留至少 20 則緊急額度（供小範圍好友群發備援與異常通知），一般大群推播不得吃掉此保留額。
- 額度不足時自動切換至降級鏈，不得靜默失敗。
- 每個 `oa_channel` 各自獨立計算額度。

### 7.3 測試發送防護

`supabase/functions/app-api/index.ts:992` 的 `sendLineReminderTest` 目前直接呼叫真實 push API，是 8/10 當日 56 則異常扣量的來源之一。

規格：正式環境的測試發送預設為 dry-run，僅回傳訊息預覽而不呼叫 LINE API；如需真實發送，只允許發給單一測試帳號，不得對群組群發。

---

## 八、公告群人工分享設計

### 8.1 觸發時機

出席公告的發布時機緊接在會後點名之後。系統在點名完成的頁面直接呈現分享入口，不需要另行提醒或排程。

### 8.2 實作方式

使用瀏覽器原生 Web Share API，不需要 LIFF、不需要 LINE Login channel、不需要任何 LINE 端設定：

```js
const text = buildAttendanceAnnouncementText(announcement);
if (navigator.share) {
  await navigator.share({ text });
} else {
  await navigator.clipboard.writeText(text);
  // 顯示「已複製，請貼至公告群」
}
```

操作路徑：點名完成 → 點「分享出席公告到 LINE」→ 原生分享選單 → 選 LINE → 選公告群 → 送出。共三次點擊，不需複製、不需切換 App 尋找內容、不需長按貼上。

實作注意：

- Web Share API 需 HTTPS 環境（正式部署已符合）。
- 不支援的瀏覽器須降級為 clipboard 複製，並顯示明確提示。
- 分享行為在系統端無法確認是否真的送出，採信任模式：點擊分享後即標記為已發布，並記錄操作者與時間供稽核。
- 系統既有的 copy-only 公版機制（commit `cba61c9`）可作為此路徑的內容來源。

### 8.3 已知限制

以副主席個人身分分享，訊息不含 mention object，會員不會收到 @All 通知。若後續判定出席公告必須有 @All，此路徑不成立，須改回 Push（每次約 45 則）。

---

## 九、額度預算與成長性

以現行 45 位大群收件者計算：

| 項目 | OA | 月則數 |
|---|---|---|
| 交流群例會提醒（4 次） | 副主席助理 | 0 |
| 交流群 Key-in 提醒（1 次） | 副主席助理 | 0 |
| 公告群出席公告（4 次） | — | 0（人工分享） |
| 公告群通過結果公告（1–2 案） | 副主席助理 | 45–90 |
| 未命中好友群發備援與異常通知 | 副主席助理 | 0–10（以 2 位好友、每月最多 5 次未命中估算） |
| **副主席助理小計** | | **45–100／200** |
| 委員會提醒（1 次） | 會員委員會助理 | 8 |
| 委員工作摘要（隨時按指令） | 會員委員會助理 | 0（Reply） |
| 案件回饋 Reply（2 案） | 會員委員會助理 | 0 |
| 案件開票 Reply（2 案） | 會員委員會助理 | 0 |
| **會員委員會助理小計** | | **8／200** |

成長性：

| 分會人數 | 副主席助理 | 會員委員會助理 |
|---|---|---|
| 45 | 45–100 | 8 |
| 60 | 60–130 | 8 |
| 80 | 80–170 | 8 |
| 100 | 100–210 | 8 |

會員委員會助理不隨分會人數變動。副主席助理唯一隨人數成長的項目是「通過結果公告」，其發布時機同樣落在副主席結案操作的當下，因此在逼近額度時可沿用 8.2 的人工分享路徑降至 0 則。

**此架構在設計上沒有人數天花板。**

---

## 十、待確認事項

| 編號 | 項目 | 影響 |
|---|---|---|
| A1 | LINE OA 回應模式是否設為「Bot」（Webhook 開啟、自動回應訊息關閉）。8 月有 3 則自動回應紀錄，顯示自動回應功能目前為開啟狀態。 | 直接決定 webhook 是否收到完整 message 事件，機會性投遞成立與否的前提 |
| A2 | `replyToken` 官方文件載明的有效期限實際值 | 決定 webhook 同步處理的時間預算與 timeout 設定 |
| A3 | 委員群目前是否已有副主席助理在內 | 決定第二個 OA 的部署順序（見 6.3） |
| A4 | 出席公告是否必須有 @All mention | 若必須，8.2 的人工分享路徑不成立 |
| A5 | `line-reminder-cron` 的實際執行頻率 | 決定過期掃描的即時性與窗口設計 |
| A6 | `sendCommitteeWorkDigest` 的實際觸發方式（手動或排程）與頻率 | 影響委員群額度估算 |
| A7 | Key-in 提醒現行設定為「會議前三天 17:30」，與「到期前一天提醒」的需求陳述不一致 | 需確認正式規則後重新排程 |
| A8 | 交流群與公告群的實際成員數（含是否含董顧、來賓） | 額度估算基準，且應改為即時 API 讀取而非固定值 |

---

## 十一、風險與限制

| 風險 | 說明 | 緩解 |
|---|---|---|
| 送達時間為窗口而非時刻 | 機會性投遞的實際送達時間取決於群組活躍度，會落在設定截止時間前的 12 小時窗口內 | 對「前一天或更早提醒」用途判定可接受；窗口到期改向 OA 好友群發備援 |
| 交流群長期靜默 | 連假、農曆年期間可能整段窗口無訊息 | 12 小時到期時向副主席秘書Bot的全部好友群發備援，不對交流群自動 Push |
| OA 好友人數日後增加 | Broadcast 會送給所有可送達好友，不只是現任副主席與管理者 | 不公開宣傳該 OA，換屆與日常巡檢時核對好友數；如果用途擴大，重新評估是否改回明確收件人綁定 |
| 併發重複投遞 | 同一秒多則訊息觸發多個 webhook 並行 | 以 `UPDATE ... WHERE status='pending' RETURNING` 做原子性佔位 |
| Webhook 延遲 | 同步呼叫 LINE Reply API 增加回應時間，可能觸發 LINE 端逾時重送 | 設定 fetch timeout，確保整體處理在秒級完成 |
| 公告群無法使用免費通道 | 群組定位即為不回應，永遠無 replyToken，且 token 不可囤積 | 已決策改為人工分享，並限縮該群內容為正式決議 |
| 多 OA 為額度分攤手段 | 屬灰色地帶 | 功能分離具實質依據，記錄於 6.4 備查 |
| 人工分享無法系統驗證 | 系統無法確認副主席是否真的送出 | 採信任模式並記錄操作稽核 |

---

## 十二、待處理的安全事項

在 2026-08-19 的唯讀盤查過程中，Supabase CLI 曾將 legacy `service_role` 金鑰完整輸出至工具結果。該金鑰未被寫入任何檔案，repository 亦已確認乾淨（`.gitignore` 正確排除 `.env`、`.env.*`，git 追蹤清單中無任何憑證檔案），但基於安全考量應視為已暴露。

`service_role` 金鑰可繞過全部 RLS，具備資料庫完整讀寫權限，涵蓋會員資料、訪談內容與投票明細。其嚴重性高於本文件討論的所有額度議題。

金鑰輪替後需同步更新的位置：

- `line-webhook` Edge Function 的 `SUPABASE_SERVICE_ROLE_KEY`
- `app-api` Edge Function
- `line-reminder-cron` Edge Function
- 本機 `.env`（如有）

此項與本文件的功能設計無相依關係，可獨立處理。

---

## 十三、相關文件

| 主題 | 文件 |
|---|---|
| LINE 群組清單與公版訊息 | `apps/vice-chair/docs/line-templates.md` |
| 現有通知需求盤點 | `apps/vice-chair/docs/requirements-draft.md:455` |
| 上線、資料安全 | `apps/vice-chair/docs/architecture-hosting-security.md` |
| 決策紀錄 | `apps/vice-chair/docs/decision-log.md` |
| 變更紀錄 | `apps/vice-chair/CHANGELOG.md` |
