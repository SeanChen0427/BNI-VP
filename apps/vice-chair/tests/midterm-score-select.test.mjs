import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../assets/js/midterm-form.js", import.meta.url),
  "utf8"
);

assert.match(
  source,
  /section==="reality"&&index===0/,
  "Reality 第 1 題必須使用專用評分控制項"
);
assert.match(
  source,
  /section==="forward"&&index===2/,
  "Way Forward 第 3 題的承諾投入度必須使用專用評分控制項"
);
assert.match(
  source,
  /<select id="\$\{id\}" data-save>/,
  "評分控制項必須是可保存的下拉選單"
);
assert.match(
  source,
  /Array\.from\(\{length:10\}/,
  "下拉選單必須提供 1～10 共十個選項"
);
assert.match(
  source,
  /\["reality_0","forward_2"\]\.includes\(e\.id\)\?normalizeScore/,
  "兩個既有草稿評分都必須能轉換為下拉選項"
);

console.log("midterm score select tests passed");
