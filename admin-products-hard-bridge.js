/* Nexora-India Phase 1 hard bridge. */
(function(){
'use strict';
const isProducts=()=>{const b=document.querySelector('.admin-tabs button[data-tab="products"]');return !!(b&&b.classList.contains('active'));};
const controller=()=>window.nexoraPhase1Products;
let lastRun=0;
function take(){if(!isProducts())return;const c=controller();if(!c||typeof c.refresh!=='function')return;const now=Date.now();if(now-lastRun<250)return;lastRun=now;c.refresh(true)}
document.addEventListener('click',function(e){const b=e.target.closest('.admin-tabs button[data-tab="products"]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();document.querySelectorAll('.admin-tabs button').forEach(x=>x.classList.toggle('active',x===b));setTimeout(take,0)},true);
new MutationObserver(()=>{if(isProducts()){const p=document.querySelector('#adminPanel');if(p&&!p.querySelector('#p1AddProduct'))take()}}).observe(document.body,{childList:true,subtree:true});
setInterval(()=>{if(isProducts()&&!document.querySelector('#p1AddProduct'))take()},500);
})();
