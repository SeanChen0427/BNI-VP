(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;root.FulianPartnerExportDomain=api})(globalThis,function(){
  function build({columns,rows,meta=[]}){
    if(!columns?.length||columns[0].key!=="name"||!rows?.length)throw new Error("目前沒有可匯出的名單");
    const clean=value=>String(value??"尚無資料").replace(/[\r\n\t]+/g," ");
    const headers=columns.map(c=>({key:c.key,label:c.label+(c.unit?`（${c.unit}）`:"")}));
    const data=rows.map(row=>{if(row.length!==headers.length)throw new Error("匯出欄位與資料不一致");return row.map(clean)});
    const details=meta.map(clean),pages=[];
    // 每張最多 16 位、姓名外 6 欄；跨欄分頁仍保留同一批姓名。
    const groups=[];if(headers.length===1)groups.push([0]);
    for(let c=1;c<headers.length;c+=6)groups.push([0,...headers.slice(c,c+6).map((_,i)=>c+i)]);
    for(let start=0;start<data.length;start+=16)for(const indexes of groups)pages.push({columns:indexes.map(i=>headers[i]),rows:data.slice(start,start+16).map(row=>indexes.map(i=>row[i])),start:start+1,end:Math.min(start+16,data.length)});
    const text=["富聯分會｜夥伴討論名單",...details,"",...data.map((row,i)=>`${i+1}. ${row[0]}${row.slice(1).map((v,j)=>`｜${headers[j+1].label}：${v}`).join("")}`)].join("\n");
    return{title:"富聯分會｜夥伴討論名單",meta:details,columns:headers,rows:data,pages,text};
  }
  return{build};
});
