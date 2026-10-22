// CFP Forecast Lab V4.6: deterministic queries of frozen V4.5 A-group simulations.
// Browser receives a <1.1 MB bitpacked event/outcome index, NOT full private trajectories.
export const MIN_SAMPLES=500;
export const WARN_SAMPLES=1000;
const MAGIC='CFP46A01';
const z=1.96;
export function decodeConditionIndex(metadata,arrayBuffer){
 const bytes=new Uint8Array(arrayBuffer);
 const header=String.fromCharCode(...bytes.subarray(0,8));
 if(header!==MAGIC)throw new Error('条件索引格式错误');
 const view=new DataView(arrayBuffer);
 const n=view.getUint32(8,true),g=view.getUint32(12,true);
 if(n!==metadata.simulation_count||g!==metadata.games.length||n!==20000)throw new Error('条件索引/研究样本不匹配');
 const bytesPer=Math.ceil(n/8),expected=16+n*3+g*bytesPer;
 if(bytes.byteLength!==expected)throw new Error('条件索引长度校验失败');
 const lookup=new Map(metadata.games.map((x,i)=>[x.id,i]));
 return {bytes,n,bytesPer,offset:16+n*3,games:metadata.games,lookup};
}
export function wilsonHalf(p,n){
 if(n<=0)return Infinity;
 return z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n);
}
export function canDisplayEvent(count,n){
 return n>=MIN_SAMPLES&&wilsonHalf(count/n,n)<=.05;
}
export function queryConditions(index,conditions={}){
 const filters=[];
 for(const [id,decision] of Object.entries(conditions)){
  if(!/^[A-Za-z0-9_]{7,120}$/.test(id)||!['H','A'].includes(decision)||!index.lookup.has(id))throw new Error('不受支持的比赛筛选条件');
  filters.push([index.offset+index.lookup.get(id)*index.bytesPer,decision==='H'?1:0]);
 }
 const b=index.bytes,n=index.n;
 const seedCounts=Array(13).fill(0),recordCounts=Array(13).fill(0);
 let samples=0,cfp=0,bye=0,title=0;
 for(let i=0;i<n;i++){
  let match=true;
  for(const [base,desired] of filters){if(((b[base+(i>>3)]>>(i&7))&1)!==desired){match=false;break}}
  if(!match)continue;
  const p=16+i*3,seed=b[p],ch=b[p+1],wins=b[p+2];
  if(seed>12||ch>1||wins<6||wins>11)throw new Error('条件索引记录范围错误');
  samples++;if(seed)cfp++;if(seed>=1&&seed<=4)bye++;title+=ch;
  seedCounts[seed]++;recordCounts[wins]++;
 }
 const counts={cfp,bye,title};
 const rates=Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,samples?v/samples:null]));
 const valid=samples>=MIN_SAMPLES&&Object.entries(counts).every(([,v])=>canDisplayEvent(v,samples));
 return {n:samples,counts,rates,seedCounts,recordCounts,valid,caution:samples<WARN_SAMPLES,condition_count:filters.length};
}
export function checkPartition(index,id){
 const a=queryConditions(index,{[id]:'H'}),b=queryConditions(index,{[id]:'A'}),all=queryConditions(index);
 for(const k of ['cfp','bye','title'])if(a.counts[k]+b.counts[k]!==all.counts[k])throw Error('partition mismatch '+id+' '+k);
 if(a.n+b.n!==all.n)throw Error('partition n mismatch '+id);
 return {home:a,away:b,all};
}
