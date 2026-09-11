import {readFile} from "node:fs/promises";
import path from "node:path";
import {createMemberInteractionsApi} from "./member-interactions.mjs";

// 本機只讀明確指定的正式復原鏡像，不以歷史 baseline 冒充最新月份。
export async function localMemberInteractions(request,url,context,root){
  let directory,mirror;
  async function load(){
    if(mirror)return mirror;
    try{
      const index=JSON.parse(await readFile(path.join(root,"data/reference/current-production-mirror.json"),"utf8"));
      directory=path.resolve(root,index.directory);
      if(!directory.startsWith(path.resolve(root,"data")+path.sep))throw new Error("Invalid mirror path");
      mirror=JSON.parse(await readFile(path.join(directory,"after.json"),"utf8"));
      return mirror;
    }catch{throw Object.assign(new Error("本機尚無可讀取的正式復原鏡像，請先完成鏡像核對"),{status:503});}
  }
  return createMemberInteractionsApi({
    getImports:async()=>(await load()).imports,
    getRoster:async()=>{
      const rows=(await load()).snapshots?.[0]?.snapshot?.members;
      if(!Array.isArray(rows))throw Object.assign(new Error("本機鏡像缺少會員名錄"),{status:503});
      return rows.map(member=>member.name);
    },
    downloadReport:async row=>{
      if(!/^[a-zA-Z0-9-]+$/.test(row.id))throw new Error("審計鏡像索引不正確");
      return readFile(path.join(directory,`source-${row.id}.xls`));
    },
  })(request,url,context);
}
