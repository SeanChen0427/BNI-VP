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
    assert.match(read(page), /assets\/js\/task-store\.js\?v=2/, `${page} 未載入 task-store v2`);
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
  assert.match(source, /path === "\/api\/tasks"/);
  assert.match(source, /body\.action === "delete"/);
  assert.match(source, /row\.lead_person_id !== context\.personId/);
  assert.match(source, /TASK_CONFLICT/);
  assert.match(source, /rpc\/edge_save_task/);
  assert.match(migration, /for update/);
  assert.match(migration, /revoke all on public\.tasks/);
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
});
