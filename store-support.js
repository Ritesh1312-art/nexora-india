(()=>{
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalizeUsername=v=>String(v||'').trim().replace(/^https?:\/\/t\.me\//i,'').replace(/^@/,'').replace(/[^A-Za-z0-9_]/g,'');
const supportHtml=(username)=>{
 const u=normalizeUsername(username);
 if(!u)return '';
 return `<section class="nx-support-card" aria-label="Help and Support"><div class="nx-support-icon">💬</div><div class="nx-support-copy"><span>NEED HELP?</span><h2>We’re here to help</h2><p>Having an issue with your order, payment or product? Chat with us directly on Telegram.</p></div><a class="nx-support-btn" href="https://t.me/${encodeURIComponent(u)}" target="_blank" rel="noopener noreferrer">Chat on Telegram <span>→</span></a></section>`;
};
const style=()=>{if(document.getElementById('nx-support-style'))return;const s=document.createElement('style');s.id='nx-support-style';s.textContent=`.nx-support-card{max-width:1180px;margin:28px auto 8px;padding:20px 22px;border:1px solid rgba(17,25,54,.08);border-radius:22px;background:linear-gradient(135deg,#fff,#f5f3ff);box-shadow:0 10px 32px rgba(17,25,54,.08);display:flex;align-items:center;gap:16px}.nx-support-icon{width:48px;height:48px;display:grid;place-items:center;border-radius:15px;background:#111936;color:#fff;font-size:22px;flex:0 0 48px}.nx-support-copy{flex:1;min-width:0}.nx-support-copy span{font-size:11px;font-weight:800;letter-spacing:.12em;color:#6b5ce7}.nx-support-copy h2{margin:3px 0 4px;font-size:20px;color:#111936}.nx-support-copy p{margin:0;color:#667085;font-size:14px;line-height:1.5}.nx-support-btn{display:inline-flex;align-items:center;gap:8px;white-space:nowrap;padding:11px 16px;border-radius:13px;background:#111936;color:#fff!important;text-decoration:none!important;font-weight:800}.nx-support-btn span{font-size:18px}.nx-support-btn:hover{transform:translateY(-1px)}@media(max-width:700px){.nx-support-card{margin:20px 14px 6px;padding:18px;align-items:flex-start;flex-wrap:wrap}.nx-support-copy{flex-basis:calc(100% - 64px)}.nx-support-btn{width:100%;justify-content:center}}`;document.head.appendChild(s)};
async function mount(){
 style();
 let d;try{const r=await fetch('/api/store-settings',{cache:'no-store'});if(!r.ok)return;d=await r.json()}catch{return}
 const html=supportHtml(d?.telegram_username);if(!html)return;
 const add=()=>{const footer=document.querySelector('footer');if(!footer||document.querySelector('.nx-support-card'))return false;footer.insertAdjacentHTML('beforebegin',html);return true};
 if(add())return;
 const observer=new MutationObserver(()=>{if(add())observer.disconnect()});observer.observe(document.body,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),15000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
