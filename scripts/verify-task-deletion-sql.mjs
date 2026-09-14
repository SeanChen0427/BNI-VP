// Isolated PostgreSQL regression; never connects to production.
// PGLITE_MODULE_PATH=/absolute/path/to/pglite/dist/index.js node scripts/verify-task-deletion-sql.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

if (!process.env.PGLITE_MODULE_PATH) throw new Error("Provide PGLITE_MODULE_PATH for isolated SQL validation");
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href);
const db = new PGlite();
const migration = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const annual = await migration("20260904150000_annual_committee_handover");
const definition = name => {
  const start = annual.indexOf(`create or replace function private.${name}()`);
  assert.ok(start >= 0);
  return annual.slice(start, annual.indexOf("$$;", start) + 3);
};

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private;
    create table people(id uuid primary key);
    create table committee_handover_plans(id uuid primary key);
    create table cases(id uuid primary key, stage text);
    create table tasks(id uuid primary key, case_id uuid references cases(id) on delete cascade,
      source text, source_reference text, revision bigint, status text);
    create table vote_snapshots(id uuid primary key, case_id uuid);
    create table votes(snapshot_id uuid);
    create table vote_snapshot_voters(snapshot_id uuid);
    create table advisor_confirmations(case_id uuid);
    create table committee_handover_events(id int primary key, note text);
  `);
  const tableStart = annual.indexOf("create table public.task_assignment_history (");
  await db.exec(annual.slice(tableStart, annual.indexOf("\n);", tableStart) + 3));
  await db.exec(definition("prevent_history_mutation") + definition("protect_completed_task_row") + definition("protect_closed_case_row"));
  await db.exec(`
    create trigger task_assignment_history_immutable before update or delete on task_assignment_history
      for each row execute function private.prevent_history_mutation();
    create trigger protect_completed_task_update before update or delete on tasks
      for each row execute function private.protect_completed_task_row();
    create trigger protect_closed_case_update before update or delete on cases
      for each row execute function private.protect_closed_case_row();
    create trigger committee_handover_events_immutable before update or delete on committee_handover_events
      for each row execute function private.prevent_history_mutation();
    insert into committee_handover_events values (1, 'original');
  `);
  await db.exec(await migration("20260805183000_task_delete_tombstones"));
  const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  async function seed(n, { caseStage = "draft", status = "pending", withCase = true } = {}) {
    if (withCase) await db.query("insert into cases values ($1,$2)", [uuid(n), caseStage]);
    await db.query("insert into tasks values ($1,$2,'vice-chair-work-plan',$3,1,$4)", [uuid(n), withCase ? uuid(n) : null, `test-${n}`, status]);
    await db.query(`insert into task_assignment_history(task_id,task_source_reference,event_type,reason,actor_name_snapshot)
      values ($1,$2,'created','test fixture','test actor')`, [uuid(n), `test-${n}`]);
  }
  const remove = (n, revision = 1) => db.query("select edge_delete_task($1,$2)", [`test-${n}`, revision]);
  const history = async n => (await db.query("select to_jsonb(h) as row from task_assignment_history h where task_source_reference=$1", [`test-${n}`])).rows[0].row;
  await seed(1);
  const original = await history(1);
  await assert.rejects(remove(1), /AUDIT_HISTORY_IMMUTABLE/);
  assert.equal((await db.query("select count(*) from tasks")).rows[0].count, 1);
  assert.equal((await db.query("select count(*) from deleted_task_references")).rows[0].count, 0);
  console.log("Reproduced original deletion failure: AUDIT_HISTORY_IMMUTABLE; transaction rolled back.");

  const fix = await migration("20260914100000_fix_task_history_delete_cascade");
  await db.exec(fix);
  await db.exec(fix); // Safe to reapply.
  await assert.rejects(db.exec("update task_assignment_history set task_id=null"), /AUDIT_HISTORY_IMMUTABLE/);
  await assert.rejects(db.exec("update task_assignment_history set reason='changed'"), /AUDIT_HISTORY_IMMUTABLE/);
  await assert.rejects(db.exec("delete from task_assignment_history"), /AUDIT_HISTORY_IMMUTABLE/);
  await assert.rejects(remove(1, 0), /TASK_CONFLICT/);
  await remove(1);
  assert.deepEqual(await history(1), { ...original, task_id: null });
  assert.equal((await db.query("select count(*) from tasks")).rows[0].count, 0);
  assert.equal((await db.query("select count(*) from cases")).rows[0].count, 0);
  await remove(1);
  await assert.rejects(seed(1, { withCase: false }), /TASK_DELETED/);
  await seed(2, { withCase: false });
  await remove(2);
  assert.equal((await history(2)).task_id, null);
  await seed(3, { status: "completed", withCase: false });
  await assert.rejects(remove(3), /TASK_HISTORY_IMMUTABLE/);
  await seed(4, { caseStage: "closed" });
  await assert.rejects(remove(4), /TASK_HISTORY_IMMUTABLE/);
  await assert.rejects(db.exec("update committee_handover_events set note='changed'"), /AUDIT_HISTORY_IMMUTABLE/);
  await assert.rejects(db.exec("delete from committee_handover_events"), /AUDIT_HISTORY_IMMUTABLE/);
  await assert.rejects(db.exec("update task_assignment_history set task_id=null where task_source_reference='test-3'"), /AUDIT_HISTORY_IMMUTABLE/);
  await assert.rejects(db.exec("delete from task_assignment_history where task_id is null"), /AUDIT_HISTORY_IMMUTABLE/);
  await db.exec("set role authenticated");
  await assert.rejects(remove(3), /permission denied/);
  await db.exec("reset role");
  console.log("PASS: cascade deletion, history preservation, idempotence, stale revision, tombstone, completed/closed protection, immutable history and RPC permissions.");
} finally {
  await db.close();
}
