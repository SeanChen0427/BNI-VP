import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import test from "node:test";

const require=createRequire(import.meta.url);
const domain=require("../core/interview-word-domain.js");

test("Word 勾選符號忠實反映 checkbox 狀態",()=>{
  assert.equal(domain.checkboxMark({checked:true}),"■");
  assert.equal(domain.checkboxMark({checked:false}),"□");
  assert.equal(domain.checkboxMark(null),"□");
});

test("第 26 題提供三項可編輯預設內容",()=>{
  assert.equal(domain.DEFAULT_CHAPTER_NOTES,[
    "1. 3次遲到及早退轉為一次缺席",
    "2. 紅燈有條件續約，灰燈不予續約",
    "3. 續約須於續約到期日前2個月的當月15日前完成申請及繳費，逾期代表放棄續約權益。",
  ].join("\n"));
});

test("新會員與轉換行業別 Word 產生器都以元素 id 讀取勾選",async()=>{
  for(const file of ["new-member-form.js","industry-change-form.js"]){
    const source=await readFile(new URL(`../assets/js/${file}`,import.meta.url),"utf8");
    assert.match(source,/checkboxMark\(document\.getElementById\(id\)\)/);
    assert.doesNotMatch(source,/function check\(id\)\{return \$\(id\)/);
  }
});

test("新會員表單先套用預設備註，再讓已保存草稿覆寫",async()=>{
  const source=await readFile(new URL("../assets/js/new-member-form.js",import.meta.url),"utf8");
  const defaultsAt=source.indexOf("DEFAULT_CHAPTER_NOTES");
  const restoreAt=source.lastIndexOf("restore(JSON.parse");
  assert.ok(defaultsAt>=0&&restoreAt>defaultsAt);
});
