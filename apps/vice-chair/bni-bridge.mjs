import {createHash} from "node:crypto";
import {readFile,readdir,stat} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

export const BRIDGE_SCHEMA="fulian.bni-analysis.v1";
const DEFAULT_BNI_ROOT=fileURLToPath(new URL("../bni-analysis/",import.meta.url));

const entities={amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" ",middot:"·",rarr:"→",ge:"≥",le:"≤",times:"×"};
function decodeHtml(value=""){
  return String(value)
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
    .replace(/&([a-z]+);/gi,(all,key)=>entities[key.toLowerCase()]??all);
}
function text(value=""){
  return decodeHtml(String(value)
    .replace(/<br\s*\/?\s*>/gi,"\n")
    .replace(/<[^>]+>/g," "))
    .replace(/[\t\r ]+/g," ")
    .replace(/ *\n */g,"\n")
    .trim();
}
function one(html,pattern){const match=html.match(pattern);return match?text(match[1]):""}
function numberFrom(value){const match=String(value).replace(/,/g,"").match(/-?\d+(?:\.\d+)?/);return match?Number(match[0]):null}
function parseStats(html){
  return [...html.matchAll(/<div class="stat(?:\s+[^"]*)?">\s*<div class="n">([\s\S]*?)<\/div>\s*<div class="l">([\s\S]*?)<\/div>\s*<\/div>/gi)]
    .map(([,value,label])=>({label:text(label),displayValue:text(value),value:numberFrom(text(value))}));
}
function parseTable(tableHtml){
  const rows=[...tableHtml.matchAll(/<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/gi)].map(([,row])=>
    [...row.matchAll(/<(th|td)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map(([,tag,cell])=>({type:tag.toLowerCase(),text:text(cell)}))
  ).filter(row=>row.length);
  if(!rows.length)return null;
  const firstIsHeader=rows[0].some(cell=>cell.type==="th");
  return {
    headers:firstIsHeader?rows[0].map(cell=>cell.text):[],
    rows:(firstIsHeader?rows.slice(1):rows).map(row=>row.map(cell=>cell.text))
  };
}
function parseCards(sectionHtml){
  const cards=[];
  const pattern=/<div class="card(?:\s+[^"]*)?">([\s\S]*?)<div class="action">([\s\S]*?)<\/div>\s*<\/div>/gi;
  for(const match of sectionHtml.matchAll(pattern)){
    const body=match[1],title=one(body,/<div class="t">([\s\S]*?)<\/div>/i),detail=one(body,/<div class="d">([\s\S]*?)<\/div>/i),action=text(match[2]);
    if(title||detail||action)cards.push({title,detail,action});
  }
  return cards;
}
function parseSections(html){
  const sections=[];
  for(const match of html.matchAll(/<section(?:\s[^>]*)?>([\s\S]*?)<\/section>/gi)){
    const body=match[1],title=one(body,/<h2>([\s\S]*?)<\/h2>/i);
    if(!title)continue;
    const badges=[...body.matchAll(/<span class="badge(?:\s+[^"]*)?">([\s\S]*?)<\/span>/gi)].map(([,v])=>text(v)).filter(Boolean);
    const note=one(body,/<div class="sec-note">([\s\S]*?)<\/div>/i);
    const tables=[...body.matchAll(/<table(?:\s[^>]*)?>([\s\S]*?)<\/table>/gi)].map(([,v])=>parseTable(v)).filter(Boolean);
    sections.push({id:`section-${sections.length+1}`,title,badges,note,tables,cards:parseCards(body)});
  }
  return sections;
}
function statValue(stats,keyword){return stats.find(item=>item.label.includes(keyword))?.value??null}
function statDisplay(stats,keyword){return stats.find(item=>item.label.includes(keyword))?.displayValue??""}
function normalizeName(value=""){return String(value).replace(/\s+/g,"").trim()}
function numeric(value){const result=numberFrom(value);return result??0}
function xmlRows(xml){
  return [...String(xml).matchAll(/<Row(?:\s[^>]*)?>([\s\S]*?)<\/Row>/gi)].map(([,body])=>{
    const row=[];let column=0;
    for(const match of body.matchAll(/<Cell([^>]*)>([\s\S]*?)<\/Cell>/gi)){
      const indexed=match[1].match(/(?:ss:)?Index="(\d+)"/i);
      if(indexed)column=Number(indexed[1])-1;
      row[column]=one(match[2],/<Data(?:\s[^>]*)?>([\s\S]*?)<\/Data>/i);
      column+=1;
    }
    return row;
  });
}
function palmsMembers(xml){
  const rows=xmlRows(xml),header=rows.findIndex(row=>row.includes("姓氏")&&row.includes("名字"));
  if(header<0)return[];
  return rows.slice(header+1).map(row=>({
    name:normalizeName(`${row[0]||""}${row[1]||""}`),
    metrics:{attendance:numeric(row[3]),absence:numeric(row[4]),late:numeric(row[5]),sick:numeric(row[6]),substitutes:numeric(row[8]),givenIn:numeric(row[10]),givenOut:numeric(row[11]),receivedIn:numeric(row[13]),receivedOut:numeric(row[14]),visitors:numeric(row[15]),oneToOne:numeric(row[17]),amount:numeric(row[18]),education:numeric(row[19])}
  })).filter(item=>item.name&&!/^(來賓|BNI|總數)$/.test(item.name));
}
export function parsePalmsReport(xml=""){
  const rows=xmlRows(xml),header=rows.findIndex(row=>row.includes("姓氏")&&row.includes("名字"));
  if(header<0)throw new Error("PALMS 報表找不到會員表頭");
  const dates=rows.slice(0,header).flat().map(value=>String(value||"")).filter(value=>/^\d{4}-\d{2}-\d{2}T/.test(value));
  const period=dates.slice(-2).map(value=>value.slice(0,10));
  if(period.length<2)throw new Error("PALMS 報表找不到計算期間");
  return{periodStart:period[0],periodEnd:period[1],members:palmsMembers(xml)};
}
function expiryMembers(xml){
  const map=new Map();
  for(const row of xmlRows(xml)){
    const name=normalizeName(row[1]);
    if(name&&(!row[14]||String(row[14]).includes("現任")))map.set(name,{profession:text(row[8]),expiryDate:String(row[17]||"").slice(0,10)});
  }
  return map;
}
function officialScores(markdown){
  const map=new Map();
  for(const line of String(markdown).split(/\r?\n/)){
    const cells=line.split("|").slice(1,-1).map(value=>value.trim());
    if(!/^\d+$/.test(cells[0]||"")||cells.length<11)continue;
    const score=numeric(cells[10]),name=normalizeName(cells[1]);
    map.set(name,{weeks:numeric(cells[2]),componentScores:{absence:numeric(cells[3]),late:numeric(cells[4]),referrals:numeric(cells[5]),visitors:numeric(cells[6]),oneToOne:numeric(cells[7]),education:numeric(cells[8]),transaction:numeric(cells[9])},score,light:score>=70?"綠燈":score>=50?"黃燈":score>=30?"紅燈":"黑燈"});
  }
  return map;
}
function tenureDates(xml){
  const map=new Map();
  for(const row of xmlRows(xml)){
    const name=normalizeName(`${row[1]||""}${row[3]||""}`),date=String(row[6]||"").slice(0,10);
    if(name&&/^\d{4}-\d{2}-\d{2}$/.test(date))map.set(name,date);
  }
  return map;
}
export const PUBLISHED_FORM_METRIC_KEYS=Object.freeze(["givenIn","givenOut","receivedIn","receivedOut","amount","visitors","oneToOne","late","substitutes","education"]);
function normalizedPalmsMetrics(source={}){
  return{
    attendance:numeric(source.present??source.attendance),absence:numeric(source.absent??source.absence),late:numeric(source.late),sick:numeric(source.medical??source.sick),
    substitutes:numeric(source.substitute??source.substitutes),givenIn:numeric(source.refGivenInternal??source.givenIn),givenOut:numeric(source.refGivenExternal??source.givenOut),
    receivedIn:numeric(source.refReceivedInternal??source.receivedIn),receivedOut:numeric(source.refReceivedExternal??source.receivedOut),visitors:numeric(source.visitors),
    oneToOne:numeric(source.oneToOne),amount:numeric(source.tyfcb??source.amount),education:numeric(source.ceu??source.education)
  };
}
export function averageMetrics(members){
  const count=Math.max(members.length,1);
  return Object.fromEntries(PUBLISHED_FORM_METRIC_KEYS.map(key=>[key,Math.round(members.reduce((sum,item)=>sum+numeric(item.annualMetrics?.[key]),0)/count)]));
}
export function hasCompletePublishedMemberData(snapshot={}){
  const members=Array.isArray(snapshot.members)?snapshot.members:[],averages=snapshot.memberData?.averages;
  const complete=value=>value&&PUBLISHED_FORM_METRIC_KEYS.every(key=>value[key]!==null&&value[key]!==undefined&&value[key]!==""&&Number.isFinite(Number(value[key])));
  return members.length>0&&snapshot.memberData?.count===members.length&&complete(averages)
    &&members.every(member=>member?.name&&/^\d{4}-\d{2}-\d{2}$/.test(String(member.activation||""))&&complete(member.annualMetrics));
}
export function enrichPublishedMemberData({members=[],halfReport={},annualReport={},tenureReport={}}={}){
  const byName=(rows=[])=>new Map(rows.map(item=>[normalizeName(item.name),item]));
  const halfByName=byName(halfReport.members),annualByName=byName(annualReport.members),tenureByName=byName(tenureReport.members);
  const missing=[];
  const enriched=members.map(member=>{
    const name=normalizeName(member.name),half=halfByName.get(name),annual=annualByName.get(name),tenure=tenureByName.get(name);
    const absent=[];
    if(!half)absent.push("半年 PALMS");if(!annual)absent.push("一年 PALMS");if(!tenure?.cumulativeStart)absent.push("會齡");
    if(absent.length){missing.push(`${name}（${absent.join("、")}）`);return null}
    return{...member,name,activation:tenure.cumulativeStart,metrics:normalizedPalmsMetrics(half),annualMetrics:normalizedPalmsMetrics(annual)};
  });
  if(missing.length)throw new Error(`正式續約資料對帳失敗：${missing.join("；")}`);
  const complete=enriched.filter(Boolean);
  return{
    members:complete,
    memberData:{
      count:complete.length,
      averages:averageMetrics(complete),
      metricsPeriod:halfReport.period||null,
      annualMetricsPeriod:annualReport.period||null,
      memberMetricsMode:"formal-palms-read-only"
    }
  };
}

export function latestVersionedName(names,pattern){
  const matched=names.filter(name=>pattern.test(name)).sort((left,right)=>left.localeCompare(right,"en"));
  if(!matched.length)throw new Error("找不到符合版本規則的資料檔");
  return matched.at(-1);
}

async function latestVersionedFile(directory,pattern){
  return path.join(directory,latestVersionedName(await readdir(directory),pattern));
}

export function buildMemberDetails({palmsXml="",expiryXml="",officialScoresMarkdown="",currentMembers=null,annualPalmsXml="",tenureXml=""}={}){
  const expiryMap=expiryMembers(expiryXml),scoreMap=officialScores(officialScoresMarkdown),halfMap=new Map(palmsMembers(palmsXml).map(item=>[item.name,item])),annualMap=new Map(palmsMembers(annualPalmsXml).map(item=>[item.name,item.metrics])),tenureMap=tenureDates(tenureXml);
  const canonical=Array.isArray(currentMembers?.members)?currentMembers.members:[...expiryMap].map(([name,value])=>({name,profession:value.profession}));
  return canonical.map(entry=>{const item=halfMap.get(normalizeName(entry.name));if(!item)return null;const verified=scoreMap.get(item.name),expiry=expiryMap.get(item.name)||{};return{
    ...item,profession:entry.profession||expiry.profession||"",activation:tenureMap.get(item.name)||"",expiryDate:expiry.expiryDate||"",annualMetrics:annualMap.get(item.name)||item.metrics,
    official:verified||null,score:verified?.score??null,light:verified?.light||"待確認"
  }}).filter(Boolean);
}

export function parseBniDashboard(html,{sourcePath="BNI/index.html",sourceModifiedAt=null}={}){
  const stats=parseStats(html),sections=parseSections(html),subheading=one(html,/<div class="sub">([\s\S]*?)<\/div>/i),meta=one(html,/<div class="meta">([\s\S]*?)<\/div>/i);
  const totalMembers=numberFrom(subheading.match(/現任\s*\d+\s*人/)?.[0]||"");
  const greenSection=sections.find(section=>section.title.includes("燈號關懷"));
  const badgeCount=keyword=>numberFrom(greenSection?.badges.find(value=>value.includes(keyword))||"");
  const greenCount=numberFrom(stats.find(item=>item.label.includes("綠燈率"))?.label.match(/\d+\s*\/\s*\d+/)?.[0]||"");
  const redCount=badgeCount("紅燈")??statValue(stats,"紅燈會員")??0,yellowCount=badgeCount("黃燈")??0;
  return {
    schema:BRIDGE_SCHEMA,
    generatedAt:new Date().toISOString(),
    source:{kind:"bni-member-care-dashboard",path:sourcePath,modifiedAt:sourceModifiedAt,fingerprint:createHash("sha256").update(html).digest("hex").slice(0,16)},
    report:{title:one(html,/<h1>([\s\S]*?)<\/h1>/i),meta,subheading},
    summary:{
      totalMembers,
      greenRate:statValue(stats,"綠燈率"),
      greenRateDisplay:statDisplay(stats,"綠燈率"),
      greenCount,
      yellowCount,
      redCount,
      blackCount:Number.isFinite(totalMembers)&&Number.isFinite(greenCount)?Math.max(0,totalMembers-greenCount-yellowCount-redCount):null,
      renewalDue:statValue(stats,"本週續約截止"),
      renewalWarnings:statValue(stats,"續約審查預警"),
      auditObservations:statValue(stats,"審計觀察"),
      openCategoryWarnings:statValue(stats,"行業別開放警示")
    },
    stats,sections
  };
}

export async function buildBniAnalysisSnapshot({bniRoot}={}){
  const root=path.resolve(bniRoot||process.env.BNI_ANALYSIS_ROOT||DEFAULT_BNI_ROOT);
  const sourcePath=path.join(root,"index.html"),referenceDirectory=path.join(root,"data","reference"),archiveDirectory=path.join(root,"data","archive");
  const [scorePath,annualPath]=await Promise.all([
    latestVersionedFile(referenceDirectory,/^official-scores-\d{4}-\d{2}\.md$/),
    latestVersionedFile(archiveDirectory,/^palms_\d{4}-\d{2}_\d{4}-\d{2}_annual\.xls$/)
  ]);
  const [html,info,palmsXml,expiryXml,officialScoresMarkdown,currentMembersText,annualPalmsXml,tenureXml]=await Promise.all([
    readFile(sourcePath,"utf8"),stat(sourcePath),readFile(path.join(root,"data","baseline","palms.xls"),"utf8"),
    readFile(path.join(root,"data","baseline","membership-expiry.xls"),"utf8"),
    readFile(scorePath,"utf8"),
    readFile(path.join(root,"data","reference","current-members.json"),"utf8"),
    readFile(annualPath,"utf8"),
    readFile(path.join(root,"data","baseline","tenure.xls"),"utf8")
  ]);
  const currentMembers=JSON.parse(currentMembersText),snapshot=parseBniDashboard(html,{sourcePath,sourceModifiedAt:info.mtime.toISOString()}),baselineReport=parsePalmsReport(palmsXml);
  snapshot.members=buildMemberDetails({palmsXml,expiryXml,officialScoresMarkdown,currentMembers,annualPalmsXml,tenureXml});
  const expectedNames=new Set((currentMembers.members||[]).map(item=>normalizeName(item.name))),actualNames=new Set(snapshot.members.map(item=>item.name));
  const missing=[...expectedNames].filter(name=>!actualNames.has(name));
  if(missing.length)throw new Error(`會員主檔與 PALMS 對帳失敗：缺少 ${missing.join("、")}`);
  if(snapshot.summary.totalMembers!==null&&snapshot.summary.totalMembers!==snapshot.members.length)throw new Error(`儀表板人數 ${snapshot.summary.totalMembers} 與會員資料 ${snapshot.members.length} 不一致`);
  snapshot.memberData={
    count:snapshot.members.length,
    averages:averageMetrics(snapshot.members),
    scoreSource:path.relative(root,scorePath),
    metricsSource:"data/baseline/palms.xls",
    metricsPeriod:{start:baselineReport.periodStart,end:baselineReport.periodEnd},
    annualMetricsSource:path.relative(root,annualPath),
    memberSource:"data/reference/current-members.json",
    scoreMode:"official-verified-read-only"
  };
  return snapshot;
}
