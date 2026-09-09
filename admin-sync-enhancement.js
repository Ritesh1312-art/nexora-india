(()=>{'use strict';
const CJ=[
  ['footwear','Footwear'],
  ['kitchen','Kitchen Appliances'],
  ['clothes','Clothes'],
  ['fitness','Fitness'],
  ['pet','Pet']
];
const DEODAP=[
  ['jewellery','Artificial Jewellery'],
  ['daily','Daily Use'],
  ['car','Car Accessories'],
  ['electrical','Electrical Appliances'],
  ['mobile','Mobile Accessories']
];
const ALL=[...CJ,...DEODAP];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=async body=>{const r=await fetch('/api/admin',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({error:'Invalid server response'}));if(!r.ok){const det=typeof d?.details==='string'?d.details.slice(0,500):'';throw Error((d?.error||'Request failed')+(det?' — '+det:''))}return d};
function enhance(){const btn=document.querySelector('#syncAll');if(!btn||btn.dataset.enhanced==='1')return;if(!document.querySelector('#syncMsg'))return;btn.dataset.enhanced='1';const fresh=btn.cloneNode(true);btn.replaceWith(fresh);fresh.onclick=run;
 const box=document.querySelector('#syncMsg');box.innerHTML=`<div class="sync-summary"><div class="sync-summary-head"><b>Category sync status</b><span id="syncTotal">0 / 10 categories</span></div><div class="sync-grid">${ALL.map(([key,name])=>`<div class="sync-cat" data-sync-key="${key}"><div><b>${esc(name)}</b><small>${CJ.some(x=>x[0]===key)?'CJ':'DeoDap'}</small></div><span class="sync-status pending">Waiting</span></div>`).join('')}</div><div id="syncOverall" class="notice" style="margin-top:10px">Ready — target: up to <b>20 products per category</b>.</div></div>`;
}
async function run(){const btn=document.querySelector('#syncAll'),box=document.querySelector('#syncMsg');if(!btn||!box)return;btn.disabled=true;const cells=new Map(ALL.map(([k])=>[k,box.querySelector(`[data-sync-key="${k}"]`)]));ALL.forEach(([k])=>setCell(cells.get(k),'Waiting','pending'));let total=0,completed=0,errors=[];
 const setOverall=t=>{const e=box.querySelector('#syncOverall');if(e)e.innerHTML=t};
 try{
  for(const [action,label,list] of [['cj_sync','CJ',CJ],['deodap_sync','DeoDap',DEODAP]]){
   let cursor=null;
   for(const [key,name] of list){
    const cell=cells.get(key);setCell(cell,'Syncing…','working');
    try{
      const r=await api({action,...(cursor!=null?{cursor}:{})});
      const n=Number(r.imported||0);total+=n;completed++;
      setCell(cell,`${n} synced/updated`,'done');
      const target=20;
      setOverall(`<b>${label}</b> — <b>${esc(name)}</b>: <b>${n}</b> products synced/updated · Overall <b>${total}</b> products · ${completed}/10 categories complete.`);
      if(r.done){cursor=null;}
      else cursor=r.cursor;
    }catch(e){
      const text=String(e?.message||e);errors.push(`${label} / ${name}: ${text}`);setCell(cell,'FAILED','failed');setOverall(`<b>Sync stopped at ${esc(name)}</b> — ${esc(text)}`);throw e;
    }
   }
  }
  setOverall(`✅ <b>Sync All complete</b> — <b>${total}</b> products synced/updated across <b>10/10 categories</b>. Target was up to <b>20 per category</b>.`);
 }catch(e){
  if(errors.length){const old=box.querySelector('#syncOverall');if(old)old.insertAdjacentHTML('afterend',`<div class="notice error" style="margin-top:8px">${errors.map(esc).join('<br>')}</div>`)}
 }finally{btn.disabled=false}
}
function setCell(cell,text,state){if(!cell)return;const s=cell.querySelector('.sync-status');if(!s)return;s.className=`sync-status ${state}`;s.textContent=text}
const style=document.createElement('style');style.textContent='.sync-summary{margin-top:10px}.sync-summary-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px}.sync-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.sync-cat{border:1px solid #d8deea;border-radius:10px;padding:9px 10px;display:flex;justify-content:space-between;gap:8px;align-items:center;background:#fff}.sync-cat small{display:block;color:#7a8393;font-size:11px;margin-top:2px}.sync-status{font-size:12px;font-weight:700;white-space:nowrap}.sync-status.pending{color:#7a8393}.sync-status.working{color:#6d28d9}.sync-status.done{color:#15803d}.sync-status.failed{color:#dc2626}@media(max-width:650px){.sync-grid{grid-template-columns:1fr}}';document.head.appendChild(style);
new MutationObserver(enhance).observe(document.documentElement,{subtree:true,childList:true});enhance();
})();