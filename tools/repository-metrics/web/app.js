const $ = selector => document.querySelector(selector);
const parameters = new URLSearchParams(location.search);
const names = Object.keys(manifest);
const initialRepo = names.find(r=>r===parameters.get("repo") || nameOf(r)===parameters.get("repo"));
function choice(name, options, initial) {
  const value=parameters.get(name);
  return options.includes(value)?value:initial;
}
const requestedMetrics=[...new Set((parameters.get("metrics")??"clones,views").split(","))].filter(id=>Object.hasOwn(metrics,id));
const state={
  repo:parameters.get("repo")==="compare"?"compare":initialRepo??names[0],
  selected:requestedMetrics.length?requestedMetrics:["clones","views"],
  range:choice("range",["7","14","30","90","all","custom"],"14"),
  from:parameters.get("from"),to:parameters.get("to"),
  grain:choice("grain",["day","week","month"],"day"),
  layout:choice("layout",["overlay","split"],"overlay"),
  scale:choice("scale",["value","relative"],"value"),
  tab:choice("tab",Object.keys(tabs),"referrers"),
  snapshot:parameters.get("snapshot"),page:0
};
if(state.range==="custom" && (!validDate(state.from)||!validDate(state.to)||state.from>state.to)) {
  state.range="14";
}
const cache=new Map();
let repos=[], figures=[], result={dates:[],series:[]}, exportStart="",exportEnd="", requestVersion=0;
const perPage=8;
const presets={流量:["clones","views"],独立人数:["cloners","visitors"],关注:["stars","forks","watchers"],协作:["issueOpened","prOpened","prMerged"],自动化:["runs","success","failure"]};

function writeUrl() {
  const query=new URLSearchParams();
  query.set("repo",state.repo==="compare"?"compare":nameOf(state.repo));
  query.set("metrics",state.selected.join(","));
  query.set("range",state.range);
  if(state.range==="custom") {
    query.set("from",state.from);
    query.set("to",state.to);
  }
  if(state.layout!=="overlay") {
    query.set("layout",state.layout);
  }
  if(state.grain!=="day") {
    query.set("grain",state.grain);
  }
  if(state.scale!=="value") {
    query.set("scale",state.scale);
  }
  if(state.tab!=="referrers") {
    query.set("tab",state.tab);
  }
  if(state.snapshot && state.snapshot!==$("#rank-date").options[0]?.value) {
    query.set("snapshot",state.snapshot);
  }
  history.replaceState(null,"",location.pathname+"?"+query+location.hash);
}

function durationText(start,end) {
  return start===end?fullDate(start):fullDate(start)+" – "+(start.slice(0,7)===end.slice(0,7)?Number(end.slice(8))+"日":fullDate(end));
}
function chips() {
  $("#repo-tabs").innerHTML=[...names,"compare"].map(r=>'<button type="button" aria-pressed="'+(state.repo===r)+'" data-repo="'+esc(r)+'">'+esc(r==="compare"?"对比仓库":nameOf(r))+'</button>').join("");
}
async function dataset(repository) {
  if(cache.has(repository)) {
    return cache.get(repository);
  }
  const res=await fetch(manifest[repository]);
  if(!res.ok) {
    throw new Error("无法读取仓库统计");
  }
  const data=await res.json();
  if(data.repository!==repository) {
    throw new Error("统计文件与仓库不匹配");
  }
  cache.set(repository,data);
  return data;
}
async function loadRepo() {
  const version=++requestVersion;
  chips();
  $("#load-error").hidden=true;
  $("#workspace").hidden=true;
  $("#overview-period").textContent="正在读取仓库数据…";
  $("#hero-stats").replaceChildren();
  try {
    const selected=state.repo==="compare"?names:[state.repo];
    const loaded=await Promise.all(selected.map(dataset));
    if(version!==requestVersion) {
      return;
    }
    repos=loaded;
    $("#workspace").hidden=false;
    overview();
    renderPicker();
    trend();
    updateDetails();
    writeUrl();
  } catch (error) {
    if(version!==requestVersion) {
      return;
    }
    $("#overview-period").textContent="仓库统计加载失败";
    $("#load-error").hidden=false;
    $("#load-error").innerHTML='无法加载仓库数据。 <button type="button" class="outline-button" id="retry">重试</button>';
    $("#retry").addEventListener("click",loadRepo);
  }
}

function spark(repo,id,first,last) {
  if(!first||!last) {
    return "";
  }
  const numbers=[];
  for(let t=dayTime(first);t<=dayTime(last);t+=dayMs) {
    numbers.push(repo.days[isoDay(t)]?.[id]??null);
  }
  const seen=numbers.filter(v=>v!==null);
  if(!seen.length) {
    return "";
  }
  const min=Math.min(...seen),max=Math.max(...seen);
  const points=numbers.map((v,i)=>v==null?null:[2+66*i/Math.max(1,numbers.length-1),max===min?13:23-(v-min)/(max-min)*20]);
  return '<svg class="spark" viewBox="0 0 70 26" aria-hidden="true">'+curves(points).map(group=>'<path d="'+linePath(group)+'" fill="none" stroke="'+(id.startsWith("clon")?"#bdadff":"#78dfc9")+'" stroke-width="1.8" stroke-linecap="round"/>').join("")+'</svg>';
}

function overview() {
  const compare=repos.length>1;
  const periods=repos.map(repo=>{
    const days=["clones","views"].flatMap(k=>[repo.window?.[k]?.first,repo.window?.[k]?.last]).filter(Boolean).sort();
    return days.length?durationText(days[0],days.at(-1)):"暂无流量记录";
  });
  $("#overview-period").textContent="最近 14 天流量 · "+(new Set(periods).size===1?periods[0]:periods.map((p,i)=>nameOf(repos[i].repository)+" "+p).join(" / "))+" · UTC";
  const dims=[["clones","count","clones"],["clones","uniques","cloners"],["views","count","views"],["views","uniques","visitors"]];
  $("#hero-stats").innerHTML=dims.map(([source,key,id])=>{
    const first=repos[0],scope=first.window?.[source];
    const main='<div class="kpi-value-row"><strong class="kpi-value">'+display(scope?.[key],"")+'</strong>'+spark(first,id,scope?.first,scope?.last)+'</div>';
    const sub=compare?repos.slice(1).map(r=>'<span class="kpi-sub">'+esc(nameOf(r.repository))+' <b>'+display(r.window?.[source]?.[key],"")+'</b></span>').join(""):"";
    return '<div class="kpi"><div class="kpi-label">'+metrics[id].label+(compare?' · '+esc(nameOf(first.repository)):"")+'</div>'+main+sub+'</div>';
  }).join("");
  $("#updated").textContent="最近采集 · "+repos.map(r=>r.updated).filter(Boolean).sort().at(-1)+" UTC";
}

function renderPicker() {
  const find=$("#metric-search").value.trim().toLowerCase();
  $("#metric-count").textContent="选择指标 · "+state.selected.length;
  $("#presets").innerHTML=Object.entries(presets).map(([label,ids])=>'<button type="button" data-preset="'+label+'" aria-pressed="'+(ids.join(",")===state.selected.join(","))+'">'+label+'</button>').join("");
  let html="";
  for(const group of metricGroups) {
    const options=Object.values(metrics).filter(m=>m.group===group&&(m.label+" "+m.id).toLowerCase().includes(find));
    if(options.length) {
      html+="<fieldset><legend>"+esc(group)+"</legend>"+options.map(m=>'<label><input type="checkbox" data-metric="'+m.id+'" '+(state.selected.includes(m.id)?"checked ":"")+(state.selected.length===1&&state.selected[0]===m.id?"disabled":"")+">"+esc(m.label)+"</label>").join("")+"</fieldset>";
    }
  }
  $("#metric-options").innerHTML=html||empty("没有匹配的指标");
}
function determineRange() {
  const available=dataBounds(repos,state.selected);
  let start=available.first,end=available.last;
  if(state.range==="custom") {
    const limits=dataBounds(repos,Object.keys(metrics));
    start=limits.first && state.from<limits.first?limits.first:state.from;
    end=limits.last && state.to>limits.last?limits.last:state.to;
    if (!limits.first || start>end) {
      return {start:"",end:""};
    }
  } else if(start && end && state.range!=="all") {
    start=isoDay(Math.max(dayTime(start),dayTime(end)-(Number(state.range)-1)*dayMs));
  }
  return {start,end};
}
function trend() {
  for(const figure of figures) {
    figure.destroy();
  }
  figures=[];
  const {start,end}=determineRange();
  exportStart=start;
  exportEnd=end;
  result=buckets(repos,state.selected,start,end,state.grain);
  for(const row of result.series) {
    row.color=colorFor(state.selected.indexOf(row.id));
    row.secondary=row.repository!==repos[0].repository;
  }
  const mixed=new Set(result.series.map(s=>s.metric.unit)).size>1;
  const relative=state.scale==="relative" || (state.layout==="overlay" && mixed);
  $("#plots").className=state.layout==="split"?"charts":"";
  $("#plots").replaceChildren();
  const notes=[];
  if (relative) {
    notes.push("各曲线按所选区间自身峰值的百分比显示，单点读数保留原值。");
  }
  if (state.selected.includes("starAdds")) {
    notes.push("新增 Star 沿用 GitHub 的日历分组，日期边界可能与 UTC 有差异。");
  }
  if (state.grain!=="day" && state.selected.some(id=>metrics[id].rule==="peak")) {
    notes.push("独立人数显示周期内的单日最高值。");
  }
  $("#plot-note").textContent=notes.join(" ");
  $("#plot-note").hidden=notes.length===0;
  if(state.layout==="split") {
    for(const id of state.selected) {
      figures.push(new MetricPlot($("#plots"),metrics[id].label,result.dates,result.series.filter(s=>s.id===id),relative,repos.length>1,state.grain));
    }
  } else {
    figures.push(new MetricPlot($("#plots"),"",result.dates,result.series,relative,repos.length>1,state.grain));
  }
  $("#period").textContent=start&&end?durationText(start,end)+(state.grain==="week"?" · 周日起算":""):"所选指标暂无历史记录";
  for(const b of $("#ranges").querySelectorAll("button")) {
    b.setAttribute("aria-pressed",String(state.range===b.dataset.range));
  }
  for(const b of $("#layout").querySelectorAll("button")) {
    b.setAttribute("aria-pressed",String(state.layout===b.dataset.layout));
  }
  $("#grain").value=state.grain;
  $("#scale").value=state.scale;
  if(mixed && state.layout==="overlay") {
    $("#scale").value="relative";
  }
  $("#scale").disabled=mixed&&state.layout==="overlay";
  state.page=0;
  summary();
  periodTable();
  writeUrl();
}

function summary() {
  const columns=repos.map(r=>nameOf(r.repository));
  const compare=repos.length===2;
  const head=["指标","区间统计",...columns,...(compare?["两仓合计","差值（后者 − 前者）"]:[])];
  const rows=state.selected.map(id=>{
    const metric=metrics[id],items=result.series.filter(s=>s.id===id);
    const values=items.map(s=>s.total);
    const cells=items.map(s=>{
      const amount=esc(display(s.total,metric.unit));
      if (!s.observed) {
        return amount;
      }
      const days=Math.round((dayTime(exportEnd)-dayTime(exportStart))/dayMs)+1;
      if(metric.rule==="last") {
        return amount+'<small class="cell-observation">'+s.lastDay+'</small>';
      }
      if(s.observed<days) {
        const weekly=["added","removed","weeklyCommits","ownerWeekly"].includes(id);
        return amount+'<small class="cell-observation">'+s.observed+(weekly?" 条周记录":" 天有记录")+'</small>';
      }
      return amount;
    });
    const diff=compare&&values[0]!=null&&values[1]!=null?values[1]-values[0]:null;
    const delta=diff===null?"—":(diff<0?"−":diff>0?"+":"")+(metric.unit==="%"?numeric.format(Math.abs(diff))+" 个百分点":display(Math.abs(diff),metric.unit));
    const additive=metric.rule==="sum" || ["openIssues","closedIssues","openPR","closedPR","mergedPR","releases","downloads","releaseAssets","workflows","cacheBytes","artifactBytes","cacheCount","artifactCount"].includes(id);
    const combined=additive&&values.every(v=>v!=null)?display(values.reduce((a,b)=>a+b,0),metric.unit):"—";
    return [esc(metric.label),rules[metric.rule],...cells,...(compare?[esc(combined),esc(delta)]:[])];
  });
  $("#summary").innerHTML=dataTable(head,rows);
  $("#download").disabled=!result.series.some(s=>s.observed);
}
function periodTable() {
  const size=result.dates.length, pages=Math.max(1,Math.ceil(size/perPage)), start=state.page*perPage;
  const head=["周期起始日（UTC）",...result.series.map(s=>s.metric.label+(repos.length>1?" · "+nameOf(s.repository):""))];
  const rows=[];
  for(let offset=start;offset<Math.min(size,start+perPage);offset++) {
    const i=size-1-offset;
    rows.push([result.dates[i],...result.series.map(s=>esc(display(s.values[i],s.metric.unit)))]);
  }
  $("#period-table").innerHTML=dataTable(head,rows);
  $("#page-label").textContent=size?"第 "+(state.page+1)+" / "+pages+" 页，共 "+size+" 个周期":"暂无记录";
  $("#prev").disabled=state.page===0;
  $("#next").disabled=state.page>=pages-1;
}
function updateDetails() {
  const ranking=state.tab==="referrers"||state.tab==="paths";
  $("#detail-tabs").innerHTML=Object.entries(tabs).map(([id,title])=>'<button type="button" data-tab="'+id+'" aria-pressed="'+(id===state.tab)+'">'+title+'</button>').join("");
  const days=[...new Set(repos.flatMap(r=>Object.keys(r.ranks)))].sort().reverse();
  if(!days.includes(state.snapshot)) {
    state.snapshot=days[0]??"";
  }
  $("#rank-date").innerHTML=days.map(d=>'<option>'+d+'</option>').join("");
  $("#rank-date").value=state.snapshot;
  $("#rank-date-label").hidden=!ranking||!days.length;
  renderDetails(repos,state.tab,state.snapshot);
  writeUrl();
}
function closeDates() {
  $("#dates").hidden=true;
  $('#ranges [data-range="custom"]').setAttribute("aria-expanded","false");
}
$("#repo-tabs").addEventListener("click",e=>{
  const b=e.target.closest("button");
  if(b&&b.dataset.repo!==state.repo) {
    state.repo=b.dataset.repo;
    closeDates();
    loadRepo();
  }
});
$("#metric-search").addEventListener("input",renderPicker);
$("#presets").addEventListener("click",e=>{
  const button=e.target.closest("button");
  if(button) {
    state.selected=[...presets[button.dataset.preset]];
    $("#metric-search").value="";
    renderPicker();
    closePicker();
    trend();
  }
});
$("#metric-options").addEventListener("change",e=>{
  const input=e.target.closest("input");
  if(!input) {
    return;
  }
  const id=input.dataset.metric;
  state.selected=input.checked?[...state.selected,id]:state.selected.filter(s=>s!==id);
  renderPicker();
  $("#metric-options input[data-metric='"+id+"']")?.focus({preventScroll:true});
  trend();
});
function closePicker() {
  $("#picker").open=false;
  $("#metric-count").focus();
}
$("#pick-done").addEventListener("click",closePicker);
document.addEventListener("pointerdown",e=>{
  if($("#picker").open&&!$("#picker").contains(e.target)) {
    $("#picker").open=false;
  }
});
$("#picker").addEventListener("keydown",e=>{
  if(e.key==="Escape") {
    closePicker();
  }
});
$("#ranges").addEventListener("click",e=>{
  const b=e.target.closest("button");
  if(!b) {
    return;
  }
  if(b.dataset.range==="custom") {
    const form=$("#dates");
    form.hidden=!form.hidden;
    b.setAttribute("aria-expanded",String(!form.hidden));
    if(!form.hidden) {
      const all=dataBounds(repos,Object.keys(metrics));
      for(const input of [$("#from"),$("#to")]) {
        input.min=all.first;
        input.max=all.last;
      }
      $("#from").value=state.range==="custom"?state.from:exportStart;
      $("#to").value=state.range==="custom"?state.to:exportEnd;
      $("#from").focus();
    }
    return;
  }
  closeDates();
  state.range=b.dataset.range;
  trend();
});
$("#dates").addEventListener("input",()=>$("#to").setCustomValidity(""));
$("#dates").addEventListener("submit",event=>{
  event.preventDefault();
  if($("#from").value>$("#to").value) {
    $("#to").setCustomValidity("结束日期须等于或晚于开始日期");
    $("#to").reportValidity();
    return;
  }
  state.from=$("#from").value;
  state.to=$("#to").value;
  state.range="custom";
  closeDates();
  $('#ranges [data-range="custom"]').focus();
  trend();
});
$("#layout").addEventListener("click",e=>{
  const b=e.target.closest("button");
  if(b) {
    state.layout=b.dataset.layout;
    trend();
  }
});
for(const key of ["grain","scale"]) {
  $("#"+key).addEventListener("change",e=>{
    state[key]=e.target.value;
    trend();
  });
}
$("#detail-tabs").addEventListener("click",e=>{
  const b=e.target.closest("button");
  if(b) {
    state.tab=b.dataset.tab;
    updateDetails();
  }
});
$("#rank-date").addEventListener("change",e=>{
  state.snapshot=e.target.value;
  updateDetails();
});
$("#prev").addEventListener("click",()=>{
  state.page--;
  periodTable();
});
$("#next").addEventListener("click",()=>{
  state.page++;
  periodTable();
});
$("#download").addEventListener("click",()=>{
  const quote=v=>'"'+String(v??"").replaceAll('"','""')+'"';
  const rows=[["周期起始日（UTC）","仓库",...state.selected.map(id=>metrics[id].label+"（"+metrics[id].unit+(state.grain==="day"?"":"，"+rules[metrics[id].rule])+"）")]];
  result.dates.forEach((date,i)=>{
    for(const r of repos) {
      const s=result.series.filter(v=>v.repository===r.repository);
      rows.push([date,r.repository,...s.map(v=>v.values[i])]);
    }
  });
  const url=URL.createObjectURL(new Blob(["\uFEFF"+rows.map(r=>r.map(quote).join(",")).join("\r\n")+"\r\n"],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");
  link.href=url;
  link.download="repository-metrics-"+(state.repo==="compare"?"compare":nameOf(state.repo))+"-"+exportStart+"_"+exportEnd+".csv";
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$("#theme").addEventListener("click",()=>{
  document.documentElement.dataset.theme=getComputedStyle(document.documentElement).colorScheme==="dark"?"light":"dark";
});
loadRepo();
