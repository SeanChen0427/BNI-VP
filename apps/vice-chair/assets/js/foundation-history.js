(function (root, factory) {
  const api = factory(root.FulianRenewalFoundationDomain || (typeof require === "function" ? require("../../core/renewal-foundation-domain.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FulianFoundationHistory = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (domain) {
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const text = value => value == null || value === "" ? "未填寫" : String(value);
  const date = value => value ? String(value).replaceAll("-", "/") : "未設定";

  function changes(previous, next) {
    if (!previous || !next) return null;
    // Only business fields belong in the history view; IDs and storage metadata stay in the audit record.
    const fields = [
      ["起算日", value => date(value.startOn)],
      [next.kind === "flexible" ? "地基結束日（含當日）" : "地基期限／下次續約日", value => date(value.dueOn ? domain.displayDeadline(value) : null)],
      ["下次追蹤日", value => date(value.nextCheckOn)],
      ["目標", value => value.target == null ? "未設定" : `${value.target} ${domain.metricInfo(value).unit}`],
      ["改善項目", value => text(value.title)],
      ["完成標準", value => text(value.criterion)],
      ["主要追蹤人", value => value.leadName || "未指派"],
      ["陪同追蹤人", value => [...(value.companionNames || [])].sort().join("、") || "無"],
      ["開始提醒時間", value => value.kind === "flexible" && value.cadence === "cumulative" ? (value.leadMonths ? `期限前 ${value.leadMonths} 個月` : "自起算日起") : "依原定期程"],
      ["議定依據與確認紀錄", value => text(value.source)],
      ["追蹤狀態", value => domain.labels[value.status] || "未記錄"],
    ];
    return fields.map(([label, format]) => ({ label, before: format(previous), after: format(next) })).filter(row => row.before !== row.after);
  }

  function periodResult(result) {
    if (!result) return "需依調整後期間重新確認";
    return `${domain.labels[result.status] || "尚未確認"}；${result.count ?? (result.status === "achieved" ? 1 : 0)} 場${result.attendedOn ? `；參加日期：${date(result.attendedOn)}` : ""}${result.confirmedBy ? `；確認人：${result.confirmedBy}` : ""}`;
  }

  function renderAmendment(event) {
    const rows = changes(event.previous_data, event.next_data);
    const detail = event.detail || {};
    const resetCount = Number(detail.resetPeriodCount) || 0;
    const schedule = detail.scheduleChanged ? `<p>已依新日期重新安排追蹤。${resetCount > 0 ? `${esc(resetCount)} 期工作坊確認需重新核對；原確認紀錄保留如下。` : ""}</p>` : "";
    if (!rows) return `${schedule}<p>這筆歷史紀錄未保存完整的調整前後內容。</p>`;
    const oldResults = event.previous_data.periodResults || {}, newResults = event.next_data.periodResults || {};
    for (const key of Object.keys(oldResults).sort()) {
      if (!newResults[key]) rows.push({ label: `原工作坊確認（${date(key)} 起）`, before: periodResult(oldResults[key]), after: periodResult(null) });
    }
    if (!rows.length) return `${schedule}<p>本次未變更追蹤設定，調整原因請見上方紀錄。</p>`;
    return `${schedule}<details><summary>查看變更明細（${rows.length} 項）</summary><dl class="history-changes">${rows.map(row => `<div><dt>${esc(row.label)}</dt><dd><span>調整前：</span>${esc(row.before)}</dd><dd><span>調整後：</span>${esc(row.after)}</dd></div>`).join("")}</dl></details>`;
  }
  return { changes, renderAmendment };
});
