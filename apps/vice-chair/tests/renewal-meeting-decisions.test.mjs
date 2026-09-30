import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveRenewalDecisionExclusions } from '../../bni-analysis/engine/renewal-meeting-decisions.mjs';
import { renewalRadar } from '../../bni-analysis/engine/diagnostics.mjs';
const expiryByName = new Map([['測試會員', { expiryDate: '2026-11-01' }]]);
const decision = { name: '測試會員', status: 'final', disposition: 'non_renewal', deadline: '2026-09-15', recordedAt: '2026-09-07T17:50:50Z', meetingId: 'meeting-a', careItemId: 'care-a' };
const resolve = (decisions = [decision], extra = {}) => resolveRenewalDecisionExclusions({ decisions, expiryByName, asOf: '2026-10-01', ...extra });

test('已結案月會確認不續約，排除當次雷達但不冒充續約完成', () => {
  const result = resolve();
  assert.equal(result.exclusions.length, 1);
  assert.equal(result.exclusions[0].source, 'final-meeting-non-renewal');
  const input = { activeScored: [{ name: decision.name, scores: {}, metrics: {} }], expiryByName, annualByName: null, asOf: '2026-10-01', expiredUnrenewed: [] };
  assert.equal(renewalRadar(input).length, 1);
  assert.deepEqual(renewalRadar({ ...input, confirmedNonRenewals: result.exclusions }), []);
  assert.equal(result.exclusions[0].completedOn, undefined);
});
test('草稿、未來決議及其他處置不能排除；下一到期週期不沿用', () => {
  for (const change of [{status:'draft'}, {recordedAt:'2026-10-02T00:00:00Z'}, {disposition:'no_follow_up'}, {disposition:'follow_up'}, {disposition:'invalid'}]) assert.deepEqual(resolve([{...decision,...change}]).exclusions, []);
  assert.deepEqual(resolve([decision], { expiryByName: new Map([[decision.name,{expiryDate:'2027-11-01'}]]) }).exclusions, []);
});
test('追加更正或較新同週期決議恢復追蹤；不以陣列順序覆蓋新決議', () => {
  assert.equal(resolve([decision, {...decision, disposition:'', recordedAt:'2026-09-20T00:00:00Z'}]).exclusions.length, 1, '尚未作決議的項目不得當成恢復續約');
  const resumed = {...decision, disposition:'follow_up', recordedAt:'2026-09-20T00:00:00Z'};
  for (const decisions of [[decision,resumed],[resumed,decision],[resumed]]) assert.deepEqual(resolve(decisions).exclusions, []);
});
test('缺週期證據與同時互相矛盾的決議保留待核對，不猜新期限', () => {
  assert.equal(resolve([{...decision,deadline:''}]).unresolved.length,1);
  const conflict=resolve([decision,{...decision,disposition:'follow_up'}]);
  assert.equal(conflict.exclusions.length,0);
  assert.equal(conflict.unresolved[0].reason,'conflicting-decisions');
});
test('正式來源轉接沿用月會更正判定，並把決議納入審視來源指紋', () => {
  const edge=readFileSync(new URL('../../../supabase/functions/app-api/index.ts',import.meta.url),'utf8');
  assert.match(edge,/committee_meetings\?status=eq.final&select=id,meeting_month,status,updated_at,care_summary/);
  assert.match(edge,/isValidMonthlyCareDisposition\(item\) \? effectiveMonthlyCareDisposition\(item\) : "invalid"/);
  assert.match(edge,/System\/final-meeting-renewal-decisions/);
});
