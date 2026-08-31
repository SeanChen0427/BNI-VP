(function(){
  const session=FulianAuth.getSession(),list=document.querySelector("#monthlyDataList"),message=document.querySelector("#monthlyDataMessage");
  if(!list||!["vp","admin"].includes(session.role))return;
  const identity=`${session.role}:${session.name}`;
  let current=null;
  const escape=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  function setMessage(text,tone=""){message.textContent=text;message.className=tone}
  function render(data){
    current=data;document.querySelector("#monthlyDataPeriod").textContent=`${data.month} 資料更新・月末可提前驗收，否則每月 1 日自動換期`;
    document.querySelector("#monthlyDataProgress").textContent=`${data.completed}／${data.total}`;
    document.querySelector("#monthlyDataProgressBar").style.width=`${data.total?data.completed/data.total*100:0}%`;
    list.innerHTML=data.items.map(item=>`<article class="monthly-data-item ${item.complete?"complete":""}" data-type="${item.type}">
      <header><b>${escape(item.label)}</b><span class="data-badge">${item.complete?"已完成":"待上傳"}</span></header>
      <p>${escape(item.period)}</p><small>${escape(item.detail)}</small>
      <button type="button">${item.complete?"更新檔案":"選擇檔案上傳"}</button>
      <input type="file" accept="${item.accept}" ${item.multiple?"multiple":""} hidden>
    </article>`).join("");
    list.querySelectorAll(".monthly-data-item").forEach(card=>{
      const input=card.querySelector("input"),button=card.querySelector("button");
      button.onclick=()=>input.click();input.onchange=()=>upload(card.dataset.type,[...input.files],button);
    });
    window.dispatchEvent(new CustomEvent("fulian:monthly-data-status",{detail:data}));
  }
  async function load(){
    setMessage("正在核對 Supabase 私人報表…");try{
      const response=await fetch(`/api/monthly-data?identity=${encodeURIComponent(identity)}`,{cache:"no-store"}),data=await response.json();
      if(!response.ok)throw new Error(data.message||`HTTP ${response.status}`);render(data);setMessage(data.completed===data.total?"本月四類資料均已完成。":"尚有資料待上傳，完成後系統會自動驗證並入檔。",data.completed===data.total?"success":"");
    }catch(error){list.innerHTML=`<div class="monthly-data-loading">無法讀取資料狀態</div>`;setMessage(error.message,"error")}
  }
  function base64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");reader.onerror=()=>reject(new Error(`無法讀取 ${file.name}`));reader.readAsDataURL(file)})}
  async function upload(type,files,button){
    if(!files.length)return;button.disabled=true;setMessage(`正在驗證並上傳 ${files.length} 份檔案…`);
    try{
      const payload={identity,type,files:await Promise.all(files.map(async file=>({name:file.name,dataBase64:await base64(file)})))};
      const response=await fetch("/api/monthly-data",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)}),data=await response.json();
      if(!response.ok)throw new Error(data.message||`HTTP ${response.status}`);render(data.status);setMessage(data.message,"success");
    }catch(error){setMessage(error.message,"error")}finally{button.disabled=false}
  }
  document.querySelector("#monthlyDataRefresh").onclick=load;
  load();
})();
