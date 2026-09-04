import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const read=relative=>readFile(new URL(relative,import.meta.url),"utf8");

test("登入帳號只能讀取委員任期，不能直接新增、修改或刪除",async()=>{
  const migration=await read("../../../supabase/migrations/20260904180000_lock_committee_term_writes.sql");
  assert.match(migration,/drop policy if exists committee_terms_write_leadership/);
  assert.match(migration,/drop policy if exists committee_terms_update_leadership/);
  assert.match(migration,/revoke insert, update, delete, truncate, references, trigger[\s\S]*?from public, anon, authenticated/);
  assert.match(migration,/grant select on table public\.committee_terms to authenticated/);
  assert.doesNotMatch(migration,/grant[^;]*(?:insert|update|delete)[^;]*to authenticated/i);
});

test("年度換屆仍由 Admin API 與 service role 原子執行",async()=>{
  const [api,handoverMigration,permissionMigration]=await Promise.all([
    read("../../../supabase/functions/app-api/index.ts"),
    read("../../../supabase/migrations/20260904150000_annual_committee_handover.sql"),
    read("../../../supabase/migrations/20260904180000_lock_committee_term_writes.sql")
  ]);
  assert.match(api,/async function annualHandoverApi[\s\S]*?context\.role !== "admin"/);
  assert.match(api,/rpc\/edge_schedule_committee_handover/);
  assert.match(api,/rpc\/edge_cancel_committee_handover/);
  assert.match(handoverMigration,/create or replace function public\.edge_apply_due_committee_handoffs\(\)[\s\S]*?security definer/);
  assert.match(handoverMigration,/grant execute on function public\.edge_schedule_committee_handover[\s\S]*?to service_role/);
  assert.match(permissionMigration,/grant select, insert, update on table public\.committee_terms to service_role/);
});

test("前台登入仍保留任期唯讀查詢",async()=>{
  const auth=await read("../assets/js/auth.js");
  assert.match(auth,/\/rest\/v1\/committee_terms\?/);
  assert.doesNotMatch(auth,/\/rest\/v1\/committee_terms[^\n]*(?:method:\s*"(?:POST|PATCH|DELETE)")/);
});
