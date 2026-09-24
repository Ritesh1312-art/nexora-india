(()=>{'use strict';
const ALL=[['footwear','Footwear','CJ'],['kitchen','Kitchen Appliances','CJ'],['clothes','Clothes','CJ'],['fitness','Fitness','CJ'],['pet','Pet','CJ'],['jewellery','Artificial Jewellery','DeoDap'],['daily','Daily Use','DeoDap'],['car','Car Accessories','DeoDap'],['electrical','Electrical Appliances','DeoDap'],['mobile','Mobile Accessories','DeoDap']];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function syncOne(index,cell){
 setCell(cell,'Syncing…','working');
 const r=await fetch('/api/supplier-sync',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action:'sync_category',index})});
 const d=await r.json().catch(()=>({error:'Invalid server response'}));
 if(!r.ok||d.status!=='done'||Number(d.count||0)<=0)throw Error(d.error||`${ALL[index][1]} returned 0 products`);
 setCell(cell,`${Number(d.count)} synced/updated`,'done');
 if(d.warnings?.length)cell.title=d.warnings.join('\n');
 return Number(d.count)
}
function updateSelectionCount(box){
 const checks=[...box.querySelectorAll('[data-sync-check]')];
 const selected=checks.filter(c=>c.checked).length;
 const count=box.querySelector('#syncSelected');
 if(count)count.textContent=`${selected} / ${ALL.length} selected`;
 const all=box.querySelector('#syncSelectAll');
 if(all){all.checked=selected===ALL.length;all.indeterminate=selected>0&&selected<ALL.length}
}
function setCell(cell,text,state){if(!cell)return;const s=cell.querySelector('.sync-status');if(!s)return;s.className=`sync-status ${state}`;s.textContent=text}
async function runSync(){
 const btn=document.querySelector('#syncAll'),box=document.querySelector('#syncMsg');
 if(!btn||!box)return;
 const selected=[...box.querySelectorAll('[data-sync-check]:checked')].map(c=>Number(c.value));
 if(!selected.length){
   const overall=box.querySelector('#syncOverall');
   if(overall)overall.innerHTML='⚠️ <b>No category selected.</b> Tick at least one category to start sync.';
   return;
 }
 btn.disabled=true;
 ALL.forEach(([k])=>setCell(box.querySelector(`[data-sync-key="${k}"]`),'Not selected','skipped'));
 selected.forEach(i=>setCell(box.querySelector(`[data-sync-key="${ALL[i][0]}"]`),'Waiting','pending'));
 const overall=box.querySelector('#syncOverall');
 if(overall)overall.innerHTML=`⏳ Syncing <b>${selected.length}</b> selected categor${selected.length===1?'y':'ies'} only…`;
 let total=0,done=0,failed=0,errors=[];
 for(const i of selected){
   const [key,name]=ALL[i],cell=box.querySelector(`[data-sync-key="${key}"]`);
   try{total+=await syncOne(i,cell);done++}
   catch(e){failed++;setCell(cell,'FAILED','failed');errors.push(`${name}: ${e.message}`)}
 }
 if(overall)overall.innerHTML=`${failed?`⚠️ <b>${failed}</b> categor${failed===1?'y':'ies'} failed. `:'✅ ' }<b>${total}</b> products synced/updated · <b>${done}/${selected.length}</b> selected categor${selected.length===1?'y':'ies'} completed.${errors.length?`<br><small>${errors.map(esc).join('<br>')}</small>`:''}`;
 const totalEl=box.querySelector('#syncTotal');if(totalEl)totalEl.textContent=`${done} / ${selected.length} completed`;
 btn.disabled=false
}
function enhance(){
 const btn=document.querySelector('#syncAll');
 if(!btn||btn.dataset.enhanced==='4'||!document.querySelector('#syncMsg'))return;
 btn.dataset.enhanced='4';
 const fresh=btn.cloneNode(true);btn.replaceWith(fresh);fresh.onclick=runSync;
 const box=document.querySelector('#syncMsg');
 box.innerHTML=`<div class="sync-summary">
 <div class="sync-summary-head"><b>Category sync</b><span id="syncSelected">10 / 10 selected</span></div>
 <div class="sync-actions"><label class="sync-select-all"><input id="syncSelectAll" type="checkbox" checked> <b>Select all</b></label><button type="button" id="syncClear" class="sync-clear">Clear</button><span id="syncTotal">0 / 10 completed</span></div>
 <div class="sync-grid">${ALL.map(([key,name,source],i)=>`<label class="sync-cat" data-sync-key="${key}"><span class="sync-left"><input data-sync-check type="checkbox" value="${i}" checked><span><b>${esc(name)}</b><small>${source}</small></span></span><span class="sync-status pending">Waiting</span></label>`).join('')}</div>
 <div id="syncOverall" class="notice" style="margin-top:10px">Ready — <b>10 categories selected</b>. Untick any category you do not want to sync.</div>
 </div>`;
 const selectAll=box.querySelector('#syncSelectAll');
 selectAll.addEventListener('change',()=>{box.querySelectorAll('[data-sync-check]').forEach(c=>{c.checked=selectAll.checked});updateSelectionCount(box)});
 box.querySelector('#syncClear').addEventListener('click',()=>{box.querySelectorAll('[data-sync-check]').forEach(c=>{c.checked=false});updateSelectionCount(box)});
 box.querySelectorAll('[data-sync-check]').forEach(c=>c.addEventListener('change',()=>updateSelectionCount(box)));
 updateSelectionCount(box);
}
const style=document.createElement('style');
style.textContent='.sync-summary{margin-top:10px}.sync-summary-head,.sync-actions{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px}.sync-actions{justify-content:flex-start;flex-wrap:wrap}.sync-actions #syncTotal{margin-left:auto;color:#667085;font-size:12px}.sync-select-all{display:flex;align-items:center;gap:4px}.sync-clear{border:1px solid #d8deea;background:#fff;border-radius:7px;padding:5px 9px;cursor:pointer}.sync-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.sync-cat{border:1px solid #d8deea;border-radius:10px;padding:9px 10px;display:flex;justify-content:space-between;gap:8px;align-items:center;background:#fff;cursor:pointer}.sync-cat:hover{border-color:#b8c2d3}.sync-left{display:flex;align-items:center;gap:8px;min-width:0}.sync-left input{width:16px;height:16px;flex:0 0 auto}.sync-cat small{display:block;color:#7a8393;font-size:11px;margin-top:2px}.sync-status{font-size:12px;font-weight:700;white-space:nowrap}.sync-status.pending{color:#7a8393}.sync-status.working{color:#6d28d9}.sync-status.done{color:#15803d}.sync-status.failed{color:#dc2626}.sync-status.skipped{color:#98a2b3}@media(max-width:650px){.sync-grid{grid-template-columns:1fr}.sync-actions #syncTotal{margin-left:0;width:100%}}';
document.head.appendChild(style);
new MutationObserver(enhance).observe(document.documentElement,{subtree:true,childList:true});
enhance();
})();