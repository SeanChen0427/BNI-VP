const AI_PROVIDERS=["openai","gemini","anthropic"],AI_LABELS={openai:"OpenAI",gemini:"Gemini",anthropic:"Claude"},aiSession=FulianAuth.getSession();
const ai$=selector=>document.querySelector(selector);
const aiIdentity=()=>`${aiSession.role}:${aiSession.name}`;
function setAiBusy(busy){ai$("#saveAiSettings").disabled=busy;AI_PROVIDERS.forEach(provider=>{ai$(`#${provider}ApiKey`).disabled=busy});}
function renderAiStatus(data){
  ai$("#aiOwnerName").textContent=`${aiSession.name}・${aiSession.role==="vp"?"副主席":aiSession.role==="committee"?"會員委員":"Admin"}`;
  ai$("#aiStorageStatus").textContent=data.storage||"個人加密設定";
  ai$("#defaultAiProvider").value=data.defaultProvider||"openai";
  AI_PROVIDERS.forEach(provider=>{
    const status=data.providers?.[provider],node=ai$(`#${provider}Status`),card=document.querySelector(`[data-provider-card="${provider}"]`);
    node.textContent=status?.configured?`已綁定・末四碼 ${status.suffix}`:"尚未綁定";
    node.classList.toggle("ready",Boolean(status?.configured));card.classList.toggle("connected",Boolean(status?.configured));
    document.querySelector(`[data-remove-provider="${provider}"]`).disabled=!status?.configured;
  });
}
async function loadAiSettings(){
  setAiBusy(true);
  try{const response=await fetch(`/api/ai-settings?identity=${encodeURIComponent(aiIdentity())}`,{cache:"no-store"}),data=await response.json();if(!response.ok)throw new Error(data.message||"讀取失敗");renderAiStatus(data)}
  catch(error){ai$("#aiStorageStatus").textContent=`個人金鑰服務未啟動：${error.message}`;AI_PROVIDERS.forEach(provider=>ai$(`#${provider}Status`).textContent="目前無法讀取")}
  finally{setAiBusy(false)}
}
async function saveAiSettings(remove=[]){
  const keys={};AI_PROVIDERS.forEach(provider=>{const value=ai$(`#${provider}ApiKey`).value.trim();if(value)keys[provider]=value});
  setAiBusy(true);
  try{
    const response=await fetch("/api/ai-settings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({identity:aiIdentity(),defaultProvider:ai$("#defaultAiProvider").value,keys,remove})}),data=await response.json();
    if(!response.ok)throw new Error(data.message||"儲存失敗");
    AI_PROVIDERS.forEach(provider=>ai$(`#${provider}ApiKey`).value="");renderAiStatus(data);toast(remove.length?`${AI_LABELS[remove[0]]} 綁定已移除`:"個人 AI 設定已儲存");
  }catch(error){toast(`無法儲存：${error.message}`)}finally{setAiBusy(false)}
}
document.querySelectorAll("[data-toggle-secret]").forEach(button=>button.onclick=()=>{const input=ai$("#"+button.dataset.toggleSecret),show=input.type==="password";input.type=show?"text":"password";button.textContent=show?"隱藏":"顯示"});
document.querySelectorAll("[data-remove-provider]").forEach(button=>button.onclick=()=>{const provider=button.dataset.removeProvider;if(confirm(`確定移除目前登入者的 ${AI_LABELS[provider]} API Key？`))saveAiSettings([provider])});
ai$("#saveAiSettings").onclick=()=>saveAiSettings();
loadAiSettings();
