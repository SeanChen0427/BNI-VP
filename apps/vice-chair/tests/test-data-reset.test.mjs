import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const resetService = require("../services/test-data-reset.js");

function fakeStorage(entries) {
  const values = new Map(Object.entries(entries));
  return {
    get length() {
      return values.size;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

const storage = fakeStorage({
  "fulian-work-plan-v1": JSON.stringify([{ id: "task-1" }, { id: "task-2" }]),
  "fulian-case-workflow-v2-task-1": "{}",
  "fulian-midterm-counseling-draft-v2-task-1": "{}",
  "fulian-auth-config-v1": "{}",
  "fulian-attendance-prototype-v1": "{}",
  "fulian-announcement-board-v1": "[]",
});

assert.equal(resetService.taskCount(storage), 2);
assert.deepEqual(resetService.resettableStorageKeys(storage).sort(), [
  "fulian-case-workflow-v2-task-1",
  "fulian-midterm-counseling-draft-v2-task-1",
  "fulian-work-plan-v1",
]);
assert.ok(
  !resetService.resettableStorageKeys(storage).includes("fulian-auth-config-v1")
);
assert.ok(
  !resetService
    .resettableStorageKeys(storage)
    .includes("fulian-attendance-prototype-v1")
);
assert.ok(
  !resetService
    .resettableStorageKeys(storage)
    .includes("fulian-announcement-board-v1")
);

console.log("test-data-reset tests passed");
