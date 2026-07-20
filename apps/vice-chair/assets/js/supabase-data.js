(function(){
  const nativeFetch=window.fetch.bind(window);
  let analysisPromise=null;

  async function rest(path,options={}){
    const response=await FulianAuth.authorizedFetch(`/rest/v1/${path}`,options);
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||data.hint||`Supabase HTTP ${response.status}`);
    return data;
  }
  async function getPublishedAnalysis({refresh=false}={}){
    if(refresh)analysisPromise=null;
    if(!analysisPromise)analysisPromise=rest("analysis_snapshots?is_published=eq.true&select=snapshot&period_end=not.is.null&order=period_end.desc,generated_at.desc&limit=1")
      .then(rows=>{
        if(!rows[0]?.snapshot)throw new Error("Supabase 尚無已發佈的 BNI 分析資料");
        return rows[0].snapshot;
      })
      .catch(error=>{analysisPromise=null;throw error});
    return analysisPromise;
  }
  async function getMemberNames(){
    const rows=await rest("members?status=eq.active&select=people!inner(display_name)&order=created_at.asc");
    return rows.map(row=>row.people?.display_name).filter(Boolean);
  }
  function jsonResponse(data,status=200){
    return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8"}});
  }
  async function onlineApi(input){
    const url=new URL(typeof input==="string"?input:input.url,location.origin);
    try{
      if(url.pathname==="/api/bni-analysis")return jsonResponse(await getPublishedAnalysis({refresh:true}));
      if(url.pathname==="/api/bni-monthly-attendance"){
        const snapshot=await getPublishedAnalysis(),month=url.searchParams.get("month")||"";
        const attendance=snapshot.monthlyAttendance?.[month];
        return attendance?jsonResponse(attendance):jsonResponse({message:`尚未提供 ${month} 單月 PALMS`},503);
      }
    }catch(error){
      return jsonResponse({message:error.message},503);
    }
    return null;
  }
  window.fetch=async function(input,options){
    const url=new URL(typeof input==="string"?input:input.url,location.href);
    if(url.origin===location.origin&&url.pathname.startsWith("/api/")){
      const response=await onlineApi(input);
      if(response)return response;
    }
    return nativeFetch(input,options);
  };
  window.FulianData={rest,getPublishedAnalysis,getMemberNames};
})();
