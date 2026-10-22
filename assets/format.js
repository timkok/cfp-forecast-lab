export const pct=(v,d=1)=>v==null?'—':`${(v*100).toFixed(d)}%`;
export const pp=(v,d=2)=>v==null?'—':`${v>0?'+':''}${Number(v).toFixed(d)} pp`;
export const fmtCount=v=>Number(v||0).toLocaleString('en-US');
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const scenarioLetter=id=>({A_LEGACY_KEYED:'A',B_LINKED_PRIOR:'B',C_TAU7P5:'C',D_RESUME:'D',E_COLDSTART_TAU7P5_RESUME:'E'})[id]||'?';
export const roundName=r=>({FIRST:'首轮',QUARTER:'八强赛',SEMIFINAL:'半决赛',FINAL:'决赛'})[r]||r;
export const niceDate=iso=>{try{return new Intl.DateTimeFormat('zh-CN',{timeZone:'America/New_York',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso))+' ET'}catch{return iso}};
export const numShort=v=>v==null?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:2});
