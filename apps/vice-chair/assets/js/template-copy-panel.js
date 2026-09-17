(function(root){
  async function mount({getOptions,toast=()=>{}}){
    const panel=document.querySelector("#templateCopyPanel"),button=document.querySelector("#generateTemplateCopy"),notice=document.querySelector("#templateCopyNotice");
    const service=root.FulianArchiveTemplateCopy;
    panel.hidden=true;button.disabled=true;button.onclick=null;
    try{
      const options=await getOptions();
      if(!await service.eligible(options))return;
      panel.hidden=false;
      const prepared=service.prepare(options);
      const description=`原訪談日期：${prepared.date.replace("T"," ")}。${prepared.warnings.join("\n")}`;
      notice.textContent=description;button.disabled=false;
      button.onclick=async()=>{
        button.disabled=true;button.textContent="正在產生副本…";
        try{
          // Re-read the saved file and draft: a workflow case may have changed.
          const latest=await getOptions();
          if(!await service.eligible(latest)){panel.hidden=true;return;}
          const result=await service.generate(latest);
          const url=URL.createObjectURL(result.blob),anchor=document.createElement("a");
          anchor.href=url;anchor.download=result.fileName;anchor.click();
          setTimeout(()=>URL.revokeObjectURL(url),1500);
          notice.textContent=`副本已下載，請核對後再提交中心區。\n${result.warnings.join("\n")}`;
          toast("已下載公版副本，原存檔保留");
        }catch(error){notice.textContent=`副本產生失敗：${error.message}\n${description}`;}
        finally{button.disabled=false;button.textContent="產生中心區公版副本";}
      };
    }catch(error){
      if(panel.hidden)document.querySelector("#wordStatus").textContent+=`；${error.message}`;
      else notice.textContent=error.message;
    }
  }
  root.FulianTemplateCopyPanel=Object.freeze({mount});
})(globalThis);
