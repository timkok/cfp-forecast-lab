import {pct,pp,fmtCount,esc} from './format.js';
import {decodeConditionIndex,queryConditions,canDisplayEvent,MIN_SAMPLES,WARN_SAMPLES,wilsonHalf} from './conditions-logic.mjs';

function section(title,note,html,id=''){return `<section class="section v46-section" ${id?`id="${id}"`:''}><div class="section-heading"><h2>${title}</h2><span>${note}</span></div>${html}</section>`}
const label=(g)=>`${g.away} @ ${g.home}`;
const shortDate=(iso)=>{const d=iso.split('-');return `${Number(d[1])}/${Number(d[2])}`};
const num=(x)=>Number(x).toLocaleString('en-US');
const pFormat=(x)=>x==null?'样本不足':pct(x,1);
const diff=(cond,baseline)=>cond==null?'—':pp((cond-baseline)*100,1);
const checked=(game,decision,filters)=>filters[game]===decision;

export function createConditionalExperience({getResearch,getActiveScenario=()=>'A_LEGACY_KEYED',onUpdate}){
 let meta=null,index=null,error=null,pending=null,filters={},lastHash='';
 const api={
  getMeta:()=>meta,
  getIndex:()=>index,
  getFilters:()=>({...filters}),
  onHashChange(){
   const query=window.location.hash.split('?')[1]||'';
   const raw=new URLSearchParams(query).get('games')||'';
   const next={};
   for(const pair of raw.split(',').slice(0,25)){
    const m=/^([A-Za-z0-9_]{7,120}):(H|A)$/.exec(pair.trim());
    if(m)next[m[1]]=m[2];
   }
   filters=next;lastHash=window.location.hash;
  },
  async load(){
   if(meta&&index)return;
   if(pending)return pending;
   pending=(async()=>{
    const [a,b]=await Promise.all([fetch('./data/v46-conditions-a.json',{cache:'no-cache'}),fetch('./data/v46-conditions-a.bin',{cache:'no-cache'})]);
    if(!a.ok||!b.ok)throw new Error(`HTTP ${a.status}/${b.status}`);
    const j=await a.json();
    if(j.freeze_as_of!==getResearch().meta.forecast_as_of||j.model_version!=='V4.5'||j.model_scenario!=='A_LEGACY_KEYED'||j.simulation_count!==20000)throw new Error('V4.6 索引与 V4.5 原模型基准不一致');
    const idx=decodeConditionIndex(j,await b.arrayBuffer());
    const baseline=queryConditions(idx);
    for(const [k,v] of Object.entries({cfp:j.basis.p_cfp,bye:j.basis.p_bye,title:j.basis.p_title}))if(Math.abs(baseline.rates[k]-v)>1e-12)throw new Error('条件索引基准比例校验失败');
    const research=getResearch().scenarios[0];
    if(Math.abs(research.cfp-baseline.rates.cfp)>1e-12||Math.abs(research.bye-baseline.rates.bye)>1e-12||Math.abs(research.champion-baseline.rates.title)>1e-12)throw new Error('条件索引与主页核心概率不一致');
    meta=j;index=idx;error=null;
   })().catch(e=>{error=String(e);console.error('V4.6 condition index failed',e)}).finally(()=>{pending=null;onUpdate()});
   return pending;
  },
  linkToThisView(){return window.location.href},
  change(gameId,decision){
   if(!meta||!meta.games.some(g=>g.id===gameId))return;
   const next={...filters};
   if(decision===null||next[gameId]===decision)delete next[gameId];
   else next[gameId]=decision;
   const pairs=Object.entries(next).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}:${v}`);
   const q=new URLSearchParams();q.set('snapshot','V46_WEB_A_V45_FROZEN_2c28c7b54dc9');q.set('scenario',getActiveScenario());q.set('focus','whatif');if(pairs.length)q.set('games',pairs.join(','));const hash='#/paths?'+q.toString();
   if(window.location.hash===hash){filters=next;onUpdate()}else window.location.hash=hash;
  },
  handleClick(ev){
   const btn=ev.target.closest('button[data-cx]');if(!btn)return false;
   if(btn.dataset.cx==='clear'){this.clear();return true;}
   if(btn.dataset.cx==='choice'){this.change(btn.dataset.game,btn.dataset.result);return true;}
   if(btn.dataset.cx==='pick'){
    const chosen=document.getElementById('cxGamePicker');if(chosen?.value)this.change(chosen.value,btn.dataset.result);
    return true;
   }
   if(btn.dataset.cx==='share'){
    const link=window.location.href;
    const input=document.getElementById('cxShareUrl');if(input)input.value=link;
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(link).then(()=>{if(btn.isConnected)btn.textContent='已复制分享链接'}).catch(()=>{if(input){input.focus();input.select()}})}else if(input){input.focus();input.select()}
    return true;
   }
   return false;
  },
  clear(){const q=new URLSearchParams({snapshot:'V46_WEB_A_V45_FROZEN_2c28c7b54dc9',scenario:getActiveScenario(),focus:'whatif'});const hash='#/paths?'+q.toString();if(window.location.hash===hash){filters={};onUpdate()}else window.location.hash=hash;},
  choice(g,side,text,css=''){const isSelected=checked(g.id,side,filters);return `<button class="cx-choice ${css} ${isSelected?'selected':''}" data-cx="choice" data-game="${g.id}" data-result="${side}" aria-pressed="${isSelected}" type="button">${esc(text)}</button>`},
  render(activeScenario){
   if(!meta||!index){if(!pending&&!error)this.load();return section('IU 剩余赛程与赛果条件查询','A 基准 · V4.5 冻结研究',`<div class="panel cx-loading" role="status">${error?`条件数据暂时无法加载：${esc(error)}`:'正在读取保存的 V4.5 模拟条件索引（约 1 MB），仅在打开本模块时加载…'}</div>`)}
   const B=meta.basis,iu=meta.iu_games.map(id=>meta.games.find(g=>g.id===id));
   const different=activeScenario!=='A_LEGACY_KEYED';
   const sourceNote=`<p class="section-note">${esc(meta.disclaimers.marginal)} 开球时间未纳入此表；${esc(meta.disclaimers.source)}</p>`;
   const schedule=section('IU 剩余五场比赛','已验证模型文件 · 赛程在冻结时点仍为 SCHEDULED',`<div class="cx-schedule">${iu.map(g=>{
    const h=g.home==='Indiana',opp=h?g.away:g.home,win=h?'H':'A',loss=h?'A':'H',p=h?g.p_home:g.p_away;
    return `<article class="cx-schedule-row"><div class="cx-fixture"><span class="cx-date">${shortDate(g.date)}<small>2026</small></span><div><b>${esc(opp)}</b><small>${h?'HOME · Indiana 主场':'AWAY · Indiana 客场'} · ${esc(g.date)}</small></div></div><div class="cx-win-rate"><strong>${pct(p,1)}</strong><span>IU 单场模型边际胜率</span></div><div class="cx-actions">${this.choice(g,win,'IU 赢')}${this.choice(g,loss,'IU 输')}</div></article>`}).join('')}</div>${sourceNote}`,'schedule');
   const result=queryConditions(index,filters),count=Object.keys(filters).length,display=result.valid;
   const sampleTag=result.n===0?'没有匹配轨迹':result.n<MIN_SAMPLES?'样本不足：不展示概率':result.caution?'样本较少：请查看抽样误差':'符合预设的展示标准';
   const stat=([key,name,base])=>{const countN=result.counts[key],rate=display?result.rates[key]:null;const half=display?wilsonHalf(rate,result.n):null;return `<div class="cx-result-card"><span>${name}</span><b>${pFormat(rate)}</b><small>原基准 ${pct(base,1)}${rate!=null?` · ${diff(rate,base)}`:''}</small><small>${rate!=null?`MC 95% 约 ±${(half*100).toFixed(1)} pp · 命中 ${num(countN)}`:'条件样本低于精度门槛，暂停显示点估计'}</small></div>`};
   const used=Object.entries(filters).map(([id,dec])=>{const g=meta.games.find(g=>g.id===id);return g?`<span class="cx-chip">${esc(label(g))} · ${esc(dec==='H'?g.home:g.away)} 赢 <button type="button" data-cx="choice" data-game="${id}" data-result="${dec}" aria-label="清除 ${esc(label(g))} 的条件">×</button></span>`:''}).join('');
   const seeds=result.seedCounts.map((n,i)=>`<div class="cx-seed-row"><span>${i===0?'未入选':`#${i}`}</span><div class="bar-track"><div class="bar-fill ${i>4?'neutral':''}" style="width:${result.n&&display?(100*n/result.n).toFixed(3):0}%"></div></div><strong>${display?pct(n/result.n,1):'—'}</strong><small>${num(n)} 条</small></div>`).join('');
   const recordRows=meta.records.map(r=>{
    const islow=r.n<MIN_SAMPLES;return `<div class="cx-record-row"><b>${r.wins}-${r.losses}</b><span>${pct(r.n/20000,1)} · ${num(r.n)} 条</span><span>CFP ${islow?'—':pct(r.p_cfp,1)}</span><span>轮空 ${islow?'—':pct(r.p_bye,1)}</span><span>冠军 ${islow?'—':pct(r.p_title,1)}</span></div>`}).join('');
   const favorites=new Set([...meta.iu_games,...meta.highlighted_games]);
   const other=meta.games.filter(g=>!favorites.has(g.id)&&!g.post_selection&&!g.is_projected_fixture).sort((a,b)=>a.date.localeCompare(b.date)||label(a).localeCompare(label(b)));
   const otherSelect=`<details class="details-panel cx-other"><summary>添加其他剩余比赛（${num(other.length)} 场；仅 A 组条件筛选）</summary><p class="section-note">这部分是保存的 2026 冻结赛程，不代表实时最新赛程。比赛按日期排序，选择后指定胜者。</p><div class="cx-add-picker"><label>比赛<select id="cxGamePicker" class="select-control" aria-label="选择其他比赛">${other.map(g=>`<option value="${g.id}">${shortDate(g.date)} · ${esc(label(g))}</option>`).join('')}</select></label><div class="cx-actions"><button type="button" class="cx-choice" data-cx="pick" data-result="H">主队赢</button><button type="button" class="cx-choice" data-cx="pick" data-result="A">客队赢</button></div></div></details>`;
   const share=`<div class="cx-share"><button type="button" data-cx="share" class="cx-share-button">复制条件分享链接</button><input id="cxShareUrl" type="text" readonly value="${esc(window.location.href)}" aria-label="当前条件分享链接"/></div>`;
   const whatif=section('选择比赛结果，看 IU 晋级如何变化','多场筛选 · 同一套 20,000 条真实轨迹',`<div class="cx-whatif"><div class="cx-selection"><div><b>${count?`${count} 场已选择`:'尚未选择赛果'}</b><p>从已有模拟中筛选符合所选结果的赛季。筛选并不改变其他比赛结果，也不是赛果的因果干预。</p></div><button type="button" data-cx="clear" class="cx-clear">清除全部条件</button></div>${count?`<div class="cx-selected">${used}</div>`:''}<div class="cx-n"><div><strong>${num(result.n)}</strong><span>条匹配轨迹 / 20,000</span></div><span class="cx-quality ${display?'ok':'warn'}">${sampleTag}</span></div><div class="cx-result-grid" aria-live="polite">${[['cfp','CFP 入选',B.p_cfp],['bye','首轮轮空',B.p_bye],['title','全国冠军',B.p_title]].map(stat).join('')}</div>${result.caution&&result.n>=MIN_SAMPLES?'<p class="cx-warning">低于 1,000 条轨迹，抽样不确定性偏高，区间只描述蒙特卡洛误差。</p>':''}${display?`<details class="cx-seeds" ${count?'open':''}><summary>查看符合条件时的 IU 种子分布</summary><div class="cx-seeds-list">${seeds}</div><p class="section-note">显示 P(种子｜所选比赛结果)；各行样本占比之和为 100%，不含因果含义。</p></details>`:''}${otherSelect}${share}<p class="section-note">精度门槛：匹配轨迹 ≥ ${num(MIN_SAMPLES)}，且 CFP、轮空、冠军比例各自 Wilson 近似 95% MC 半宽 ≤ 5 个百分点；500–999 条额外提示谨慎。零样本不解释为零概率。页面数据限 A 组，其余情景保留原有研究展示。</p></div>`,'what-if');
   const games=meta.highlighted_games.map(id=>meta.games.find(g=>g.id===id));
   const leverage=section('相关竞争球队：哪些赛果与 IU 晋级有关？','A 基准 · 两组条件概率，不是比赛的因果影响',`<div class="cx-leverage"><div class="cx-standfirst">对每场比赛分别统计“主队获胜”和“客队获胜”时 IU 的 CFP 与轮空概率。仅筛选和 IU 竞争路径有关的球队、两侧样本都 ≥ 1,000 的比赛；微小差距不代表明确的决定性作用。</div>${games.map(g=>{
    const delta=g.cfp.delta_pp,ci=g.cfp.ci95_delta_pp,noise=ci[0]<=0&&ci[1]>=0;
    return `<div class="cx-leverage-row"><div><small>${shortDate(g.date)} · 赛果关联</small><strong>${esc(label(g))}</strong><span>主队赢 ${num(g.n_home)} / 客队赢 ${num(g.n_away)} 条</span></div><div class="cx-leverage-metrics"><span>IU CFP：${pct(g.cfp.p_home_win,1)} / ${pct(g.cfp.p_away_win,1)}</span><b>${pp(delta,1)}</b><small>轮空 ${pct(g.bye.p_home_win,1)} / ${pct(g.bye.p_away_win,1)}<br>MC 95% Δ区间 [${ci.map(v=>pp(v,1)).join('，')}]${noise?' · 包含 0':''}</small></div><div class="cx-actions">${this.choice(g,'H',g.home+' 赢')}${this.choice(g,'A',g.away+' 赢')}</div></div>`}).join('')}</div><p class="section-note">不同比赛的条件样本与模型假设可能相关；上述关联不能相加，也不能据此推导“某场比赛带来的真实概率增量”。差异接近 MC 误差时不应过度解读。所有比赛均使用同一冻结时点和 A 组样本。</p>`,'key-games');
   return `<div class="cx-product-intro"><span class="caps">V4.6 WEB PRODUCT · MODEL V4.5 · FROZEN</span><p>赛程、条件筛选和关键比赛基于 V4.5 已保存的 A 组 20,000 条联合赛季轨迹；只提供历史冻结模型下的条件查询，不重新训练模型。</p>${different?'<p class="inline-alert">当前下方传统 IU Paths 图表正在显示其他情景。上方新增赛程及条件工具只使用 A 组，绝不套用其他情景的模拟结果。</p>':''}</div>${schedule}${whatif}${section('赛季最终常规赛战绩分布','本轮补充轮空与冠军条件率 · 样本量同步展示',`<div class="cx-record-list">${recordRows}</div><p class="section-note">当前已赛 6 胜 1 负，剩余 5 场。每一行按自然发生的完整赛季结果分组；低于 500 条样本的条件率不展示。条件数据来源 A 组，不是对其他情景的估计。</p>`,'season-records')}${leverage}`;
  }
 };
 return api;
}
