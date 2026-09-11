(function(root,factory){
  const api=factory(root.FulianCalendarDomain);
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.FulianPartnerDirectoryDomain=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(calendar){
  const columns=Object.freeze([
    {key:"name",label:"夥伴",type:"text"},
    {key:"profession",label:"專業別",type:"text"},
    {key:"expiryDate",label:"會籍到期日",type:"date"},
    {key:"activation",label:"會齡起算日",type:"date"},
    {key:"recentActivation",label:"最近生效日",type:"date"},
    {key:"tenureMonths",label:"本次在會月數",type:"number",unit:"個月"},
    {key:"oneToOne",label:"一對一",type:"number",unit:"次",metric:true},
    {key:"given",label:"提供引薦",type:"number",unit:"筆",metric:true},
    {key:"received",label:"收到引薦",type:"number",unit:"筆",metric:true},
    {key:"visitors",label:"來賓",type:"number",unit:"位",metric:true},
    {key:"education",label:"培訓積分",type:"number",unit:"分",metric:true},
    {key:"amount",label:"成交金額",type:"number",unit:"元",metric:true},
    {key:"attendance",label:"出席",type:"number",unit:"次",metric:true},
    {key:"absence",label:"缺席",type:"number",unit:"次",metric:true},
    {key:"late",label:"遲到",type:"number",unit:"次",metric:true},
    {key:"sick",label:"病假",type:"number",unit:"次",metric:true},
    {key:"substitutes",label:"代理人",type:"number",unit:"次",metric:true},
    {key:"givenIn",label:"提供內部引薦",type:"number",unit:"筆",metric:true},
    {key:"givenOut",label:"提供外部引薦",type:"number",unit:"筆",metric:true},
    {key:"receivedIn",label:"收到內部引薦",type:"number",unit:"筆",metric:true},
    {key:"receivedOut",label:"收到外部引薦",type:"number",unit:"筆",metric:true},
  ].map(Object.freeze));
  const presets=Object.freeze({
    membership:["name","profession","expiryDate","recentActivation","tenureMonths"],
    interaction:["name","profession","oneToOne","given","received","visitors","education","amount"],
    attendance:["name","profession","attendance","absence","late","sick","substitutes"],
    overview:["name","oneToOne","given","received","visitors","education","amount"],
  });
  const normalize=value=>String(value??"").normalize("NFKC").replace(/\s+/gu,"").toLocaleLowerCase("zh-TW");
  const number=value=>typeof value!=="number"&&typeof value!=="string"||value===null||String(value).trim()===""||!Number.isFinite(Number(value))?null:Number(value);
  const date=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&calendar.dateInput(value)?value:null;
  function period(snapshot,mode="half"){
    const value=snapshot.memberData?.[mode.startsWith("month:")?"monthlyMetricsPeriod":mode==="annual"?"annualMetricsPeriod":"metricsPeriod"];
    const start=date(value?.start),end=date(value?.end);
    return start&&end&&start<=end?{start,end}:null;
  }
  function validateSnapshot(snapshot){
    if(snapshot?.schema!=="fulian.bni-analysis.v1"||!Array.isArray(snapshot.members))throw new Error("名錄資料格式不相容，請重新載入或聯絡管理員");
    const names=snapshot.members.map(member=>normalize(member?.name));
    if(names.some(name=>!name)||new Set(names).size!==names.length)throw new Error("名錄姓名缺漏或重複，請先核對資料");
    for(const count of [snapshot.memberData?.count,snapshot.summary?.totalMembers]){
      if(count!=null&&number(count)!==names.length)throw new Error("名錄與快照人數不一致，請先核對資料");
    }
    return snapshot;
  }
  function monthsSince(value,now){
    const start=date(value),end=calendar.dateInput(now);
    if(!start||!end||start>end)return null;
    let months=(Number(end.slice(0,4))-Number(start.slice(0,4)))*12+Number(end.slice(5,7))-Number(start.slice(5,7));
    if(calendar.shiftDateMonths(start,months)>end)months-=1;
    return months;
  }
  function rows(snapshot,mode="half",now=new Date()){
    validateSnapshot(snapshot);
    const hasPeriod=Boolean(period(snapshot,mode));
    return snapshot.members.map(member=>{
      const metrics=hasPeriod?member[mode.startsWith("month:")?"monthlyMetrics":mode==="annual"?"annualMetrics":"metrics"]||{}:{};
      const row={name:String(member.name),profession:String(member.profession||""),expiryDate:date(member.expiryDate),activation:date(member.activation),recentActivation:date(member.recentActivation),tenureMonths:monthsSince(member.recentActivation,now)};
      for(const column of columns.filter(item=>item.metric))row[column.key]=number(metrics[column.key]);
      row.given=row.givenIn===null||row.givenOut===null?null:row.givenIn+row.givenOut;
      row.received=row.receivedIn===null||row.receivedOut===null?null:row.receivedIn+row.receivedOut;
      return row;
    });
  }
  function query(rows,{search="",profession="",selected=[],expiry="all",from="",to="",metric="",min="",max="",sort="expiryDate",direction="asc"}={},now=new Date()){
    const tokens=String(search).trim().split(/\s+/u).filter(Boolean).map(normalize);
    const minValue=number(min),maxValue=number(max),metricValid=columns.some(column=>column.metric&&column.key===metric);
    const selectedNames=new Set(selected.map(normalize));
    const filtered=rows.filter(row=>{
      if(selectedNames.size&&!selectedNames.has(normalize(row.name)))return false;
      if(!tokens.every(token=>normalize(row.name+row.profession).includes(token)))return false;
      if(profession&&row.profession!==profession)return false;
      const days=row.expiryDate?calendar.daysUntil(row.expiryDate,now):null;
      if(expiry==="missing"&&days!==null)return false;
      if(expiry==="past"&&(days===null||days>=0))return false;
      if(expiry==="month"&&(!row.expiryDate||!calendar.sameMonth(row.expiryDate,now)))return false;
      if(["30","90"].includes(expiry)&&(days===null||days<0||days>Number(expiry)))return false;
      if(date(from)&&(!row.expiryDate||row.expiryDate<from))return false;
      if(date(to)&&(!row.expiryDate||row.expiryDate>to))return false;
      if(metricValid&&(minValue!==null||maxValue!==null)){
        if(row[metric]===null||minValue!==null&&row[metric]<minValue||maxValue!==null&&row[metric]>maxValue)return false;
      }
      return true;
    });
    const key=columns.some(column=>column.key===sort)?sort:"expiryDate",sign=direction==="desc"?-1:1;
    return filtered.sort((a,b)=>{
      const left=a[key],right=b[key],missingLeft=left===null||left==="",missingRight=right===null||right==="";
      if(missingLeft!==missingRight)return missingLeft?1:-1;
      const result=missingLeft?0:typeof left==="number"?left-right:String(left).localeCompare(String(right),"zh-Hant",{numeric:true});
      return result*sign||a.name.localeCompare(b.name,"zh-Hant");
    });
  }
  function preferences(value={}){
    const valid=Array.isArray(value?.columns)?value.columns.filter(key=>columns.some(column=>column.key===key)):presets.overview;
    return{period:value?.period==="annual"||/^month:\d{4}-(0[1-9]|1[0-2])$/.test(value?.period)?value.period:"half",columns:["name",...new Set(valid.filter(key=>key!=="name"))],sort:columns.some(column=>column.key===value?.sort)?value.sort:"expiryDate",direction:value?.direction==="desc"?"desc":"asc"};
  }
  function withMonth(snapshot,data,month){
    validateSnapshot(snapshot);
    if(data?.schema!=="fulian.partner-reports.v1"||data.month!==month||data.period?.start!==`${month}-01`||data.period?.end!==calendar.monthEndDate(month)||!Array.isArray(data.members))throw new Error("單月資料期間不相容，請重新載入");
    const names=data.members.map(member=>normalize(member?.name));
    if(names.some(name=>!name)||new Set(names).size!==names.length)throw new Error("單月姓名缺漏或重複，請核對資料");
    const byName=new Map(data.members.map(member=>[normalize(member.name),member.metrics]));
    return{...snapshot,memberData:{...snapshot.memberData,monthlyMetricsPeriod:data.period},members:snapshot.members.map(member=>({...member,monthlyMetrics:byName.get(normalize(member.name))||null}))};
  }
  return{columns,presets,period,rows,query,preferences,validateSnapshot,monthsSince,withMonth};
});
