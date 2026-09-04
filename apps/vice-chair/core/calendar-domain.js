(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.FulianCalendarDomain=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  const TAIPEI_TIME_ZONE="Asia/Taipei";
  const ENGLISH_MONTHS=["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  const z=value=>String(value).padStart(2,"0");
  function localTaipeiMatch(value){
    return String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/);
  }
  function validDate(value){
    if(value===null||value==="")return null;
    if(value instanceof Date){
      const date=new Date(value.getTime());
      return Number.isNaN(date.getTime())?null:date;
    }
    const local=localTaipeiMatch(value);
    if(local){
      const year=Number(local[1]),month=Number(local[2]),day=Number(local[3]),hour=Number(local[4]||0),minute=Number(local[5]||0),second=Number(local[6]||0),millisecond=Number(String(local[7]||"0").padEnd(3,"0"));
      const nominal=new Date(Date.UTC(year,month-1,day,hour,minute,second,millisecond));
      if(nominal.getUTCFullYear()!==year||nominal.getUTCMonth()!==month-1||nominal.getUTCDate()!==day||nominal.getUTCHours()!==hour||nominal.getUTCMinutes()!==minute||nominal.getUTCSeconds()!==second)return null;
      return new Date(nominal.getTime()-8*60*60*1000);
    }
    const date=new Date(value);
    return Number.isNaN(date.getTime())?null:date;
  }
  function taipeiParts(value=new Date()){
    const date=validDate(value);
    if(!date)return null;
    const parts=new Intl.DateTimeFormat("en-CA",{
      timeZone:TAIPEI_TIME_ZONE,
      year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"
    }).formatToParts(date);
    const get=type=>Number(parts.find(part=>part.type===type)?.value||0);
    return{year:get("year"),month:get("month"),day:get("day"),hour:get("hour"),minute:get("minute"),second:get("second")};
  }
  function dateInput(value=new Date()){
    const local=localTaipeiMatch(value);
    if(local)return validDate(value)?`${local[1]}-${local[2]}-${local[3]}`:"";
    const parts=taipeiParts(value);
    return parts?`${parts.year}-${z(parts.month)}-${z(parts.day)}`:"";
  }
  function dateTimeInput(value=new Date()){
    const parts=taipeiParts(value);
    return parts?`${parts.year}-${z(parts.month)}-${z(parts.day)}T${z(parts.hour)}:${z(parts.minute)}`:"";
  }
  function dateStamp(value=new Date()){
    return dateInput(value).replaceAll("-","");
  }
  function shiftDayKey(value,offset=0){
    const match=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})$/),amount=Number(offset);
    if(!match||!Number.isInteger(amount))return"";
    const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),source=new Date(Date.UTC(year,month-1,day));
    if(source.getUTCFullYear()!==year||source.getUTCMonth()!==month-1||source.getUTCDate()!==day)return"";
    const date=new Date(source.getTime()+amount*864e5);
    return`${date.getUTCFullYear()}-${z(date.getUTCMonth()+1)}-${z(date.getUTCDate())}`;
  }
  function dateTimeAfterDays(now=new Date(),days=0,{hour=0,minute=0}={}){
    if(!Number.isInteger(Number(hour))||Number(hour)<0||Number(hour)>23||!Number.isInteger(Number(minute))||Number(minute)<0||Number(minute)>59)return"";
    const shifted=shiftDayKey(dateInput(now),Number(days));
    return shifted?`${shifted}T${z(hour)}:${z(minute)}`:"";
  }
  function formatTaipeiTimestamp(value,{seconds=false,year=false}={}){
    const date=validDate(value);
    if(!date)return"";
    const options={
      timeZone:TAIPEI_TIME_ZONE,
      month:"numeric",
      day:"numeric",
      hour:"2-digit",
      minute:"2-digit",
      hourCycle:"h23"
    };
    if(seconds)options.second="2-digit";
    if(year)options.year="numeric";
    return new Intl.DateTimeFormat("zh-TW",options).format(date).replace(/\s+/gu," ");
  }
  function formatTaipeiDate(value,{year=true,weekday=false}={}){
    const date=validDate(value);
    if(!date)return"";
    const options={timeZone:TAIPEI_TIME_ZONE,month:"numeric",day:"numeric"};
    if(year)options.year="numeric";
    if(weekday)options.weekday="short";
    return new Intl.DateTimeFormat("zh-TW",options).format(date);
  }
  function formatTaipeiTime(value,{seconds=false}={}){
    const date=validDate(value);
    if(!date)return"";
    const options={timeZone:TAIPEI_TIME_ZONE,hour:"2-digit",minute:"2-digit",hourCycle:"h23"};
    if(seconds)options.second="2-digit";
    return new Intl.DateTimeFormat("zh-TW",options).format(date);
  }
  function formatTaipeiWeekday(value){
    const date=validDate(value);
    return date?new Intl.DateTimeFormat("zh-TW",{timeZone:TAIPEI_TIME_ZONE,weekday:"short"}).format(date):"";
  }
  function daysUntil(value,now=new Date()){
    const target=dateInput(value),today=dateInput(now);
    if(!target||!today)return null;
    const parse=day=>{const [year,month,date]=day.split("-").map(Number);return Date.UTC(year,month-1,date)};
    const targetUtc=parse(target),todayUtc=parse(today);
    return Math.round((targetUtc-todayUtc)/864e5);
  }
  function countdownLabel(days){
    if(days===null||!Number.isFinite(days))return"—";
    if(days<0)return`已逾期 ${Math.abs(days)} 天`;
    if(days===0)return"今天截止";
    if(days===1)return"明天截止";
    return`${days} 天`;
  }
  function sameMonth(value,now=new Date()){
    const date=dateInput(value),current=dateInput(now);
    return Boolean(date&&current&&date.slice(0,7)===current.slice(0,7));
  }
  function monthKey(value=new Date()){
    return dateInput(value).slice(0,7);
  }
  function shiftMonthKey(value,offset=0){
    const match=String(value||"").match(/^(\d{4})-(\d{2})$/),amount=Number(offset);
    if(!match||Number(match[2])<1||Number(match[2])>12||!Number.isInteger(amount))return"";
    const date=new Date(Date.UTC(Number(match[1]),Number(match[2])-1+amount,1));
    return`${date.getUTCFullYear()}-${z(date.getUTCMonth()+1)}`;
  }
  function monthEndDate(value){
    const next=shiftMonthKey(value,1);
    if(!next)return"";
    const [year,month]=next.split("-").map(Number),date=new Date(Date.UTC(year,month-1,0));
    return`${date.getUTCFullYear()}-${z(date.getUTCMonth()+1)}-${z(date.getUTCDate())}`;
  }
  function analysisEffectiveOn(periodEnd){
    const reportMonth=String(periodEnd||"").slice(0,7),meetingMonth=shiftMonthKey(reportMonth,1);
    return /^\d{4}-\d{2}-\d{2}$/.test(String(periodEnd||""))&&meetingMonth?`${meetingMonth}-01`:"";
  }
  function monthlyAnalysisCycle(now=new Date()){
    const today=dateInput(now),currentMonth=monthKey(now),activeReportMonth=shiftMonthKey(currentMonth,-1);
    if(!currentMonth||!activeReportMonth)return null;
    const active={reportMonth:activeReportMonth,meetingMonth:currentMonth,effectiveOn:`${currentMonth}-01`,phase:"active"};
    const preparation=today===monthEndDate(currentMonth)?{
      reportMonth:currentMonth,
      meetingMonth:shiftMonthKey(currentMonth,1),
      effectiveOn:`${shiftMonthKey(currentMonth,1)}-01`,
      phase:"preparation"
    }:null;
    return{today,currentMonth,active,preparation};
  }
  function defaultVoteDeadline(now=new Date()){
    return dateTimeAfterDays(now,1,{hour:18,minute:0});
  }
  function monthHeading(now=new Date()){
    const parts=taipeiParts(now);
    return parts?{year:parts.year,month:parts.month,english:ENGLISH_MONTHS[parts.month-1]}:{year:0,month:0,english:""};
  }
  function renewalPalmsPeriod({renewalCount,membershipStart,now=new Date()}={}){
    const currentMonth=monthKey(now),membershipMonth=String(membershipStart||"").slice(0,7),count=String(renewalCount||"");
    if(!currentMonth||!/^\d{4}-\d{2}$/.test(membershipMonth)||!["1","2"].includes(count))return null;
    const endMonth=shiftMonthKey(currentMonth,-1),startMonth=count==="1"?membershipMonth:shiftMonthKey(endMonth,-11);
    if(startMonth>endMonth)return null;
    const [startYear,startNumber]=startMonth.split("-").map(Number),[endYear,endNumber]=endMonth.split("-").map(Number);
    const monthCount=(endYear-startYear)*12+endNumber-startNumber+1;
    return{start:`${startMonth}-01`,end:monthEndDate(endMonth),monthCount,first:count==="1"};
  }
  return{TAIPEI_TIME_ZONE,daysUntil,countdownLabel,sameMonth,dateInput,dateTimeInput,dateStamp,shiftDayKey,dateTimeAfterDays,monthKey,shiftMonthKey,monthEndDate,analysisEffectiveOn,monthlyAnalysisCycle,defaultVoteDeadline,monthHeading,renewalPalmsPeriod,formatTaipeiTimestamp,formatTaipeiDate,formatTaipeiTime,formatTaipeiWeekday,taipeiParts,toInstant:validDate};
});
