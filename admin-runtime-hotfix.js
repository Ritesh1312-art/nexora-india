(()=>{'use strict';
const showError=(message)=>{const dash=document.querySelector('#dash'),login=document.querySelector('#login');if(!dash)return;let box=document.querySelector('#adminRuntimeError');if(!box){box=document.createElement('div');box.id='adminRuntimeError';box.className='notice error';box.style.cssText='margin:16px;white-space:pre-wrap;word-break:break-word';dash.prepend(box)}box.textContent=`Admin panel error: ${message}`;if(login&&!login.hidden)login.hidden=false};
window.addEventListener('error',e=>showError(e.error?.message||e.message||'Unexpected JavaScript error'));
window.addEventListener('unhandledrejection',e=>showError(e.reason?.message||String(e.reason||'Unhandled promise rejection')));
const bootGuard=()=>{const login=document.querySelector('#login'),dash=document.querySelector('#dash');if(!login||!dash)return;if(dash.hidden&&login.hidden){login.hidden=false;showError('Admin interface could not initialize. Please refresh once.')} };
setTimeout(bootGuard,1500);setTimeout(bootGuard,4000);
})();
