(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.FulianCalendarDomain=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  function validDate(value){
    const date=value instanceof Date?new Date(value):new Date(value);
    return Number.isNaN(date.getTime())?null:date;
  }
  function dateOnly(value){
    const match=String(value||"").match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(match)return new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
    const date=validDate(value);
    return date?new Date(date.getFullYear(),date.getMonth(),date.getDate()):null;
  }
  function daysUntil(value,now=new Date()){
    const target=dateOnly(value),today=dateOnly(now);
    if(!target||!today)return null;
    const targetUtc=Date.UTC(target.getFullYear(),target.getMonth(),target.getDate());
    const todayUtc=Date.UTC(today.getFullYear(),today.getMonth(),today.getDate());
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
    const date=validDate(value),current=validDate(now);
    return Boolean(date&&current&&date.getFullYear()===current.getFullYear()&&date.getMonth()===current.getMonth());
  }
  function dateInput(now=new Date()){
    const date=validDate(now)||new Date(),z=value=>String(value).padStart(2,"0");
    return`${date.getFullYear()}-${z(date.getMonth()+1)}-${z(date.getDate())}`;
  }
  function defaultVoteDeadline(now=new Date()){
    const date=validDate(now)||new Date();
    date.setDate(date.getDate()+1);
    date.setHours(18,0,0,0);
    return`${dateInput(date)}T18:00`;
  }
  function monthHeading(now=new Date()){
    const date=validDate(now)||new Date();
    return{year:date.getFullYear(),month:date.getMonth()+1,english:new Intl.DateTimeFormat("en-US",{month:"long"}).format(date).toUpperCase()};
  }
  return{daysUntil,countdownLabel,sameMonth,dateInput,defaultVoteDeadline,monthHeading};
});
