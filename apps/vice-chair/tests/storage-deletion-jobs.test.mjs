import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("案件刪除先建立附件清理工作，刪檔失敗不再靜默忽略", () => {
  const migration = read("supabase/migrations/20260828160000_case_vote_reply_calls.sql");
  const edge = read("supabase/functions/app-api/index.ts");
  const taskStore = read("apps/vice-chair/assets/js/task-store.js");
  const board = read("apps/vice-chair/assets/js/case-board.js");
  const deleteStart = edge.indexOf('if (body.action === "delete")');
  const deleteEnd = edge.indexOf("\n  const tasks = Array.isArray", deleteStart);
  const deleteSection = edge.slice(deleteStart, deleteEnd);

  assert.match(migration, /create table public\.storage_deletion_jobs/);
  assert.match(migration, /status in \('pending', 'deleted', 'failed'\)/);
  assert.match(migration, /unique \(bucket_id, object_path\)/);
  assert.match(deleteSection, /queueStorageDeletionJobs\(id, row\.id, files/);
  assert.match(deleteSection, /rpc\/edge_delete_task/);
  assert.match(deleteSection, /performStorageDeletionJobs/);
  assert.ok(
    deleteSection.indexOf("queueStorageDeletionJobs") < deleteSection.indexOf("rpc/edge_delete_task"),
    "必須在資料庫案件刪除前留下附件清理工作",
  );
  assert.doesNotMatch(edge, /storage\/v1\/object\/case-files\/\$\{file\.object_path\}[\s\S]{0,100}catch\(console\.error\)/);
  assert.match(taskStore, /fulian:storage-cleanup-warning/);
  assert.match(board, /案件資料已刪除，但有/);
});
