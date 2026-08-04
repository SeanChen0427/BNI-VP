(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.FulianMemberCareDomain=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  function badgeCount(value){
    const match=String(value||"").match(/\d+/);
    return match?Number(match[0]):null;
  }

  function splitLifecycleCards(section={}){
    const cards=Array.isArray(section.cards)?section.cards:[];
    const declaredMidtermCount=badgeCount(section.badges?.[0]);
    if(Number.isInteger(declaredMidtermCount)&&declaredMidtermCount>=0&&declaredMidtermCount<=cards.length){
      return{
        midterm:cards.slice(0,declaredMidtermCount),
        newMembers:cards.slice(declaredMidtermCount),
      };
    }
    const midterm=cards.filter(card=>/滿\s*(?:5|6|7)\s*個月|即將到點/.test(card.detail||""));
    return{midterm,newMembers:cards.filter(card=>!midterm.includes(card))};
  }

  return{badgeCount,splitLifecycleCards};
});
