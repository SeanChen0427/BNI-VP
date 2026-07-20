(function(){
  const directory={
    members:[],
    has:name=>directory.members.includes(String(name||"").trim()),
    ready:null
  };
  directory.ready=window.FulianData.getMemberNames().then(members=>{
    directory.members.splice(0,directory.members.length,...members);
    return directory.members;
  });
  window.FulianMemberDirectory=directory;
})();
