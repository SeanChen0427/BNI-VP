import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const form=read('assets/js/renewal-form.js'),interview=read('terminal-form.html'),assessment=read('renewal-assessment.html');
test('續約兩頁綁定相同案件，正式會員與角色核對後才顯示，不顯示第一位會員作替代',()=>{
 assert.match(form,/find\(t=>t.id===taskId&&t.type==='renewal'\)/);assert.match(form,/只有副主席或本案受指派委員/);
 assert.match(form,/member=data.members\?\.find\(m=>m.name===task.member\)/);assert.match(form,/if\(!member\|\|!member.activation\|\|!member.recentActivation\)/);
 assert.match(form,/task.member===session.name/);assert.match(form,/申請人本人須迴避/);
 for(const html of [interview,assessment])assert.match(html,/<form[^>]+id="renewalForm"[^>]*hidden/);
});
test('共同訪談只呈現會員題目，內部評估及地基在第二頁，輸出採兩份指定公版',()=>{
 assert.match(interview,/data-renewal-part="interview"/);assert.doesNotMatch(interview,/renewalFoundationPanel|renewal-foundation-interview.js/);
 assert.match(assessment,/data-renewal-part="assessment"/);assert.match(assessment,/renewalFoundationPanel/);
 assert.match(form,/if\(internal\)renderAssessment\(\);else/);assert.match(form,/type:internal\?'renewal-assessment':'renewal'/);
 assert.match(form,/documentKind:kind/);assert.match(form,/domain.renewalDocumentsReady\(docs\)/);
});
test('沿用精確 PALMS 期間，缺少正式數據阻止完成；重繪後保留草稿，不臆測收到金額',()=>{
 assert.match(form,/calendar.renewalPalmsPeriod\(/);assert.match(form,/cycle==='1'\?'1':'2'/);
 assert.match(form,/data.period\?\.start!==p.start\|\|data.period\?\.end!==p.end/);assert.match(form,/Number.isFinite\(data.member.metrics\?\.\[k\]\)/);
 assert.match(form,/renderMetrics\(\)[\s\S]*?restore\(\)/);assert.match(form,/if\(!matches\(\)\)out.push/);
 assert.match(form,/收到的 TYFCB 金額（由會員確認；無來源時可留白）/);
 assert.match(form,/const missingFields=missing\(\);if\(missingFields.length\)/);
 assert.match(form,/await saveDraft\(\);[\s\S]*?FulianInterviewTemplate.generate[\s\S]*?saveGeneratedWord/);
 assert.doesNotMatch(form,/new Document\(|Packer.toBlob|\.slice\(0,\s*\d+\).*Answer/);
});
