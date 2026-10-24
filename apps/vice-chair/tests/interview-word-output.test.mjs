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

test("兩種表單只呈現V1.1，分會備註留在內部且保留未映射的舊草稿",async()=>{
 const view=await readFile(new URL("../assets/js/membership-form.js",import.meta.url),"utf8");
 assert.match(view,/會員制度與權益確認書/);assert.match(view,/contactRelation/);assert.doesNotMatch(view,/26\./);
 for(const stem of ["new-member","industry-change"]){
  const source=await readFile(new URL(`../assets/js/${stem}-form.js`,import.meta.url),"utf8"),html=await readFile(new URL(`../${stem}-form.html`,import.meta.url),"utf8");
  assert.match(source,/formVersion:window\.FulianMembershipForm\.version/);assert.match(source,/\.\.\.JSON\.parse\(localStorage\.getItem\(STORE_KEY\)/);
  assert.doesNotMatch(source,/DEFAULT_CHAPTER_NOTES|const commitmentQuestions/);assert.match(html,/membership-form\.js/);
 }
});
