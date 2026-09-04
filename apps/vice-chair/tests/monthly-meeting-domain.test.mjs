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
const nonRenewal={taskType:"renewal",disposition:"non_renewal",assignmentRequired:true,owner:"",dueDate:""};
const invalidNonRenewal={taskType:"midterm",disposition:"non_renewal",assignmentRequired:true,owner:"",dueDate:""};
const correctionInput={id:"renewal-test-correction",reason:"會員重新確認希望續約",owner:"委員甲",companion:"委員乙",dueDate:"2026-07-25",correctedAt:"2026-07-20T09:00:00.000Z",correctedBy:"vp:副主席甲"};

assert.equal(domain.requiresCareAssignment(review),false);
assert.equal(domain.requiresCareAssignment(legacy),true);
assert.equal(domain.isConfirmedNonRenewal(nonRenewal),true);
assert.equal(domain.isConfirmedNonRenewal(invalidNonRenewal),false);
assert.equal(domain.isValidCareDisposition(nonRenewal),true);
assert.equal(domain.isValidCareDisposition(invalidNonRenewal),false);
assert.equal(domain.isValidCareDisposition({taskType:"renewal",disposition:"unknown"}),false);
assert.equal(domain.isValidCareDisposition({...nonRenewal,decisionAmendments:{}}),false);
assert.equal(domain.requiresCareAssignment(nonRenewal),false);
assert.equal(domain.requiresCareAssignment(invalidNonRenewal),true);
assert.equal(domain.requiresCareAssignment({taskType:"renewal",disposition:"follow_up",assignmentRequired:false}),true);
assert.deepEqual(domain.normalizeCareItem({...nonRenewal,state:"active",owner:"委員甲",companion:"委員乙",dueDate:"2026-07-20",taskDeleted:true,syncMissing:true}),{
  ...nonRenewal,assignmentRequired:false,state:"done",owner:"",companion:"",dueDate:"",taskDeleted:false,syncMissing:false
});
assert.equal(domain.isCareScheduleComplete(review),true);
assert.equal(domain.isCareScheduleComplete(complete),true);
assert.equal(domain.isCareScheduleComplete(nonRenewal),true);
assert.deepEqual(domain.missingCareAssignments([review,actionable,legacy,nonRenewal]),[actionable,legacy]);
assert.equal(domain.hasCareAssignmentConflict([{...review,owner:"導師甲",companion:"導師甲"}]),false);
assert.equal(domain.hasCareAssignmentConflict([{...nonRenewal,owner:"委員甲",companion:"委員甲"}]),false);
assert.equal(domain.hasCareAssignmentConflict([{assignmentRequired:true,owner:"委員甲",companion:"委員甲"}]),true);

const corrected=domain.applyRenewalDecisionCorrection(nonRenewal,correctionInput);
assert.equal(nonRenewal.decisionAmendments,undefined);
assert.equal(corrected.disposition,"non_renewal");
assert.equal(domain.effectiveCareDisposition(corrected),"follow_up");
assert.equal(domain.isConfirmedNonRenewal(corrected),false);
assert.equal(domain.hasRenewalDecisionCorrection(corrected),true);
assert.equal(domain.requiresCareAssignment(corrected),true);
assert.equal(domain.isCareScheduleComplete(corrected),true);
assert.equal(domain.isValidCareDisposition(corrected),true);
assert.deepEqual(domain.latestRenewalDecisionAmendment(corrected),{
  ...correctionInput,type:"renewal_resumed",fromDisposition:"non_renewal",toDisposition:"follow_up"
});
assert.throws(()=>domain.applyRenewalDecisionCorrection(corrected,correctionInput),/目前仍為確認不續約/);
assert.throws(()=>domain.applyRenewalDecisionCorrection(nonRenewal,{...correctionInput,dueDate:"2026-02-30"}),/更正資料缺少/);

console.log("monthly-meeting-domain tests passed");
