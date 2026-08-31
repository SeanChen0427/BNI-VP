import test from "node:test";
import assert from "node:assert/strict";
import {enrichPublishedMemberData,hasCompletePublishedMemberData,parseBniDashboard,parsePalmsReport,latestVersionedName,BRIDGE_SCHEMA} from "../bni-bridge.mjs";
import {buildMemberDetails} from "../bni-bridge.mjs";

test("converts dashboard into versioned bridge snapshot",()=>{
  const html=`<h1>會員關懷儀表板</h1><div class="meta">2026-01 – 2026-06</div><div class="sub">現任 44 人</div>
  <div class="stat ok"><div class="n">75%</div><div class="l">綠燈率 33/44</div></div>
  <div class="stat alert"><div class="n">2</div><div class="l">紅燈會員</div></div>
  <section><div class="sec-h"><h2>燈號關懷</h2><span class="badge red">紅燈 2</span><span class="badge gray">黃燈 9</span></div>
  <table><tr><th>會員</th><th>分數</th></tr><tr><td>測試甲</td><td>40</td></tr></table></section>`;
  const result=parseBniDashboard(html);
  assert.equal(result.schema,BRIDGE_SCHEMA);
  assert.equal(result.summary.totalMembers,44);
  assert.equal(result.summary.greenRate,75);
  assert.equal(result.summary.greenCount,33);
  assert.equal(result.summary.yellowCount,9);
  assert.equal(result.summary.redCount,2);
  assert.equal(result.sections[0].tables[0].rows[0][0],"測試甲");
});

test("exposes membership expiry date for AI and forms",()=>{
  const row=cells=>`<Row>${cells.map(([index,value,type="String"])=>`<Cell ss:Index="${index}"><Data ss:Type="${type}">${value}</Data></Cell>`).join("")}</Row>`;
  const palms=`<Workbook><Worksheet><Table>${row([[1,"姓氏"],[2,"名字"]])}${row([[1,"測"],[2,"試甲"],[4,"25","Number"]])}</Table></Worksheet></Workbook>`;
  const expiry=`<Workbook><Worksheet><Table>${row([[2,"測 試甲"],[9,"社交媒體"],[15,"現任"],[18,"2027-06-01T00:00:00.000","DateTime"]])}</Table></Worksheet></Workbook>`;
  const members=buildMemberDetails({palmsXml:palms,expiryXml:expiry,currentMembers:{members:[{name:"測試甲",profession:"社群經營"}]}});
  assert.equal(members[0].expiryDate,"2027-06-01");
  assert.equal(members[0].profession,"社群經營");
});

test("selects the latest versioned BNI source file",()=>{
  assert.equal(
    latestVersionedName(
      ["official-scores-2026-05.md","official-scores.md","official-scores-2026-07.md","official-scores-2026-06.md"],
      /^official-scores-\d{4}-\d{2}\.md$/
    ),
    "official-scores-2026-07.md"
  );
});

test("reads the exact PALMS period and official attendance fields",()=>{
  const row=cells=>`<Row>${cells.map(([index,value,type="String"])=>`<Cell ss:Index="${index}"><Data ss:Type="${type}">${value}</Data></Cell>`).join("")}</Row>`;
  const palms=`<Workbook><Worksheet><Table>
    ${row([[1,"2026-06-01T00:00:00.000","DateTime"],[2,"2026-06-30T00:00:00.000","DateTime"]])}
    ${row([[1,"姓氏"],[2,"名字"],[5,"缺席"],[6,"遲到"],[9,"替代人"]])}
    ${row([[1,"測"],[2,"試乙"],[5,"0","Number"],[6,"0","Number"],[9,"0","Number"]])}
  </Table></Worksheet></Workbook>`;
  const report=parsePalmsReport(palms);
  assert.equal(report.periodStart,"2026-06-01");
  assert.equal(report.periodEnd,"2026-06-30");
  assert.equal(report.members[0].name,"測試乙");
  assert.equal(report.members[0].metrics.absence,0);
  assert.equal(report.members[0].metrics.late,0);
  assert.equal(report.members[0].metrics.substitutes,0);
});

test("published snapshot keeps complete annual PALMS and chapter averages for renewal forms",()=>{
  const raw=(name,givenIn,givenOut,receivedIn,receivedOut,amount)=>({
    name,present:20,absent:1,late:2,medical:0,substitute:3,refGivenInternal:givenIn,refGivenExternal:givenOut,
    refReceivedInternal:receivedIn,refReceivedExternal:receivedOut,visitors:4,oneToOne:30,tyfcb:amount,ceu:12
  });
  const result=enrichPublishedMemberData({
    members:[{name:"測試甲",score:80,profession:"甲業"},{name:"測試乙",score:70,profession:"乙業"}],
    halfReport:{period:{start:"2026-02-01",end:"2026-07-31"},members:[raw("測試甲",5,6,7,8,100000),raw("測試乙",1,2,3,4,200000)]},
    annualReport:{period:{start:"2025-08-01",end:"2026-07-31"},members:[raw("測試甲",10,20,30,40,300000),raw("測試乙",20,30,40,50,500000)]},
    tenureReport:{members:[{name:"測試甲",cumulativeStart:"2025-01-01",recentStart:"2025-10-01"},{name:"測試乙",cumulativeStart:"2025-02-01",recentStart:"2025-02-01"}]}
  });
  assert.equal(result.members[0].activation,"2025-01-01");
  assert.equal(result.members[0].recentActivation,"2025-10-01");
  assert.equal(result.members[0].metrics.receivedOut,8);
  assert.equal(result.members[0].annualMetrics.receivedOut,40);
  assert.equal(result.memberData.averages.givenIn,15);
  assert.equal(result.memberData.averages.receivedOut,45);
  assert.equal(result.memberData.averages.amount,400000);
  assert.equal(hasCompletePublishedMemberData(result),true);
  assert.throws(()=>enrichPublishedMemberData({members:[{name:"缺資料"}],halfReport:{members:[]},annualReport:{members:[]},tenureReport:{members:[]}}),/正式續約資料對帳失敗/);
});

test("published snapshot keeps a PALMS-promoted member while official tenure is pending",()=>{
  const raw=name=>({
    name,present:3,absent:0,late:0,medical:0,substitute:0,refGivenInternal:1,refGivenExternal:0,
    refReceivedInternal:0,refReceivedExternal:0,visitors:0,oneToOne:2,tyfcb:0,ceu:0
  });
  const result=enrichPublishedMemberData({
    members:[{name:"新會員",score:35,profession:"測試業"}],
    halfReport:{period:{start:"2026-03-01",end:"2026-08-31"},members:[raw("新會員")]},
    annualReport:{period:{start:"2025-09-01",end:"2026-08-31"},members:[raw("新會員")]},
    tenureReport:{members:[]},
    pendingOfficialData:[{name:"新會員",missing:["expiry","tenure"],status:"pending-official-sync"}]
  });
  assert.equal(result.members.length,1);
  assert.equal(result.members[0].activation,"");
  assert.equal(result.members[0].recentActivation,"");
  assert.equal(result.members[0].activationStatus,"pending-official-sync");
  assert.deepEqual(result.members[0].officialDataPending,["expiry","tenure"]);
  assert.equal(hasCompletePublishedMemberData(result),true);
});
