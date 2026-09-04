import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  compareProductVersions,
  nextProductVersion,
  parseProductVersion,
  selectHighestChangeType,
  validateReleaseTransition
} from "../core/version-domain.mjs";

const appRoot = new URL("../", import.meta.url);
const projectRoot = new URL("../../../", import.meta.url);
const releaseState = JSON.parse(fs.readFileSync(new URL("release-version.json", appRoot), "utf8"));
const releaseNotes = fs.readFileSync(new URL("assets/js/release-notes.js", appRoot), "utf8");

test("產品版本可正規化 v 前綴，並以三段整數比較", () => {
  assert.deepEqual(parseProductVersion("v1.10.0"), {
    major: 1,
    minor: 10,
    patch: 0,
    version: "1.10.0"
  });
  assert.equal(parseProductVersion("1.01.0"), null);
  assert.equal(parseProductVersion("1.0"), null);
  assert.equal(compareProductVersions("1.10.0", "1.9.0"), 1);
  assert.equal(compareProductVersions("v2.0.0", "1.99.99"), 1);
});

test("v1.0.25 之後依功能、修正與不相容改版跳號", () => {
  assert.equal(nextProductVersion("1.0.25", "feature"), "1.1.0");
  assert.equal(nextProductVersion("1.0.25", "fix"), "1.0.26");
  assert.equal(nextProductVersion("1.0.25", "breaking"), "2.0.0");
  assert.equal(nextProductVersion("1.0.25", "none"), "1.0.25");
  assert.equal(nextProductVersion("1.1.0", "fix"), "1.1.1");
  assert.equal(nextProductVersion("1.1.7", "feature"), "1.2.0");
});

test("混合發布採影響最高的變更類型", () => {
  assert.equal(selectHighestChangeType(["fix", "feature"]), "feature");
  assert.equal(selectHighestChangeType(["feature", "breaking", "fix"]), "breaking");
  assert.equal(nextProductVersion("1.0.25", ["fix", "feature"]), "1.1.0");
  assert.throws(() => nextProductVersion("1.0.25", "marketing"), /未知的版本變更類型/);
});

test("目前 v1.0.25 是保留舊編碼的有效基準", () => {
  const validation = validateReleaseTransition(releaseState);
  assert.equal(validation.valid, true);
  assert.equal(releaseState.currentVersion, "1.0.25");
  assert.equal(releaseState.previousVersion, null);
  assert.equal(releaseState.changeType, "legacy");
});

test("未來版本必須精確符合所宣告的變更類型", () => {
  assert.equal(validateReleaseTransition({
    previousVersion: "1.0.25",
    currentVersion: "1.1.0",
    changeType: "feature"
  }).valid, true);

  const invalid = validateReleaseTransition({
    previousVersion: "1.0.25",
    currentVersion: "1.0.26",
    changeType: "feature"
  });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.expectedVersion, "1.1.0");
});

test("版本狀態須與使用者更新紀錄第一筆一致，歷史版本不重編", () => {
  const versions = [...releaseNotes.matchAll(/\bversion:\s*"(\d+\.\d+\.\d+)"/g)].map(match => match[1]);
  assert.equal(versions[0], releaseState.currentVersion);
  assert.equal(versions.at(-1), "1.0.0");
  assert.equal(new Set(versions).size, versions.length);
  versions.slice(1).forEach((version, index) => {
    assert.equal(compareProductVersions(versions[index], version), 1);
  });
});

test("版本預覽指令會從目前正式版本計算下一版", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/next-release-version.mjs", "fix", "feature"],
    { cwd: projectRoot, encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /目前：v1\.0\.25/);
  assert.match(result.stdout, /分類：feature → minor/);
  assert.match(result.stdout, /下一版：v1\.1\.0/);
});
