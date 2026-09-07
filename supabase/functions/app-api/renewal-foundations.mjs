import "../../../apps/vice-chair/core/calendar-domain.js";
import "../../../apps/vice-chair/core/renewal-foundation-domain.js";

const domain = globalThis.FulianRenewalFoundationDomain;
const calendar = globalThis.FulianCalendarDomain;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const validateId = value => { if (!uuid.test(value || "")) fail("追蹤識別碼無效"); return value; };

export function createRenewalFoundationsApi({ db, taskDirectory, taskSource, measure = async items => items, now = () => new Date() }) {
  const hydrate = row => ({ ...row.data, id: row.id, memberId: row.member_id, revision: row.revision, status: row.status, dueOn: row.due_on, nextCheckOn: row.next_check_on, createdAt: row.created_at, updatedAt: row.updated_at });
  function checkAssignees(value, directory) {
    const activeIds = new Set(directory.personByName.values());
    if ([value.leadId, ...value.companionIds].some(id => !activeIds.has(id))) fail("追蹤人必須為當期有效副主席或會員委員");
    value.leadName = directory.personById.get(value.leadId);
    value.companionNames = value.companionIds.map(id => directory.personById.get(id));
  }
  async function list(context, directory, contextMemberId = null, deleted = false) {
    const rows = (await db("renewal_foundations?select=*&order=created_at.desc")).filter(row => Boolean(row.data.deletedAt) === deleted);
    const memberByFoundation = new Map(rows.map(row => [row.id, row.member_id]));
    const activeIds = new Set(directory.personByName.values());
    const measured = await measure(rows.map(hydrate), now());
    return measured.map(value => {
      value.handoverPending = !domain.resolved(value) && [value.leadId, ...(value.companionIds || [])].some(id => !activeIds.has(id));
      value.canRecord = domain.canReadDetail(value, context);
      value.canReadDetail = value.canRecord || Boolean(contextMemberId && memberByFoundation.get(value.id) === contextMemberId);
      value.isLead = value.leadId === context.personId;
      if (!value.canReadDetail) {
        // General progress never exposes the agreed terms, source, contact text or evidence.
        delete value.source;
        delete value.criterion;
      }
      return value;
    });
  }
  const api = async function renewalFoundationsApi(request, context) {
    const directory = await taskDirectory();
    const url = new URL(request.url);
    let contextMemberId = null;
    if (request.method === "GET" && url.searchParams.get("contextTask")) {
      const reference = encodeURIComponent(url.searchParams.get("contextTask"));
      const tasks = await db(`tasks?source=eq.${taskSource}&source_reference=eq.${reference}&category=in.(renewal,midterm)&select=id,member_id,lead_person_id&limit=1`);
      if (tasks[0]) {
        const assignments = await db(`task_assignments?task_id=eq.${tasks[0].id}&person_id=eq.${context.personId}&select=person_id`);
        if (domain.manager(context) || tasks[0].lead_person_id === context.personId || assignments.length) contextMemberId = tasks[0].member_id;
      }
    }
    if (request.method === "GET") {
      if(url.searchParams.get("meeting") === "1") {
        if(!domain.manager(context)) fail("月會草稿提醒僅限副主席",403);
        return { snapshot: await api.snapshot(context) };
      }
      const id = url.searchParams.get("id");
      if (id) {
        validateId(id);
        const rows = await db(`renewal_foundations?id=eq.${id}&select=*&limit=1`);
        if (!rows[0]) fail("找不到此地基追蹤", 404);
        if (rows[0].data.deletedAt && !domain.manager(context)) fail("已刪除地基僅限副主席查看", 403);
        if (!domain.canReadDetail(hydrate(rows[0]), context) && rows[0].member_id !== contextMemberId) fail("只有副主席與受指派人員可查看完整追蹤紀錄", 403);
        const events = await db(`renewal_foundation_events?foundation_id=eq.${id}&select=event_type,actor_name,detail,previous_data,next_data,created_at&order=created_at.desc`);
        return { events };
      }
      const deleted = url.searchParams.get("deleted") === "1";
      if (deleted && !domain.manager(context)) fail("已刪除地基僅限副主席查看", 403);
      const items = await list(context, directory, contextMemberId, deleted);
      if (url.searchParams.get("summary") === "1") return { items };
      const sources = domain.manager(context)
        ? await db(`tasks?source=eq.${taskSource}&category=eq.renewal&select=id,member_id,title,source_reference&order=created_at.desc`)
        : [];
      return {
        items,
        sources: sources.filter(row => directory.memberById.has(row.member_id)).map(row => ({ id: row.id, caseId: row.source_reference, memberId: row.member_id, memberName: directory.memberById.get(row.member_id).name })),
        members: domain.manager(context) ? [...directory.memberById].filter(([, member]) => member.status === "active").map(([id, member]) => ({ id, name: member.name })) : [],
        people: [...directory.personByName].map(([name, id]) => ({ id, name })),
      };
    }
    if (request.method !== "POST") fail("不支援的請求方式", 405);
    const body = await request.json();
    const id = validateId(body.id);
    let current, next, detail, sourceTaskId, memberId;
    if (body.action === "create") {
      if (!domain.manager(context)) fail("只有副主席或 Admin 可建立續約地基", 403);
      const definition = domain.definition(body);
      checkAssignees(definition, directory);
      const origin = body.origin ?? "renewal";
      if (!["renewal", "legacy"].includes(origin)) fail("地基來源無效");
      let caseId = null;
      if (origin === "legacy") {
        if (body.sourceTaskId) fail("既有地基補登不連結續約案件");
        sourceTaskId = null;
        memberId = validateId(body.memberId);
        if (directory.memberById.get(memberId)?.status !== "active") fail("請選擇有效在籍會員補登既有地基");
      } else {
        sourceTaskId = validateId(body.sourceTaskId);
        const sources = await db(`tasks?id=eq.${sourceTaskId}&source=eq.${taskSource}&category=eq.renewal&select=id,member_id,source_reference&limit=1`);
        const source = sources[0];
        if (!source || !directory.memberById.has(source.member_id)) fail("請選擇有效且已連結會員的續約案件");
        memberId = source.member_id;
        caseId = source.source_reference;
      }
      next = { ...definition, origin, memberName: directory.memberById.get(memberId).name, caseId, status: "tracking", reminderCount: 0, lastRemindedOn: null };
      detail = { note: origin === "legacy" ? "補登使用系統前已議定的既有地基，依原約定日期接續追蹤" : "依人工確認的續約約定建立逐項追蹤" };
    } else {
      const rows = await db(`renewal_foundations?id=eq.${id}&select=*&limit=1`);
      const row = rows[0];
      if (!row) fail("找不到此地基追蹤", 404);
      current = hydrate(row);
      if (!Number.isInteger(body.revision) || body.revision !== row.revision) fail("追蹤已由其他人更新，請重新整理後再試", 409);
      ({ next, detail } = domain.transition(current, body, context, now()));
      if (body.action === "amend") checkAssignees(next, directory);
      sourceTaskId = row.source_task_id;
      memberId = row.member_id;
    }
    // Keep row metadata out of the versioned business snapshot; authors/times come from the server.
    for (const key of ["id", "memberId", "revision", "createdAt", "updatedAt"]) delete next[key];
    await db("rpc/edge_save_renewal_foundation", {
      method: "POST", headers: { "Content-Type": "application/json" },
      // Reversible deletion uses the existing stop/reopen audit contract; operation distinguishes it in history.
      body: JSON.stringify({ p_id: id, p_revision: current ? body.revision : 0, p_source_task_id: sourceTaskId, p_member_id: memberId, p_data: next, p_action: ({ delete: "resolve", restore: "reopen" })[body.action] || body.action, p_actor_id: context.personId, p_actor_name: context.name, p_detail: detail }),
    });
    return { saved: true, id };
  };
  api.snapshot = async context => {
    const items = (await list(context, await taskDirectory())).filter(item => domain.attention(item, now()).rank <= 2);
    // Monthly minutes are readable by all committee members: retain only progress summaries.
    return { capturedAt: now().toISOString(), items: items.map(item => ({ id: item.id, memberId: item.memberId, memberName: item.memberName, title: item.title, dueOn: item.kind === "flexible" ? calendar.shiftDayKey(item.dueOn, -1) : item.dueOn, leadName: item.leadName, progress: domain.progressText(item, now()), attention: domain.attention(item, now()).label })) };
  };
  return api;
}
