import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const root = new URL("../../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("所有排程頁面都載入最新版 Supabase task store", () => {
  const pages = [
    "apps/vice-chair/index.html",
    "apps/vice-chair/case-board.html",
    "apps/vice-chair/member-care.html",
    "apps/vice-chair/monthly-meeting.html",
    "apps/vice-chair/case-workflow.html",
    "apps/vice-chair/case-archive.html",
    "apps/vice-chair/terminal-form.html",
    "apps/vice-chair/new-member-form.html",
    "apps/vice-chair/industry-change-form.html",
    "apps/vice-chair/midterm-form.html",
    "apps/vice-chair/departure-form.html",
  ];
  for (const page of pages) {
    assert.match(read(page), /assets\/js\/task-store\.js\?v=4/, `${page} 未載入 task-store v4`);
  }
});

test("舊裝置更新單筆工作不會推斷刪除另一台的新工作", async () => {
  const requests = [];
  let serverTasks = [
    { id: "task-a", member: "甲", _revision: 1 },
    { id: "task-b", member: "乙", _revision: 1 },
  ];
  class FakeStorage {
    constructor() { this.values = new Map(); }
    get length() { return this.values.size; }
    key(index) { return [...this.values.keys()][index] || null; }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
  }
  const nodes = new Map();
  const document = {
    body: { append(node) { nodes.set(node.id, node); } },
    getElementById(id) { return nodes.get(id) || null; },
    createElement() {
      return {
        style: {},
        setAttribute() {},
        remove() { if (this.id) nodes.delete(this.id); },
      };
    },
  };
  const localStorage = new FakeStorage();
  const context = {
    console,
    document,
    localStorage,
    Storage: FakeStorage,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    FulianAuth: { getSession: () => ({ role: "vp" }) },
    fetch: async (_url, options = {}) => {
      if (!options.method) return { ok: true, status: 200, json: async () => ({ tasks: serverTasks }) };
      const body = JSON.parse(options.body);
      requests.push(body);
      if (body.action === "upsert") {
        for (const incoming of body.tasks) {
          const index = serverTasks.findIndex(task => task.id === incoming.id);
          serverTasks[index] = { ...incoming, _revision: serverTasks[index]._revision + 1 };
        }
      } else if (body.action === "delete") {
        serverTasks = serverTasks.filter(task => task.id !== body.id);
      }
      return { ok: true, status: 200, json: async () => ({ tasks: serverTasks }) };
    },
  };
  context.window = context;
  context.window.FulianCaseDomain = { TASK_STORAGE_KEY: "fulian-work-plan-v1" };
  context.window.dispatchEvent = () => {};
  vm.runInNewContext(read("apps/vice-chair/assets/js/task-store.js"), context);
  await context.window.FulianTaskStore.ready;

  localStorage.setItem("fulian-work-plan-v1", JSON.stringify([
    { id: "task-a", member: "甲（更新）", _revision: 1 },
  ]));
  await context.window.FulianTaskStore.flush();

  assert.deepEqual(requests[0].action, "upsert");
  assert.deepEqual(requests[0].tasks.map(task => task.id), ["task-a"]);
  assert.equal("deletedIds" in requests[0], false);
  assert.equal(JSON.stringify(context.window.FulianTaskStore.all().map(task => task.id)), '["task-a","task-b"]');

  await context.window.FulianTaskStore.remove("task-b");
  assert.equal(requests.at(-1).action, "delete");
  assert.equal(JSON.stringify(context.window.FulianTaskStore.all().map(task => task.id)), '["task-a"]');
});

test("Edge API 使用版本衝突、交易 RPC 與明確刪除保護", () => {
  const source = read("supabase/functions/app-api/index.ts");
  const migration = read("supabase/migrations/20260724170000_case_cloud_sync_and_task_hardening.sql");
  const transactionMigration = read("supabase/migrations/20260725150000_transactional_case_operations.sql");
  assert.match(source, /path === "\/api\/tasks"/);
  assert.match(source, /body\.action === "delete"/);
  assert.match(source, /row\.lead_person_id !== context\.personId/);
  assert.match(source, /TASK_CONFLICT/);
  assert.match(source, /rpc\/edge_save_task/);
  assert.match(source, /rpc\/edge_delete_task/);
  assert.match(source, /rpc\/edge_save_case_state/);
  assert.match(source, /rpc\/edge_open_task_vote/);
  assert.match(migration, /for update/);
  assert.match(migration, /revoke all on public\.tasks/);
  assert.match(transactionMigration, /create or replace function public\.edge_delete_task/);
  assert.match(transactionMigration, /delete from public\.vote_snapshots/);
  assert.match(transactionMigration, /delete from public\.cases/);
});

test("案件流程、草稿與 Word 都走受保護的 Supabase API", () => {
  const stateStore = read("apps/vice-chair/assets/js/case-state-store.js");
  const caseFiles = read("apps/vice-chair/services/case-files.js");
  const edge = read("supabase/functions/app-api/index.ts");
  assert.match(stateStore, /\/api\/case-states/);
  assert.match(stateStore, /FulianCaseStateStore/);
  assert.match(caseFiles, /\/api\/task-file/);
  assert.match(caseFiles, /FulianCaseStateStore\?\.[a-z]+\(\)/);
  assert.match(edge, /path === "\/api\/case-states"/);
  assert.match(edge, /path === "\/api\/task-file"/);
  assert.match(edge, /只有副主席或本案受指派人員可以保存訪談草稿/);
  assert.equal(
    edge.match(/function decodeBase64\(/g)?.length,
    1,
    "Edge Function 不得重複宣告 decodeBase64，否則正式環境會 BOOT_ERROR",
  );
});

test("兩位委員同時提交回饋與投票時，各自資料不共用案件 revision", async () => {
  const source = read("apps/vice-chair/assets/js/case-state-store.js");
  const shared = { feedback: {}, votes: {} };

  function client(identity) {
    class FakeStorage {
      constructor() { this.values = new Map(); }
      getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
      setItem(key, value) { this.values.set(key, String(value)); }
      removeItem(key) { this.values.delete(key); }
    }
    const localStorage = new FakeStorage();
    const document = {
      hidden: false,
      body: { append() {} },
      getElementById() { return null; },
      createElement() { return { style: {}, setAttribute() {} }; },
      addEventListener() {},
    };
    const state = () => ({
      taskId: "task-1",
      workflow: {
        feedback: { ...shared.feedback },
        votes: { ...shared.votes },
        votingOpen: true,
        voteNoticeSent: true,
        voterSnapshot: ["委員甲", "委員乙"],
      },
      draft: {},
      revision: 7,
    });
    const context = {
      console,
      document,
      localStorage,
      Storage: FakeStorage,
      CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
      setInterval() { return 1; },
      fetch: async (_url, options = {}) => {
        if (!options.method) return { ok: true, status: 200, json: async () => ({ states: [state()] }) };
        const body = JSON.parse(options.body);
        if (body.kind === "feedback") shared.feedback[identity] = body.value;
        if (body.kind === "vote") shared.votes[identity] = body.value;
        return { ok: true, status: 200, json: async () => state() };
      },
    };
    context.window = context;
    context.window.addEventListener = () => {};
    context.window.dispatchEvent = () => {};
    context.window.FulianCaseDomain = {
      DRAFT_PREFIX_BY_TYPE: {},
      workflowStorageKey: id => `fulian-case-workflow-v2-${id}`,
      draftStorageKey: () => "",
    };
    context.window.FulianTaskStore = {
      ready: Promise.resolve(),
      all: () => [{ id: "task-1" }],
      refresh: async () => [],
    };
    vm.runInNewContext(source, context);
    return context.window.FulianCaseStateStore;
  }

  const clientA = client("委員甲");
  const clientB = client("委員乙");
  await Promise.all([clientA.ready, clientB.ready]);
  await Promise.all([
    clientA.saveFeedback("task-1", "甲的獨立回饋"),
    clientB.saveFeedback("task-1", "乙的獨立回饋"),
  ]);
  await Promise.all([
    clientA.saveVote("task-1", "approve"),
    clientB.saveVote("task-1", "reject"),
  ]);

  assert.deepEqual(shared.feedback, { 委員甲: "甲的獨立回饋", 委員乙: "乙的獨立回饋" });
  assert.deepEqual(shared.votes, { 委員甲: "approve", 委員乙: "reject" });
});

test("正式案件參與資料由 Edge 驗證姓名、迴避、期限與單票不可改寫", () => {
  const edge = read("supabase/functions/app-api/index.ts");
  const migration = read("supabase/migrations/20260725103000_normalize_case_participation.sql");
  const transactionMigration = read("supabase/migrations/20260725150000_transactional_case_operations.sql");
  assert.match(edge, /body\.kind === "feedback"/);
  assert.match(edge, /body\.kind === "vote"/);
  assert.match(edge, /body\.kind === "open-vote"/);
  assert.match(edge, /rpc\/edge_save_case_feedback/);
  assert.match(edge, /rpc\/edge_cast_case_vote/);
  assert.match(transactionMigration, /既有票不得修改/);
  assert.match(transactionMigration, /on conflict \(case_id, author_person_id\) do update/);
  assert.match(transactionMigration, /vote_snapshot_voters/);
  assert.match(transactionMigration, /申請者本人強制迴避/);
  assert.match(transactionMigration, /LEGACY_MIGRATION/);
  assert.match(migration, /edge_ensure_task_case/);
  assert.match(migration, /revoke all on public\.cases, public\.case_feedback/);
});

test("共同編輯衝突會停止覆寫，暫時斷線會自動重試", () => {
  const caseStore = read("apps/vice-chair/assets/js/case-state-store.js");
  const taskStore = read("apps/vice-chair/assets/js/task-store.js");
  assert.match(caseStore, /caseExternalUpdateAlert/);
  assert.match(caseStore, /detectDraftConflict/);
  assert.match(caseStore, /failedSaves/);
  assert.match(caseStore, /retryFailed/);
  assert.match(caseStore, /async function reconcileDraft/);
  assert.match(caseStore, /if \(!Object\.keys\(current\)\.length\) return false/);
  assert.match(taskStore, /retryTasks/);
  assert.match(taskStore, /retryPending/);
});

test("月會排定必須由 Supabase 任務佐證，舊草稿會自動修復", () => {
  const edge = read("supabase/functions/app-api/index.ts");
  const monthly = read("apps/vice-chair/assets/js/monthly-meeting.js");
  const rpcFix = read("supabase/migrations/20260727131500_fix_edge_save_task_ambiguity.sql");
  const rpcVariableFix = read("supabase/migrations/20260727133000_fix_edge_save_task_variable_ambiguity.sql");
  assert.match(edge, /async function ensureMonthlyCareTasks/);
  assert.match(edge, /body\.action === "reconcile-care-tasks"/);
  assert.match(edge, /record = \(await ensureMonthlyCareTasks\(record, context\)\)\.record/);
  assert.match(edge, /await saveLeadershipTask\(monthlyCareTaskInput/);
  assert.match(monthly, /action:"reconcile-care-tasks"/);
  assert.match(monthly, /await window\.FulianTaskStore\.refresh\(\)/);
  assert.match(monthly, /staleSchedule\?"pending"/);
  assert.match(rpcFix, /on conflict on constraint task_private_details_pkey/);
  assert.doesNotMatch(rpcFix, /on conflict \(task_id\)/);
  assert.match(rpcVariableFix, /due_at = v_due_at/);
  assert.match(rpcVariableFix, /completed_at = v_completed_at/);
  assert.match(rpcVariableFix, /status = v_task_status/);
  assert.match(rpcVariableFix, /returning public\.tasks\.id, public\.tasks\.revision/);
  assert.doesNotMatch(rpcVariableFix, /^\s{2}(task_status|completed_at|due_at|companion_id)\s/m);
});
