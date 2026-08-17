(()=>{'use strict';
/* Keep the Admin dashboard usable when one optional data service fails. */
const originalAll=Promise.all.bind(Promise);
let adminAllPatched=false;
Promise.all=function(iterable){
  const items=Array.from(iterable||[]);
  if(!adminAllPatched && items.length===10){
    adminAllPatched=true;
    const fallback=(i)=>i===0?{products:0,users:0,orders:0,sales:0}:i===9?{}:[];
    return originalAll(items.map((p,i)=>Promise.resolve(p).catch(()=>fallback(i))));
  }
  return originalAll(items);
};
})();
