/* Nexora-India final login-success guard: never leave the login form visible after a successful sign-in. */
(function(){
  function storeNow(){
    if(!window.session)return false;
    window.__nexoraAuthenticated=true;
    try{ history.replaceState(null,'',location.pathname+location.search+'#/'); }catch(_){ location.hash='#/'; }
    try{ window.refreshNav?.(); }catch(_){ }
    try{
      if(typeof window.renderHome==='function') window.renderHome();
      else window.route?.();
    }catch(e){console.error('Nexora login→store render failed:',e)}
    return true;
  }
  function watchLogin(){
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(storeNow()||tries>=40)clearInterval(timer);
    },100);
  }
  document.addEventListener('click',e=>{
    const el=e.target.closest('#rescueLogin,#submit');
    if(el)watchLogin();
  },true);
  document.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&document.activeElement?.matches('#rescueEmail,#rescuePassword'))watchLogin();
  },true);
  window.addEventListener('load',()=>{
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(window.session){storeNow();clearInterval(timer)}
      if(tries>=30)clearInterval(timer);
    },200);
  });
})();
