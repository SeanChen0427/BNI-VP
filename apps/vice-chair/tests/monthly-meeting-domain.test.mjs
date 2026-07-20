import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);
const domain=require("../core/monthly-meeting-domain.js");

assert.equal(domain.isNewMemberReview({title:"會員甲｜35 分 紅燈 新會員"}),true);
assert.equal(domain.isNewMemberReview({detail:"2026-05 入會・在會 11 週"}),true);
assert.equal(domain.isNewMemberReview({action:"指派 Mentor，兩週後確認"}),true);
assert.equal(domain.isNewMemberReview({detail:"2026-01 入會・滿 6 個月",action:"安排期中面談"}),false);

const review={assignmentRequired:false,owner:""};
const actionable={assignmentRequired:true,owner:"",dueDate:""};
const legacy={owner:"",dueDate:""};
const complete={owner:"委員甲",dueDate:"2026-07-20"};

assert.equal(domain.requiresCareAssignment(review),false);
assert.equal(domain.requiresCareAssignment(legacy),true);
assert.equal(domain.isCareScheduleComplete(review),true);
assert.equal(domain.isCareScheduleComplete(complete),true);
assert.deepEqual(domain.missingCareAssignments([review,actionable,legacy]),[actionable,legacy]);
assert.equal(domain.hasCareAssignmentConflict([{...review,owner:"導師甲",companion:"導師甲"}]),false);
assert.equal(domain.hasCareAssignmentConflict([{assignmentRequired:true,owner:"委員甲",companion:"委員甲"}]),true);

console.log("monthly-meeting-domain tests passed");
