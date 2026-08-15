(()=>{
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 async function enhance(){
  if(!location.hash.startsWith("#/orders"))return;
  const panels=[...document.querySelectorAll("#app .panel")];
  for(const panel of panels){
   if(panel.dataset.utrEnhanced==="1")continue;
   const badge=panel.querySelector(".badge"),bold=panel.querySelector("b");
   if(!badge||!bold||badge.textContent.trim()!=="PENDING_PAYMENT")continue;
   const orderNumber=bold.textContent.trim();if(!orderNumber)continue;
   panel.dataset.utrEnhanced="1";
   const box=document.createElement("div");box.innerHTML=`<div class="field" style="margin-top:12px"><label>UPI UTR / Reference</label><input class="input utr-input" maxlength="80" placeholder="Enter UTR / reference number"><button class="btn utr-submit" style="margin-top:8px">Submit UTR for verification</button><div class="utr-msg"></div></div>`;panel.appendChild(box.firstElementChild);
   const input=panel.querySelector(".utr-input"),button=panel.querySelector(".utr-submit"),msg=panel.querySelector(".utr-msg");
   button.onclick=async()=>{try{button.disabled=true;msg.innerHTML="Submitting…";const session=(await window.sb?.auth?.getSession?.())?.data?.session;if(!session)throw new Error("Please login again");const r=await fetch("/api/payment",{method:"POST",headers:{"content-type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({order_number:orderNumber,utr:input.value.trim()})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"UTR submission failed");msg.innerHTML=`<div class="notice success">UTR submitted. Payment is awaiting admin verification.</div>`;badge.textContent="PAYMENT_SUBMITTED";input.disabled=true;button.remove();}catch(e){msg.innerHTML=`<div class="notice error">${esc(e.message)}</div>`;button.disabled=false}};
  }
 }
 const mo=new MutationObserver(enhance);mo.observe(document.body,{childList:true,subtree:true});window.addEventListener("hashchange",()=>setTimeout(enhance,50));setTimeout(enhance,300);
})();