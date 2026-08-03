import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const root = new URL("../../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("副主席代填回饋會傳送回饋歸屬人，投票仍只使用登入者", async () => {
  const source = read("apps/vice-chair/assets/js/case-state-store.js");
  const requests = [];

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
  const state = {
    taskId: "case-1",
    workflow: { feedback: {}, votes: {} },
    draft: {},
    revision: 3,
  };
  const context = {
    console,
    document,
    localStorage,
    Storage: FakeStorage,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    setInterval() { return 1; },
    fetch: async (_url, options = {}) => {
      if (!options.method) return { ok: true, status: 200, json: async () => ({ states: [state] }) };
      requests.push(JSON.parse(options.body));
      return { ok: true, status: 200, json: async () => state };
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
    all: () => [{ id: "case-1" }],
    refresh: async () => [],
  };

  vm.runInNewContext(source, context);
  await context.window.FulianCaseStateStore.ready;
  await context.window.FulianCaseStateStore.saveFeedback("case-1", "LINE 提供的回饋", "委員乙");
  await context.window.FulianCaseStateStore.saveVote("case-1", "approve");

  assert.equal(requests[0].kind, "feedback");
  assert.equal(requests[0].authorName, "委員乙");
  assert.equal(requests[1].kind, "vote");
  assert.equal("authorName" in requests[1], false, "投票不可沿用代填歸屬人");
});

test("前後端與資料庫共同限制只有副主席能代填，並保留實際操作者", () => {
  const html = read("apps/vice-chair/case-workflow.html");
  const workflow = read("apps/vice-chair/assets/js/case-workflow.js");
  const edge = read("supabase/functions/app-api/index.ts");
  const migration = read("supabase/migrations/20260804010000_vp_proxy_case_feedback.sql");

  assert.match(html, /id="feedbackProxyControl" hidden/);
  assert.match(html, /id="feedbackAuthor"/);
  assert.match(workflow, /target!==user&&!isVp\(\)/);
  assert.match(workflow, /saveFeedback\(CASE_ID,text,target\)/);
  assert.match(edge, /context\.role !== "vp"/);
  assert.match(edge, /item\.role === "committee"/);
  assert.match(edge, /p_author: authorPersonId/);
  assert.match(edge, /feedbackMeta/);
  assert.match(migration, /submitted_by_person_id/);
  assert.match(migration, /只有現任副主席可以代填委員回饋/);
  assert.match(migration, /只能代填現任會員委員的回饋/);
  assert.match(migration, /該委員已有本人回饋，不可由副主席代填覆蓋/);
  assert.match(migration, /'submission_mode'.*'vp-proxy'/s);
});
