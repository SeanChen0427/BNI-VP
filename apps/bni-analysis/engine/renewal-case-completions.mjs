// Sean 2026-10-01: a closed renewal case completes the radar cycle before
// the center office syncs. Resolve its expiry from an immutable historical
// snapshot; never bind an old case to today's expiry date.
const nameKey = value => String(value || "").replace(/\s+/g, "");
const day = value => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(value));

export function resolveRenewalCaseCompletions({ cases = [], snapshots = [], members = [], asOf } = {}) {
  const names = new Map(members.map(m => [m.id, nameKey(m.people?.display_name || m.name)]));
  const completions = [], unresolved = [];
  for (const c of cases) {
    if (c.type !== "renewal" || c.stage !== "closed") continue;
    const created = Date.parse(c.created_at), completed = Date.parse(c.completed_at);
    const name = names.get(c.member_id);
    if (!name || !Number.isFinite(created) || !Number.isFinite(completed) || completed < created) {
      unresolved.push({ caseId: c.id, name: name || "", reason: "missing-member-or-closure-date" });
      continue;
    }
    if (day(c.completed_at) > asOf) continue;
    const history = snapshots.filter(s => s.is_published !== false
      && Number.isFinite(Date.parse(s.published_at)) && Date.parse(s.published_at) <= created
      && (!s.snapshot?.analysisCycle?.effectiveOn || s.snapshot.analysisCycle.effectiveOn <= day(c.created_at)));
    const source = c.analysis_snapshot_id
      ? history.find(s => s.id === c.analysis_snapshot_id)
      : history.toSorted((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))[0];
    const matches = (source?.snapshot?.members || []).filter(m => nameKey(m.name) === name);
    if (matches.length !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(matches[0].expiryDate || "")) {
      unresolved.push({ caseId: c.id, name, reason: "missing-or-ambiguous-historical-expiry" });
      continue;
    }
    completions.push({
      id: `case:${c.id}`, name, priorExpiryOn: matches[0].expiryDate,
      completedOn: day(c.completed_at), source: "case-closed", confirmedAt: c.completed_at,
      caseId: c.id, sourceSnapshotId: source.id,
      cycleEvidence: c.analysis_snapshot_id ? "case-linked-snapshot" : "latest-published-at-case-creation",
    });
  }
  return { completions, unresolved };
}
