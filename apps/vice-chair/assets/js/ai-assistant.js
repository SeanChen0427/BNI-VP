const aiSessionChat=FulianAuth.getSession(),aiChatIdentity=`${aiSessionChat.role}:${aiSessionChat.name}`,AI_CHAT_KEY=`fulian-ai-chat-v1:${aiChatIdentity}`,$ai=s=>document.querySelector(s);
let aiChatSettings=null,aiChatHistory=[];
const providerNames={openai:"GPT／OpenAI",gemini:"Gemini／Google",anthropic:"Claude／Anthropic"};
function saveAiChat(){sessionStorage.setItem(AI_CHAT_KEY,JSON.stringify(aiChatHistory.slice(-12)))}
function escapeAi(value){return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]))}
function cleanAiText(role,text){return role==="assistant"&&window.FulianAiKnowledgeDomain?FulianAiKnowledgeDomain.sanitizeAiAnswer(text):String(text??"").trim()}
function renderAiMessage(role,text,{sources=[],pending=false}={}){
  const displayText=cleanAiText(role,text),article=document.createElement("article");article.className=`ai-message ${role}${pending?" thinking":""}`;article.innerHTML=`<i>${role==="user"?"我":"AI"}</i><div><p>${escapeAi(displayText)}</p>${sources.length?`<div class="ai-source-list"><b>系統資料來源</b>${sources.map(source=>`<span>${escapeAi(source.title)}・${escapeAi(source.path)}</span>`).join("")}</div>`:""}${role==="assistant"&&!pending?`<small>詳細規範請向中心區確認。</small>`:""}</div>`;$ai("#aiChatLog").append(article);$ai("#aiChatLog").scrollTop=$ai("#aiChatLog").scrollHeight;return article;
}
function restoreAiChat(){
  try{aiChatHistory=JSON.parse(sessionStorage.getItem(AI_CHAT_KEY)||"[]")}catch{aiChatHistory=[]}
  aiChatHistory=aiChatHistory.map(message=>({...message,text:cleanAiText(message.role,message.text)})).filter(message=>message.text);saveAiChat();
  aiChatHistory.forEach(message=>renderAiMessage(message.role,message.text,{sources:message.sources||[]}));
}
function setAssistantOpen(open){$ai("#aiAssistant").hidden=!open;$ai("#aiLauncher").hidden=open;$ai("#aiLauncher").setAttribute("aria-expanded",String(open));if(open)setTimeout(()=>$ai("#aiChatInput")?.focus(),80)}
async function loadAiChatSettings(){
  try{
    const response=await fetch(`/api/ai-settings?identity=${encodeURIComponent(aiChatIdentity)}`,{cache:"no-store"}),data=await response.json();if(!response.ok)throw new Error(data.message||"無法讀取 AI 設定");aiChatSettings=data;
    const configured=Object.entries(data.providers||{}).filter(([,status])=>status.configured),select=$ai("#aiChatProvider");select.innerHTML=configured.map(([provider])=>`<option value="${provider}">${providerNames[provider]}</option>`).join("");if(configured.some(([provider])=>provider===data.defaultProvider))select.value=data.defaultProvider;
    $ai("#aiAssistantStatus").textContent=configured.length?`使用 ${providerNames[select.value]}・個人 API 額度`:"尚未綁定 API Key";
    if(!configured.length){$ai("#aiAssistant").classList.add("no-key");$ai("#aiAssistant").insertAdjacentHTML("beforeend",`<div class="ai-no-key"><b>尚未綁定 AI API Key</b><span>先到個人設定綁定 GPT、Gemini 或 Claude，即可開始詢問。</span><a href="settings.html#personalAiSettings">前往個人 AI 設定</a></div>`)}
  }catch(error){$ai("#aiAssistantStatus").textContent=error.message}
}
async function askAi(question){
  const provider=$ai("#aiChatProvider").value;if(!provider)return;
  renderAiMessage("user",question);aiChatHistory.push({role:"user",text:question});saveAiChat();const pending=renderAiMessage("assistant",`正在從系統資料搜尋並使用 ${providerNames[provider]} 整理回答…`,{pending:true});
  $ai("#aiChatSend").disabled=true;
  try{
    const history=aiChatHistory.slice(-7,-1).map(item=>({role:item.role,text:item.text})),response=await fetch("/api/ai-chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({identity:aiChatIdentity,provider,question,history})}),data=await response.json();if(!response.ok)throw new Error(data.message||"AI 回答失敗");
    pending.remove();renderAiMessage("assistant",data.answer,{sources:data.sources||[]});aiChatHistory.push({role:"assistant",text:data.answer,sources:data.sources||[]});saveAiChat();$ai("#aiAssistantStatus").textContent=`${providerNames[provider]}・${data.model}`;
  }catch(error){pending.remove();renderAiMessage("assistant",`目前無法完成回答：${error.message}`)}
  finally{$ai("#aiChatSend").disabled=false}
}
$ai("#aiLauncher").onclick=()=>setAssistantOpen(true);$ai("#aiMinimize").onclick=()=>setAssistantOpen(false);$ai("#aiChatProvider").onchange=event=>$ai("#aiAssistantStatus").textContent=`使用 ${providerNames[event.target.value]}・個人 API 額度`;
$ai("#aiChatForm").onsubmit=event=>{event.preventDefault();const question=$ai("#aiChatInput").value.trim();if(!question)return;$ai("#aiChatInput").value="";askAi(question)};
let aiInputComposing=false;
$ai("#aiChatInput").addEventListener("compositionstart",()=>{aiInputComposing=true});
$ai("#aiChatInput").addEventListener("compositionend",()=>{aiInputComposing=false});
$ai("#aiChatInput").onkeydown=event=>{
  if(event.key!=="Enter"||event.shiftKey)return;
  if(event.isComposing||aiInputComposing||event.keyCode===229)return;
  event.preventDefault();
  $ai("#aiChatForm").requestSubmit();
};
document.querySelectorAll("#aiSuggestions button").forEach(button=>button.onclick=()=>{setAssistantOpen(true);$ai("#aiChatInput").value=button.textContent;$ai("#aiChatForm").requestSubmit()});
restoreAiChat();loadAiChatSettings();
