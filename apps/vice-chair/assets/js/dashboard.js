const sidebar=document.querySelector("#sidebar"),scrim=document.querySelector("#scrim"),session=FulianAuth.getSession();
const monthHeading=window.FulianCalendarDomain.monthHeading();
document.querySelector("#monthEyebrow").textContent=`${monthHeading.year} ${monthHeading.english} · MONTHLY COMMAND CENTER`;
document.querySelector("#monthTitle").textContent=`${monthHeading.month}月會員狀態與工作規劃`;
function closeMenu(){sidebar.classList.remove("open");scrim.classList.remove("show")}
document.querySelector("#openMenu").onclick=()=>{sidebar.classList.add("open");scrim.classList.add("show")};
document.querySelector("#closeMenu").onclick=closeMenu;scrim.onclick=closeMenu;
document.body.classList.toggle("committee-mode",session.role==="committee");
document.body.classList.toggle("vp-mode",session.role==="vp");
document.querySelectorAll('a[href="#"].disabled').forEach(link=>link.addEventListener("click",event=>event.preventDefault()));
try{const course=JSON.parse(localStorage.getItem("fulian-vp-course-v2")||"null"),total=course?.totalLessons||0,percent=total?Math.round((course?.done?.length||0)/total*100):0;document.querySelector("#courseProgress").textContent=`${percent}%`;document.querySelector("#courseProgressBar").style.width=`${percent}%`}catch{}
const memberDataButton=document.querySelector("#status .panel-head button");
if(memberDataButton){memberDataButton.textContent="查看完整儀表板 →";memberDataButton.addEventListener("click",()=>location.href="member-care.html")}
async function syncBniSummary(){
  try{
    const response=await fetch("/api/bni-analysis",{cache:"no-store"});if(!response.ok)return;
    const {summary}=await response.json(),total=summary.totalMembers||0,counts=[summary.greenCount,summary.yellowCount,summary.redCount,summary.blackCount];
    const memberMetric=document.querySelector(".metrics article:first-child strong");if(memberMetric)memberMetric.textContent=total;
    const donut=document.querySelector("#status .donut"),donutTotal=donut?.querySelector("strong");if(donutTotal)donutTotal.textContent=total;
    if(donut&&total){const g=counts[0]/total*100,y=(counts[0]+counts[1])/total*100,r=(counts[0]+counts[1]+counts[2])/total*100;donut.style.background=`conic-gradient(var(--green) 0 ${g}%,var(--yellow) ${g}% ${y}%,#c74549 ${y}% ${r}%,#555 ${r}% 100%)`}
    document.querySelectorAll("#status .legend>div").forEach((row,index)=>{const count=counts[index]??0;const strong=row.querySelector("strong"),small=row.querySelector("small");if(strong)strong.textContent=count;if(small)small.textContent=total?`${Math.round(count/total*100)}%`:"—"});
    const note=document.querySelector("#status .panel-note span");if(note)note.textContent=`續約截止 ${summary.renewalDue??0} 件、續約審查預警 ${summary.renewalWarnings??0} 人、審計觀察 ${summary.auditObservations??0} 項。`;
    const badge=document.querySelector(".demo-badge");if(badge)badge.textContent="BNI 已同步";
  }catch{}
}
syncBniSummary();
