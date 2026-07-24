let config=FulianAuth.getConfig();
const form=document.querySelector("#loginForm"),username=document.querySelector("#username"),password=document.querySelector("#password"),committeeField=document.querySelector("#committeeField"),committeeName=document.querySelector("#committeeName"),error=document.querySelector("#loginError"),submitButton=form.querySelector('button[type="submit"]');
function renderCommittee(names){
  committeeName.replaceChildren();
  const placeholder=document.createElement("option");
  placeholder.value="";
  placeholder.textContent=names.length?"請選擇姓名":"先驗證帳密以載入名單";
  committeeName.append(placeholder);
  names.forEach(name=>{
    const option=document.createElement("option");
    option.value=name;
    option.textContent=name;
    committeeName.append(option);
  });
}
renderCommittee([]);
function refreshCommittee(){committeeField.hidden=username.value.trim()!==config.accounts.committee.username;}
username.addEventListener("input",refreshCommittee);
const allowedPages=new Set(["index.html","case-board.html","case-workflow.html","case-archive.html","member-care.html","attendance.html","terminal-form.html","midterm-form.html","new-member-form.html","industry-change-form.html","departure-form.html","course.html","settings.html","analysis-review.html","monthly-meeting.html","useful-links.html"]);
function safeNext(value){if(!value)return"index.html";try{const target=new URL(value,location.href),page=target.pathname.split("/").pop();return target.origin===location.origin&&allowedPages.has(page)?`${page}${target.search}${target.hash}`:"index.html"}catch{return"index.html"}}
form.addEventListener("submit",async event=>{
  event.preventDefault();
  error.textContent="";
  submitButton.disabled=true;
  submitButton.textContent="登入中…";
  const result=await FulianAuth.login(username.value.trim(),password.value,committeeName.value);
  if(!result.ok){
    if(result.needsMember&&Array.isArray(result.committee)){
      config=FulianAuth.getConfig();
      renderCommittee(result.committee);
      committeeField.hidden=false;
    }
    error.textContent=result.message;
    refreshCommittee();
    submitButton.disabled=false;
    submitButton.textContent="登入工作台";
    return;
  }
  const params=new URLSearchParams(location.search);
  location.href=safeNext(params.get("next"));
});
if(FulianAuth.validate())location.href="index.html";
else if(new URLSearchParams(location.search).get("reason")==="session-expired")error.textContent="登入已逾時，請重新登入。";
