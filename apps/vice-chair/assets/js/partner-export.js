(function(){
  const $=selector=>document.querySelector(selector);
  let model=null,index=0,canvas=null;
  function lines(ctx,text,width){const result=[];let line="";for(const char of String(text)){if(line&&ctx.measureText(line+char).width>width){result.push(line);line=""}line+=char}result.push(line);return result}
  function draw(){
    const page=model.pages[index],width=Math.max(800,page.columns.length*175+64),pad=32,cellWidth=(width-pad*2)/page.columns.length;
    const c=document.createElement("canvas"),ctx=c.getContext("2d");
    const font=size=>`${size}px -apple-system, BlinkMacSystemFont, 'PingFang TC', 'Microsoft JhengHei', sans-serif`;
    ctx.font=font(20);const meta=model.meta.flatMap(text=>lines(ctx,text,width-pad*2));
    ctx.font=font(21);const headers=page.columns.map(col=>lines(ctx,col.label,cellWidth-24));
    const rowLines=page.rows.map(row=>row.map(value=>lines(ctx,value,cellWidth-24)));
    const headerHeight=Math.max(...headers.map(x=>x.length))*29+24,rowHeights=rowLines.map(row=>Math.max(...row.map(x=>x.length))*29+22);
    const tableTop=96+meta.length*28+30,height=tableTop+headerHeight+rowHeights.reduce((sum,n)=>sum+n,0)+68;
    c.width=width*2;c.height=height*2;ctx.scale(2,2);ctx.fillStyle="#fff";ctx.fillRect(0,0,width,height);ctx.fillStyle="#991b1f";ctx.fillRect(0,0,width,8);ctx.font=font(30);ctx.fillText(model.title,pad,56);
    ctx.fillStyle="#555a64";ctx.font=font(20);meta.forEach((line,i)=>ctx.fillText(line,pad,96+i*28));
    let y=tableTop;ctx.fillStyle="#f4e8e9";ctx.fillRect(pad,y,width-pad*2,headerHeight);ctx.font=font(21);ctx.fillStyle="#742024";
    headers.forEach((text,col)=>text.forEach((line,i)=>ctx.fillText(line,pad+col*cellWidth+12,y+30+i*29)));y+=headerHeight;
    rowLines.forEach((row,r)=>{ctx.fillStyle=r%2?"#f7f7f5":"#fff";ctx.fillRect(pad,y,width-pad*2,rowHeights[r]);ctx.fillStyle="#25262b";ctx.font=font(21);row.forEach((text,col)=>text.forEach((line,i)=>ctx.fillText(line,pad+col*cellWidth+12,y+29+i*29)));ctx.strokeStyle="#dededb";ctx.beginPath();ctx.moveTo(pad,y+rowHeights[r]);ctx.lineTo(width-pad,y+rowHeights[r]);ctx.stroke();y+=rowHeights[r]});
    ctx.fillStyle="#646872";ctx.font=font(18);ctx.fillText(`第 ${index+1}／${model.pages.length} 頁 · 第 ${page.start}–${page.end} 位／共 ${model.rows.length} 位`,pad,height-26);
    c.setAttribute("aria-label",`名單圖片預覽，第 ${index+1} 頁`);c.setAttribute("role","img");canvas=c;$("#exportPreview").replaceChildren(c);$("#exportPage").textContent=`${index+1}／${model.pages.length} 頁`;
    $("#prevExport").disabled=index===0;$("#nextExport").disabled=index===model.pages.length-1;
  }
  $("#prevExport").onclick=()=>{if(index>0){index--;draw()}};$("#nextExport").onclick=()=>{if(index<model.pages.length-1){index++;draw()}};
  $("#downloadExport").onclick=()=>{const page=index+1;canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`富聯夥伴名單_${page}-${model.pages.length}.png`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)},"image/png")};
  $("#closeExport").onclick=()=>$("#exportDialog").close();
  window.FulianPartnerExport={show(value){model=value;index=0;draw();$("#exportDialog").showModal()}};
})();
