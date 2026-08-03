import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renewalRadar } from "../../bni-analysis/engine/diagnostics.mjs";

const root = new URL("../../../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

const scored = { name: "測試會員", scores: {}, metrics: {} };
const expiryByName = new Map([["測試會員", { expiryDate: "2026-09-01", autoRenewal: false }]]);

test("中心區完成確認只排除完全相同的續約週期", () => {
  const before = renewalRadar({ activeScored: [scored], expiryByName, annualByName: null, asOf: "2026-08-04", expiredUnrenewed: [] });
  assert.equal(before.length, 1);
  assert.equal(before[0].kind, "overdue");

  const completed = renewalRadar({
    activeScored: [scored], expiryByName, annualByName: null, asOf: "2026-08-04", expiredUnrenewed: [],
    confirmedRenewals: [{ name: "測試會員", priorExpiryOn: "2026-09-01" }],
  });
  assert.deepEqual(completed, []);

  const nextCycle = renewalRadar({
    activeScored: [scored], expiryByName, annualByName: null, asOf: "2026-08-04", expiredUnrenewed: [],
    confirmedRenewals: [{ name: "測試會員", priorExpiryOn: "2025-09-01" }],
  });
  assert.equal(nextCycle.length, 1, "舊週期確認不得隱藏新到期日");
});

test("中心區完成由正式資料表保存且不改寫官方到期日", async () => {
  const [migration, edge, page] = await Promise.all([
    read("supabase/migrations/20260804023000_membership_renewal_completions.sql"),
    read("supabase/functions/app-api/index.ts"),
    read("apps/vice-chair/assets/js/analysis-review.js"),
  ]);
  assert.match(migration, /unique \(member_id, prior_expiry_on\)/);
  assert.match(migration, /revoke all on table public\.membership_renewal_completions from public, anon, authenticated/);
  assert.doesNotMatch(migration, /update public\.members\s+set\s+membership_expires_on/i);
  assert.match(edge, /body\.action === "confirm-renewal"/);
  assert.match(edge, /radarItem.*item\.expiryDate === priorExpiryOn/);
  assert.match(edge, /membership_expires_on !== priorExpiryOn/);
  assert.match(edge, /draft\.aiReview = null/);
  assert.match(page, /中心已完成/);
  assert.match(page, /撤銷誤確認/);
});
