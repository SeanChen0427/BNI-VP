import { taipeiDay } from './time.mjs';
import { renewalDeadline } from './diagnostics.mjs';

// The workflow adapter supplies validated dispositions from finalized meetings.
// Bind to the deadline saved in that meeting, never to a newly inferred expiry.
export function resolveRenewalDecisionExclusions({ decisions = [], expiryByName, asOf }) {
  const latest = new Map(), unresolved = [];
  for (const decision of decisions) {
    if (decision.status !== 'final' || !['non_renewal', 'follow_up'].includes(decision.disposition)) continue;
    const name = String(decision.name || '').replace(/\s+/g, '');
    const time = Date.parse(decision.recordedAt);
    if (!name || !Number.isFinite(time) || !/^\d{4}-\d{2}-\d{2}$/.test(decision.deadline || '')) {
      unresolved.push({ meetingId: decision.meetingId, careItemId: decision.careItemId, name, reason: 'missing-decision-cycle-or-date' });
      continue;
    }
    if (taipeiDay(decision.recordedAt) > asOf) continue;
    const key = `${name}\u0000${decision.deadline}`, prior = latest.get(key);
    if (!prior || time > prior.time) latest.set(key, { ...decision, name, time, ambiguous: false });
    else if (time === prior.time && decision.disposition !== prior.disposition) prior.ambiguous = true;
  }
  const exclusions = [];
  for (const decision of latest.values()) {
    if (decision.ambiguous) {
      unresolved.push({ meetingId: decision.meetingId, careItemId: decision.careItemId, name: decision.name, reason: 'conflicting-decisions' });
      continue;
    }
    const expiry = expiryByName.get(decision.name)?.expiryDate;
    if (decision.disposition !== 'non_renewal' || !expiry || renewalDeadline(expiry) !== decision.deadline) continue;
    const { time, ambiguous, ...evidence } = decision;
    exclusions.push({ ...evidence, priorExpiryOn: expiry, source: 'final-meeting-non-renewal' });
  }
  return { exclusions, unresolved };
}
