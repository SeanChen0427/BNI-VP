(function(root,factory){
  const api=factory(root);
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.FulianInterviewTemplate=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(root){
  const encoder=new TextEncoder(),decoder=new TextDecoder();
  function base64Bytes(value){return Uint8Array.from(atob(value),char=>char.charCodeAt(0))}
  function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return(crc^0xffffffff)>>>0}
  // Store-only ZIP: retain every original OOXML part verbatim except document.xml.
  // No parser/serializer can rewrite styles, relationships, header/footer or logo.
  function zipParts(parts,provenance=null){
    const entries=[],directory=[];let offset=0;
    for(const [name,data] of Object.entries(parts)){
      if(!name||name.includes("..")||name.startsWith("/")||name.includes("\\"))throw new Error("模板含無效檔案路徑");
      const filename=encoder.encode(name),crc=crc32(data),local=new Uint8Array(30+filename.length),l=new DataView(local.buffer);
      l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint16(12,33,true);l.setUint32(14,crc,true);l.setUint32(18,data.length,true);l.setUint32(22,data.length,true);l.setUint16(26,filename.length,true);local.set(filename,30);
      const central=new Uint8Array(46+filename.length),c=new DataView(central.buffer);
      c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,filename.length,true);c.setUint32(42,offset,true);central.set(filename,46);
      entries.push(local,data);directory.push(central);offset+=local.length+data.length;
    }
    const comment=encoder.encode(provenance?JSON.stringify(provenance):"");
    if(comment.length>65535)throw new Error("產檔版本標記過長");
    const end=new Uint8Array(22+comment.length),e=new DataView(end.buffer),dirLength=directory.reduce((total,item)=>total+item.length,0);
    e.setUint32(0,0x06054b50,true);e.setUint16(8,directory.length,true);e.setUint16(10,directory.length,true);e.setUint32(12,dirLength,true);e.setUint32(16,offset,true);
    e.setUint16(20,comment.length,true);end.set(comment,22);
    return new Blob([...entries,...directory,end],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
  }
  function escapeXml(value){return String(value).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[char])).replace(/\r?\n/g,'</w:t><w:br/><w:t xml:space="preserve">')}
  function fillPackage(template,values){
    if(!template.parts?.["word/document.xml"]||!template.parts?.["[Content_Types].xml"])throw new Error("中心區模板內容不完整");
    const parts=Object.fromEntries(Object.entries(template.parts).map(([name,data])=>[name,base64Bytes(data)]));
    let xml=decoder.decode(parts["word/document.xml"]),count=0;
    xml=xml.replace(/\{\{([\w.]+)\}\}/g,(_,key)=>{
      if(!Object.hasOwn(values,key))throw new Error(`中心區模板欄位尚未對應：${key}`);
      count++;return escapeXml(values[key]);
    });
    if(!count)throw new Error("中心區模板沒有可填寫欄位");
    parts["word/document.xml"]=encoder.encode(xml);
    return zipParts(parts,{format:"fulian.regional-template.v1",templateId:template.templateId});
  }
  // ZIP comment records provenance without changing any OOXML part or visible layout.
  // This is a format hint, not a signature or an authorization mechanism.
  async function readProvenance(blob){
    if(!blob||blob.size<22)throw new Error("附件不是可辨識的 Word，請使用原保存檔");
    const tail=new Uint8Array(await blob.slice(-65557).arrayBuffer()),view=new DataView(tail.buffer);
    for(let i=tail.length-22;i>=0;i--){
      if(view.getUint32(i,true)!==0x06054b50||i+22+view.getUint16(i+20,true)!==tail.length)continue;
      const comment=decoder.decode(tail.subarray(i+22));
      if(!comment)return null;
      try{const value=JSON.parse(comment);return value?.format==="fulian.regional-template.v1"&&typeof value.templateId==="string"&&value.templateId?value:null}catch{return null}
    }
    throw new Error("無法辨識附件格式，請使用原保存檔");
  }
  async function generate({type,applicant,draft,context={},fetchImpl=root.fetch,cryptoImpl=root.crypto}){
    const domain=root.FulianInterviewTemplateDomain;
    const expected=domain.templateFor(type);
    const fileName=domain.fileName({type,applicant,meetingDate:draft.meetingDate||draft.interviewDate});
    const response=await fetchImpl(`/api/interview-template?type=${encodeURIComponent(type)}`,{cache:"no-store"});
    const data=await response.json();
    if(!response.ok)throw new Error(data.message||"無法取得中心區公版，已停止產生 Word");
    if(typeof data.templateJson!=="string"||data.templateJson.length>2*1024*1024)throw new Error("中心區模板回應無效");
    const digest=Array.from(new Uint8Array(await cryptoImpl.subtle.digest("SHA-256",encoder.encode(data.templateJson))),byte=>byte.toString(16).padStart(2,"0")).join("");
    if(digest!==expected.sha256)throw new Error("中心區模板版本驗證失敗，請更新模板後再試");
    const template=JSON.parse(data.templateJson);
    if(template.templateId!==expected.id||template.schema!==expected.schema||template.sourceSha256!==expected.sourceSha256)throw new Error("中心區模板來源不符，已停止產生 Word");
    return{blob:fillPackage(template,domain.fields(draft,applicant,type,context)),fileName,templateId:template.templateId};
  }
  return Object.freeze({generate,fillPackage,zipParts,readProvenance});
});
