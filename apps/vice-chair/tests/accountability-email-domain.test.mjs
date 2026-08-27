import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const domain = require("../core/accountability-email-domain.js");

test("缺席第 2、3、4 次與代理第 6、7、8、9 次使用固定門檻", () => {
  assert.deepEqual(domain.thresholds("absence"), [2, 3, 4]);
  assert.deepEqual(domain.thresholds("proxy"), [6, 7, 8, 9]);
});

test("遲到與早退累計三次會折算一次缺席並觸發跨越門檻", () => {
  assert.equal(domain.effectiveAbsence({ absence: 1, late: 3 }), 2);
  assert.deepEqual(
    domain.crossings(
      { absence: 1, late: 2, proxy: 5 },
      { absence: 1, late: 3, proxy: 6 },
    ).map(rule => `${rule.reason}:${rule.occurrence}`),
    ["absence:2", "proxy:6"],
  );
});

test("代理第 6、7、8、9 次各自形成獨立信件級別", () => {
  for (const occurrence of [6, 7, 8, 9]) {
    const reached = domain.crossings(
      { absence: 0, late: 0, proxy: occurrence - 1 },
      { absence: 0, late: 0, proxy: occurrence },
    );
    assert.equal(reached.length, 1);
    assert.equal(reached[0].reason, "proxy");
    assert.equal(reached[0].occurrence, occurrence);
  }
});

test("每封代理信的主旨與內文都明示本次次數及期間", () => {
  for (const occurrence of [6, 7, 8, 9]) {
    const draft = domain.renderDraft({
      memberName: "測試會員",
      reason: "proxy",
      occurrence,
      periodStart: "2026-03-01",
      periodEnd: "2026-08-31",
      triggerDate: "2026-08-25",
    });
    assert.equal(draft.complete, true);
    assert.match(draft.subject, new RegExp(`代理第 ${occurrence} 次`));
    assert.match(draft.body, new RegExp(`累計代理第 ${occurrence} 次`));
    assert.match(draft.body, /2026-03-01 至 2026-08-31/);
  }
});

test("第 8 次代理清楚提醒下一次將達開放門檻", () => {
  const draft = domain.renderDraft({
    memberName: "測試會員",
    reason: "proxy",
    occurrence: 8,
    periodStart: "2026-03-01",
    periodEnd: "2026-08-31",
    triggerDate: "2026-08-25",
  });
  assert.match(draft.body, /第 9 次代理/);
  assert.match(draft.body, /開放行業別（專業類別）/);
});

test("缺席第 4 次與代理第 9 次直接產出開放行業別當責草稿且沒有核准文字", () => {
  for (const [reason, occurrence] of [["absence", 4], ["proxy", 9]]) {
    const draft = domain.renderDraft({
      memberName: "測試會員",
      reason,
      occurrence,
      periodStart: "2026-03-01",
      periodEnd: "2026-08-31",
      triggerDate: "2026-08-25",
    });
    assert.equal(draft.complete, true);
    assert.match(draft.title, /開放行業別（專業類別）當責信/);
    assert.match(draft.subject, /開放行業別（專業類別）當責通知/);
    assert.doesNotMatch(`${draft.subject}\n${draft.body}`, /待核准|核准後|核准人/);
    assert.doesNotMatch(draft.body, /會員資格已正式終止/);
  }
});

test("缺少期間或觸發日時仍提供預覽但標記為資料不完整", () => {
  const draft = domain.renderDraft({ memberName: "測試會員", reason: "absence", occurrence: 2 });
  assert.equal(draft.complete, false);
  assert.deepEqual(draft.missing, ["滾動六個月期間", "觸發例會／統計截止日"]);
  assert.match(draft.body, /滾動六個月期間待補/);
});

test("全部複製內容只產生貼入信箱所需欄位，不執行寄送", () => {
  const result = domain.copyBundle({
    recipientEmail: "member@example.test",
    cc: ["chair@example.test"],
    subject: "測試主旨",
    body: "測試內文",
  });
  assert.equal(result, "收件人：member@example.test\n副本：chair@example.test\n主旨：測試主旨\n\n測試內文");
});
