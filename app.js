const initial = {goal:'A little Alpine escape',target:1000,entries:[]};
const storageKey = 'keep-design-v1'; // Preserve goals and entries from the preview.
function validState(s) {
  return s && typeof s.goal === 'string' && s.goal.trim().length > 0 && s.goal.length <= 50 &&
    Number.isFinite(s.target) && s.target >= 1 && s.target <= 10000000 && Array.isArray(s.entries) &&
    s.entries.every(e => e && (typeof e.id === 'string' || Number.isFinite(e.id)) &&
      typeof e.name === 'string' && e.name.trim().length > 0 && e.name.length <= 70 &&
      Number.isFinite(e.amount) && e.amount >= .01 && e.amount <= 1000000 &&
      typeof e.date === 'string' && Number.isFinite(Date.parse(e.date))) &&
    new Set(s.entries.map(e => e.id)).size === s.entries.length;
}
let state;
let storageBlocked = false;
try {
  const raw = localStorage.getItem(storageKey);
  state = raw === null ? structuredClone(initial) : JSON.parse(raw);
  if (!validState(state)) throw new Error('Invalid saved data');
  localStorage.setItem('keep-storage-check', '1'); localStorage.removeItem('keep-storage-check');
} catch { state=structuredClone(initial); storageBlocked=true; }
const $=s=>document.querySelector(s);
const money=n=>new Intl.NumberFormat('de-CH',{minimumFractionDigits:n%1?2:0,maximumFractionDigits:2}).format(n);
function commit(next) {
  if (storageBlocked) { toast('Storage is unavailable. Your existing data has not been changed.'); return false; }
  try {localStorage.setItem(storageKey,JSON.stringify(next));state=next;return true;}
  catch {$('#storage-error').hidden=false;toast('Could not save. Free some device storage and try again.');return false;}
}
function total(){return Math.round(state.entries.reduce((sum,e)=>sum+e.amount,0)*100)/100}
function entry(e){const row=document.createElement('div');row.className='entry';const icon=document.createElement('span');icon.className='entry-icon';icon.textContent=/coffee|white/i.test(e.name)?'☕':/lunch|dinner/i.test(e.name)?'♨':'↗';const detail=document.createElement('div');detail.className='entry-text';const title=document.createElement('strong');title.textContent=e.name;const date=document.createElement('small');date.textContent=new Date(e.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'})+' · A little win';detail.append(title,date);const amount=document.createElement('span');amount.className='entry-amount';amount.textContent='+ CHF '+money(e.amount);row.append(icon,detail,amount);return row}
function render(){const sum=total();const parts=sum.toFixed(2).split('.');$('#total').textContent=money(Number(parts[0]));$('#cents').textContent='.'+parts[1];$('#goal-name').textContent=state.goal;$('#goal-target').textContent='of CHF '+money(state.target);const pct=Math.min(100,sum/state.target*100);$('#percent').textContent=Math.round(pct)+'%';$('#progress-fill').style.width=pct+'%';$('.progress').setAttribute('aria-valuenow',pct.toFixed(1));$('.goal-bottom span').textContent=sum>=state.target?'You did it. Look at all those little wins.':'Little by little, you’re getting there.';const monday=new Date();monday.setHours(0,0,0,0);monday.setDate(monday.getDate()-(monday.getDay()+6)%7);$('#week-total').textContent='CHF '+money(state.entries.filter(e=>new Date(e.date)>=monday).reduce((s,e)=>s+e.amount,0));$('#recent-list').replaceChildren(...state.entries.slice(0,2).map(entry));$('#history-list').replaceChildren(...state.entries.map(entry));$('#history-total').textContent='CHF '+money(sum);$('#history-count').textContent=state.entries.length+' purchases skipped. A little closer to your goal.';$('#goal-input').value=state.goal;$('#target-input').value=state.target;$('#sheet-goal').textContent=state.goal;}
function tab(name){document.querySelectorAll('.screen').forEach(s=>s.hidden=s.id!==name);document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===name);b.setAttribute('aria-current',b.dataset.tab===name?'page':'false')});}
let toastTimer;
function toast(message,undo){clearTimeout(toastTimer);const el=$('#toast');el.replaceChildren(document.createTextNode(message));if(undo){const b=document.createElement('button');b.textContent='Undo';b.onclick=()=>{undo();el.classList.remove('show')};el.append(b)}el.classList.add('show');toastTimer=setTimeout(()=>el.classList.remove('show'),6500)}
function openAdd(name='',amount=''){$('#purchase-input').value=name;$('#amount-input').value=amount;$('#sheet-goal').textContent=state.goal;$('#add-dialog').showModal();}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>b.dataset.action==='add'?openAdd():tab(b.dataset.action));document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>openAdd(b.dataset.preset,b.dataset.amount));$('.close').onclick=()=>$('#add-dialog').close();
$('#add-form').onsubmit=e=>{e.preventDefault();const name=$('#purchase-input').value.trim(),amount=Math.round(Number($('#amount-input').value)*100)/100;if(!name||!Number.isFinite(amount)||amount<=0||amount>1000000)return;const id=crypto.randomUUID();if(!commit({...state,entries:[{id,name,amount,date:new Date().toISOString()},...state.entries]}))return;render();$('#add-dialog').close();toast('CHF '+money(amount)+' kept. Nice choice.',()=>{if(commit({...state,entries:state.entries.filter(x=>x.id!==id)}))render()})};
$('#goal-form').onsubmit=e=>{e.preventDefault();const name=$('#goal-input').value.trim(),target=Math.round(Number($('#target-input').value)*100)/100;if(!name||!Number.isFinite(target)||target<1||target>10000000)return;if(!commit({...state,goal:name,target}))return;render();tab('home');toast('Your goal is ready. One small skip at a time.')};
$('#export-data').onclick=()=>{
  const name='keep-backup-'+new Date().toISOString().slice(0,10)+'.json';
  // The Android APK saves through the system file picker; its WebView cannot download blob links.
  if(window.KeepAndroid){window.KeepAndroid.saveBackup(name,JSON.stringify({format:'keep-backup',version:1,data:state},null,2));return;}
  const url=URL.createObjectURL(new Blob([JSON.stringify({format:'keep-backup',version:1,data:state},null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
};
$('#import-data').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try {
    if(file.size>5000000)throw new Error();
    const backup=JSON.parse(await file.text());
    if(backup.format!=='keep-backup'||backup.version!==1||!validState(backup.data))throw new Error();
    if(!confirm('Replace your current goal and skips with this backup? Export your current data first if you want to keep it.'))return;
    if(commit(backup.data)){render();toast('Your backup is restored.');}
  } catch {toast('That file is not a valid Keep backup. Nothing was changed.');}
  finally {e.target.value='';}
};
window.addEventListener('storage',e=>{if(e.key!==storageKey)return;try{const next=e.newValue===null?structuredClone(initial):JSON.parse(e.newValue);if(validState(next)){state=next;render();}}catch{}});
render();
if(storageBlocked)$('#storage-error').hidden=false;
