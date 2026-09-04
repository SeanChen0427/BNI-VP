import fs from "node:fs";

import {
  PRODUCT_VERSION_POLICY,
  nextProductVersion,
  selectHighestChangeType,
  validateReleaseTransition
} from "../apps/vice-chair/core/version-domain.mjs";

const stateUrl = new URL("../apps/vice-chair/release-version.json", import.meta.url);

function usage() {
  return [
    "用法：npm run version:next -- <變更類型...>",
    "變更類型：feature（新功能）、fix（修正／安全強化）、breaking（不相容改版）、none（不升版）",
    "若同一批有多種類型，會自動採影響最高者。例如：npm run version:next -- fix feature"
  ].join("\n");
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(usage());
  process.exit(0);
}

if (args.length === 0) {
  console.error(usage());
  process.exit(1);
}

try {
  const state = JSON.parse(fs.readFileSync(stateUrl, "utf8"));
  if (state.schema !== PRODUCT_VERSION_POLICY.schema) {
    throw new Error(`不支援的版本規則 schema：${String(state.schema)}`);
  }

  const recordedTransition = validateReleaseTransition(state);
  if (!recordedTransition.valid) {
    throw new Error(`目前版本狀態無效：${recordedTransition.reason}`);
  }

  const changeType = selectHighestChangeType(args);
  const nextVersion = nextProductVersion(state.currentVersion, changeType);
  const bump = PRODUCT_VERSION_POLICY.changeTypes[changeType].bump;

  console.log(`目前：v${state.currentVersion}`);
  console.log(`分類：${changeType} → ${bump}`);
  console.log(
    changeType === "none"
      ? "結果：不建立新的產品版本"
      : `下一版：v${nextVersion}`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
