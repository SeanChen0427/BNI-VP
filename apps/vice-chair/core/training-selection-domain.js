(function(root,factory){
  const api=factory(root.FulianCalendarDomain||(typeof require==="function"?require("./calendar-domain.js"):null));
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.FulianTrainingSelection=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(calendar){
  function snapshot(event){
    if(!event||!Number.isSafeInteger(event.id)||event.id<=0||!event.title||!Number.isFinite(Date.parse(event.start_at))||!Number.isFinite(Date.parse(event.end_at)))return null;
    return {id:event.id,title:String(event.title),start_at:event.start_at,end_at:event.end_at,category:event.category};
  }
  function restore(value,category,date){
    const saved=snapshot(value);
    return saved&&saved.category===category&&calendar.dateInput(saved.start_at)===date?saved:null;
  }
  function options(events,category,now=new Date()){
    return events.filter(event=>event.category===category&&event.source_status==="published"&&Date.parse(event.start_at)>now.getTime())
      .sort((a,b)=>Date.parse(a.start_at)-Date.parse(b.start_at)||a.id-b.id);
  }
  function status(saved,events){
    if(!saved)return {kind:"manual",current:null};
    const current=events.find(event=>event.id===saved.id);
    if(!current||current.source_status!=="published")return {kind:"missing",current};
    const changed=["title","start_at","end_at","category"].some(key=>current[key]!==saved[key]);
    return {kind:changed?"changed":"current",current};
  }
  return Object.freeze({snapshot,restore,options,status});
});
