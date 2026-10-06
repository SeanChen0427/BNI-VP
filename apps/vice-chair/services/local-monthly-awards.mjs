import {readFile} from "node:fs/promises";
import path from "node:path";
import {createMonthlyAwardsApi} from "./monthly-awards.mjs";

// 本機使用正式鏡像與較新的現役核對，不回退歷史快照名單。
export async function localMonthlyAwards(request,url,context,root){
  let directory,mirror,rosterData,manifest;
  const resolveData=relative=>{
    const resolved=path.resolve(root,relative);
    if(!resolved.startsWith(path.resolve(root,"data")+path.sep))throw new Error("Invalid mirror path");
    return resolved;
  };
  async function load(){
    if(mirror)return;
    try{
      const index=JSON.parse(await readFile(path.join(root,"data/reference/current-production-mirror.json"),"utf8"));
      directory=resolveData(index.directory);
      mirror=JSON.parse(await readFile(path.join(directory,"after.json"),"utf8"));
      manifest=JSON.parse(await readFile(path.join(directory,index.manifest||"mirror-manifest.json"),"utf8"));
      const readback=[...(index.operationalReadbacks||[])].filter(item=>item.verifiedAt>index.verifiedAt).sort((a,b)=>b.verifiedAt.localeCompare(a.verifiedAt))[0];
      rosterData=readback?JSON.parse(await readFile(path.join(resolveData(readback.directory),"after.json"),"utf8")):mirror;
      if(!Array.isArray(mirror.imports)||!Array.isArray(rosterData.members))throw new Error("Missing mirror records");
    }catch{throw Object.assign(new Error("本機正式鏡像或現役核對資料不完整，請先完成鏡像核對"),{status:503});}
  }
  return createMonthlyAwardsApi({
    getImports:async()=>{await load();return mirror.imports;},
    getRoster:async()=>{await load();return rosterData.members.filter(row=>row.status==="active"&&row.people?.status==="active").map(row=>row.people.display_name);},
    downloadReport:async row=>{
      if(!/^[a-zA-Z0-9-]+$/.test(row.id))throw new Error("單月鏡像索引不正確");
      const file=manifest.files?.find(file=>file.storagePath===row.storage_path&&file.sha256===row.sha256);
      if(!file?.local)throw Object.assign(new Error("本機鏡像缺少該月來源，請先完成鏡像核對"),{status:503});
      return readFile(resolveData(file.local));
    },
  })(request,url,context);
}
