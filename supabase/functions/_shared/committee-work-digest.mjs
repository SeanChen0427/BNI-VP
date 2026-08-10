const TYPE_LABELS = {
  renewal: "續約訪談",
  new: "新會員訪談",
  midterm: "期中關懷",
  industry: "轉換行業別訪談",
  special: "特定關懷",
  departure: "離會訪談",
};

const TYPE_ORDER = ["renewal", "new", "midterm", "industry", "special", "departure"];

function taipeiParts(value = new Date()) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value)).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
}
function parseDueAt(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const local = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/);
  const date = new Date(local ? `${local[1]}T${local[2]}:00+08:00` : text);
  return Number.isFinite(date.getTime()) ? date : null;
}

function localDueKey(value) {
  const date = parseDueAt(value);
  if (!date) return "";
  const parts = taipeiParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function typeRank(type) {
  const index = TYPE_ORDER.indexOf(type);
  return index < 0 ? TYPE_ORDER.length : index;
}

function workflowBucket(workflow = {}) {
  if (workflow?.votingOpen || workflow?.voteNoticeSent) return "vote";
  const feedbackCount = Object.values(workflow?.feedback || {}).filter(value => String(value || "").trim()).length;
  if (workflow?.feedbackNotified || feedbackCount) return "feedback";
  return "other";
}

function formatTitleDate(now) {
  const parts = taipeiParts(now);
  return `${parts.year}.${parts.month}.${parts.day}`;
}

function formatDueHeading(key, now) {
  if (!key) return "■ 尚未排定期限";
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return "■ 尚未排定期限";
  const due = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00+08:00`);
  const overdue = due.getTime() < new Date(now).getTime();
  return `■ ${Number(match[2])}月${Number(match[3])}日 ${match[4]}:${match[5]} 前${overdue ? "（已逾期）" : ""}`;
}

function normalizeTask(task) {
  return {
    id: String(task?.id || ""),
    type: String(task?.type || ""),
    member: String(task?.member || "").trim(),
    dueAt: String(task?.dueAt || "").trim(),
    lead: String(task?.lead || "").trim(),
    companions: [...new Set((Array.isArray(task?.companions) ? task.companions : [])
      .map(name => String(name || "").trim()).filter(Boolean))],
    revision: Number(task?.revision || 0),
    workflowRevision: Number(task?.workflowRevision || 0),
    workflow: task?.workflow && typeof task.workflow === "object" ? task.workflow : {},
  };
}

function taskLine(task) {
  const lead = task.lead || "尚未指派";
  const companions = task.companions.length ? `｜陪訪：${task.companions.join("、")}` : "";
  return `・${task.member || "未命名案件"}｜主責：${lead}${companions}`;
}

export function committeeWorkDigestSource(tasks, now = new Date()) {
  const local = taipeiParts(now);
  return JSON.stringify({
    localDate: `${local.year}-${local.month}-${local.day}`,
    tasks: tasks.map(normalizeTask).sort((a, b) => a.id.localeCompare(b.id)).map(task => ({
      id: task.id,
      type: task.type,
      member: task.member,
      dueAt: task.dueAt,
      lead: task.lead,
      companions: task.companions,
      revision: task.revision,
      workflowRevision: task.workflowRevision,
      stage: workflowBucket(task.workflow),
    })),
  });
}

export function buildCommitteeWorkDigest(tasks, now = new Date()) {
  const normalized = tasks.map(normalizeTask).filter(task => task.id && task.member);
  normalized.sort((a, b) => {
    const aDue = localDueKey(a.dueAt) || "9999";
    const bDue = localDueKey(b.dueAt) || "9999";
    return aDue.localeCompare(bDue) || typeRank(a.type) - typeRank(b.type) || a.member.localeCompare(b.member, "zh-Hant");
  });
  const overdue = normalized.filter(task => {
    const due = parseDueAt(task.dueAt);
    return due && due.getTime() < new Date(now).getTime();
  }).length;
  const buckets = normalized.map(task => workflowBucket(task.workflow));
  const counts = {
    active: normalized.length,
    overdue,
    feedback: buckets.filter(bucket => bucket === "feedback").length,
    vote: buckets.filter(bucket => bucket === "vote").length,
  };
  const lines = [
    `【會員委員會每週工作進度｜${formatTitleDate(now)}】`,
    "",
    `目前進行中 ${counts.active} 件`,
    `逾期 ${counts.overdue} 件｜回饋中 ${counts.feedback} 件｜投票中 ${counts.vote} 件`,
  ];
  if (!normalized.length) {
    lines.push("", "目前沒有待處理案件。", "", "謝謝大家！");
  } else {
    const dueGroups = new Map();
    for (const task of normalized) {
      const dueKey = localDueKey(task.dueAt);
      if (!dueGroups.has(dueKey)) dueGroups.set(dueKey, []);
      dueGroups.get(dueKey).push(task);
    }
    for (const [dueKey, dueTasks] of dueGroups) {
      lines.push("", formatDueHeading(dueKey, now));
      const typeGroups = new Map();
      for (const task of dueTasks) {
        if (!typeGroups.has(task.type)) typeGroups.set(task.type, []);
        typeGroups.get(task.type).push(task);
      }
      for (const [type, typeTasks] of [...typeGroups].sort((a, b) => typeRank(a[0]) - typeRank(b[0]))) {
        lines.push("", `【${TYPE_LABELS[type] || "會員工作"}】`, ...typeTasks.map(taskLine));
      }
    }
    lines.push("", "請各主責與陪訪委員留意期限；", "若排程或分工需要調整，請直接在群組提出，謝謝大家！");
  }
  const content = lines.join("\n");
  if ([...content].length > 4500) throw new Error("目前案件產生的 LINE 預覽超過 4,500 字，請先整理已失效的工作再產生");
  return { content, counts, source: committeeWorkDigestSource(normalized, now) };
}
