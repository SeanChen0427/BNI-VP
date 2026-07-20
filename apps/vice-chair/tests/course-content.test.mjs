import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const context = vm.createContext({ window: {} });
const courseData = await readFile(
  new URL("../assets/js/course-data.js", import.meta.url),
  "utf8"
);
const editorial = await readFile(
  new URL("../assets/js/course-editorial.js", import.meta.url),
  "utf8"
);

vm.runInContext(courseData, context);
vm.runInContext(editorial, context);

const lessons = context.window.courseChapters.flatMap(chapter => chapter.lessons);
assert.equal(lessons.length, 26, "副主席課程應維持 26 個單元");

const lesson = title => {
  const found = lessons.find(item => item.title === title);
  assert.ok(found, `找不到課程單元：${title}`);
  return `${found.intro}\n${found.goal}\n${found.takeaway}\n${found.body}`;
};

const framework = lesson("321A與兩小時訪談");
for (const anchor of [
  "3年專業經驗",
  "2年穩定經營",
  "1項清楚專業",
  "A代表合作態度",
  "入會後8～12週",
]) {
  assert.ok(framework.includes(anchor), `321A 課程缺少：${anchor}`);
}
assert.ok(framework.includes("不是系統自動否決門檻"));

const renewalPeriod = lesson("雙層期限與續約資料區間");
assert.ok(renewalPeriod.includes("第一次續約依實際完整會籍月份"));
assert.ok(renewalPeriod.includes("第二次續約起"));
assert.ok(renewalPeriod.includes("實際10個完整月份"));

const feedbackVote = lesson("終期輔導、回饋與投票");
assert.ok(feedbackVote.includes("回饋門檻"));
assert.ok(feedbackVote.includes("投票門檻"));
assert.ok(feedbackVote.includes("迴避後有效基數"));

const gray = lesson("紅燈有條件續約與灰燈分流");
assert.ok(gray.includes("正式定義仍待補充"));
assert.ok(gray.includes("不要把「灰燈就是黑燈」當成完整定義"));

const attendance = lesson("六個月出席規則");
assert.ok(attendance.includes("富聯現行決議"));
assert.ok(attendance.includes("高屏區V9.1"));
assert.ok(attendance.includes("第4次缺席"));

const accountability = lesson("公告、當責與異議");
assert.ok(accountability.includes("舊「資格終止」公版只供歷史追溯"));
assert.ok(accountability.includes("開放專業類別"));

const recusal = lesson("回饋文化與本人迴避");
assert.ok(recusal.includes("主訪、陪訪與案件負責人仍須回饋及投票"));
assert.ok(recusal.includes("不是迴避人員"));

const authority = lesson("投票快照、迴避與確認權責");
assert.ok(authority.includes("高屏區辦公室"));
assert.ok(authority.includes("最終裁量與解釋權"));
assert.ok(!authority.includes("董事顧問有最終裁量權"));

const submission = lesson("表單與中心區送件");
assert.ok(submission.includes("系統清單齊全"));
assert.ok(submission.includes("已送中心區"));
assert.ok(submission.includes("中心區完成"));
assert.ok(submission.includes("實際要求以當次中心區確認為準"));

const courseHtml = await readFile(
  new URL("../course.html", import.meta.url),
  "utf8"
);
const courseApp = await readFile(
  new URL("../assets/js/app-v2.js", import.meta.url),
  "utf8"
);
for (const leftover of [
  "試用終期輔導",
  "試用期中輔導",
  "重設測試進度",
  "測試進度已重設",
  "下一階段串接",
]) {
  assert.ok(
    !`${courseHtml}\n${courseApp}`.includes(leftover),
    `課程介面仍含測試殘留文字：${leftover}`
  );
}
assert.ok(courseHtml.includes("重新開始課程"));
assert.ok(courseHtml.includes("26</b><small>實務單元"));

console.log("course-content tests passed");
