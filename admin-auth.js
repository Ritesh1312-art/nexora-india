(()=>{
  'use strict';
  const qs=new URLSearchParams(location.search);
  if(qs.get('logout')==='1'){
    try{sessionStorage.removeItem('nexora_admin_token')}catch{}
  }
  const originalFetch=window.fetch.bind(window);
  window.fetch=async(input,init={})=>{
    let token='';
    try{token=sessionStorage.getItem('nexora_admin_token')||''}catch{}
    if(!token)return originalFetch(input,init);
    const headers=new Headers(init.headers||{});
    if(!headers.has('Authorization'))headers.set('Authorization','Bearer '+token);
    return originalFetch(input,{...init,headers});
  };
})();
