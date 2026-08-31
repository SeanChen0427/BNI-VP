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
    if(!analysisPromise)analysisPromise=edgeApi(new URL("/api/analysis-snapshot",location.origin),{cache:"no-store"})
      .then(async response=>{
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.message||`Supabase HTTP ${response.status}`);
        return data;
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
  function currentIdentity(){
    const session=FulianAuth.getSession();
    return session?`${session.role}:${session.name}`:"";
  }
  async function edgeApi(url,options={}){
    const identity=currentIdentity();
    const edgeUrl=new URL(`/functions/v1/app-api${url.pathname}${url.search}`,location.origin);
    if(!edgeUrl.searchParams.has("identity"))edgeUrl.searchParams.set("identity",identity);
    const requestOptions={...options};
    if(requestOptions.body&&typeof requestOptions.body==="string"){
      try{
        const body=JSON.parse(requestOptions.body);
        if(!body.identity)body.identity=identity;
        requestOptions.body=JSON.stringify(body);
      }catch{ /* 非 JSON 請求維持原內容 */ }
    }
    return FulianAuth.authorizedFetch(`${edgeUrl.pathname}${edgeUrl.search}`,requestOptions);
  }
  async function onlineApi(input,options={}){
    const url=new URL(typeof input==="string"?input:input.url,location.origin);
    try{
      if(url.pathname==="/api/bni-analysis")return jsonResponse(await getPublishedAnalysis({refresh:true}));
      if(url.pathname==="/api/bni-monthly-attendance"){
        const month=url.searchParams.get("month")||"";
        const rows=await rest(`monthly_attendance_summaries?month=eq.${encodeURIComponent(month)}-01&select=summary&limit=1`);
        if(rows[0]?.summary)return jsonResponse(rows[0].summary);
        const snapshot=await getPublishedAnalysis();
        const legacy=snapshot.monthlyAttendance?.[month];
        return legacy?jsonResponse(legacy):jsonResponse({message:`尚未提供 ${month} 單月 PALMS`},503);
      }
      return edgeApi(url,options);
    }catch(error){
      return jsonResponse({message:error.message},503);
    }
  }
  window.fetch=async function(input,options){
    const url=new URL(typeof input==="string"?input:input.url,location.href);
    if(url.origin===location.origin&&url.pathname.startsWith("/api/")){
      const response=await onlineApi(input,options);
      if(response)return response;
    }
    return nativeFetch(input,options);
  };
  window.FulianData={rest,getPublishedAnalysis,getMemberNames};
})();
