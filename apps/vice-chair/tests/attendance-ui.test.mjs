import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const html = read("apps/vice-chair/attendance.html");
const script = read("apps/vice-chair/assets/js/attendance.js");
const style = read("apps/vice-chair/assets/css/attendance-usability.css");
const edge = read("supabase/functions/app-api/index.ts");

assert.match(html, /id="reopenWeek"/);
assert.match(script, /action:"reopen"/);
assert.match(edge, /body\.action === "reopen"/);
assert.match(edge, /status: "draft"/);
assert.match(style, /\.preview-card,\n\.approval-card \{\n  position: static;/);
assert.match(style, /max-height: none;\n  overflow: visible;/);
assert.match(script, /navigator\.clipboard\?\.writeText/);
assert.match(script, /document\.execCommand\("copy"\)/);

console.log("attendance UI tests passed");
