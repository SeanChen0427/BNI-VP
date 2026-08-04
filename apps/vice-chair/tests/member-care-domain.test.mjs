import assert from "node:assert/strict";
import {createRequire} from "node:module";
import test from "node:test";

const require=createRequire(import.meta.url);
const domain=require("../core/member-care-domain.js");

test("依正式徽章數量拆分期中與新會員，不受月份文字影響",()=>{
  const section={
    badges:["2 位","1 位"],
    cards:[
      {title:"復會會員甲",detail:"2025-12-01 入會・滿 7 個月"},
      {title:"會員乙",detail:"2026-01-01 入會・滿 6 個月"},
      {title:"新會員丙",detail:"2026-05-01 入會・在會 15 週"},
    ],
  };
  const result=domain.splitLifecycleCards(section);
  assert.deepEqual(result.midterm.map(card=>card.title),["復會會員甲","會員乙"]);
  assert.deepEqual(result.newMembers.map(card=>card.title),["新會員丙"]);
});

test("舊快照缺少徽章時，滿 5 至 7 個月皆視為期中關懷",()=>{
  const section={cards:[
    {title:"會員甲",detail:"滿 5 個月"},
    {title:"會員乙",detail:"滿 6 個月"},
    {title:"會員丙",detail:"滿 7 個月"},
    {title:"新會員丁",detail:"在會 10 週"},
  ]};
  const result=domain.splitLifecycleCards(section);
  assert.deepEqual(result.midterm.map(card=>card.title),["會員甲","會員乙","會員丙"]);
  assert.deepEqual(result.newMembers.map(card=>card.title),["新會員丁"]);
});
