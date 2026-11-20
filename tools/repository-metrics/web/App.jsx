import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "react-aria-components/I18nProvider";
import { Button, Link, Spinner, Tooltip } from "@heroui/react";
import { Activity, ArrowUpRight, CalendarDays, ChartColumn, ChartNoAxesCombined, Check, Copy, Download, Eye, GitFork, Layers, Moon, PanelsTopLeft, Star, Sun } from "lucide-react";
import { buckets, dataBounds, dayMs, dayTime, display, isoDay, metrics } from "../model.mjs";
import { Rail as ChoiceRail, DateRangeMenu, MenuSelect, MetricsPicker } from "./controls.jsx";
import { dateRange, initialView, presets, repoName, selectedPeriod, viewQuery } from "./view-state.mjs";
import { Spark, seriesColor, TrendPlot } from "./TrendPlot.jsx";
import { Details } from "./Details.jsx";
import { Summary } from "./Summary.jsx";

const manifest=JSON.parse(document.getElementById("datasets").textContent);
const repositories=Object.keys(manifest);
const cache=new Map();
async function dataset(name) {
  if(cache.has(name)) {
    return cache.get(name);
  }
  const response=await fetch(manifest[name]);
  if(!response.ok) {
    throw new Error("仓库统计加载失败");
  }
  const repo=await response.json();
  if(repo.repository!==name) {
    throw new Error("统计文件与仓库不匹配");
  }
  const latest={};
  for(const [day,values] of Object.entries(repo.days)) {
    for(const [id,value] of Object.entries(values)) {
      if(Object.hasOwn(metrics,id)&&Number.isFinite(value)) {
        latest[id]={day,value};
      }
    }
  }
  repo.latest=latest;
  cache.set(name,repo);
  return repo;
}
const railOptions=entries=>entries.map(([id,label,icon])=>({id,label,icon}));
const ranges=railOptions([["7","7 天"],["14","14 天"],["30","30 天"],["90","90 天"],["all","全部"]]);
const layouts=railOptions([["overlay","合并",Layers],["split","分图",PanelsTopLeft]]);
const grains=railOptions([["day","按日"],["week","按周"],["month","按月"]]);
const scales=railOptions([["value","原始数值"],["relative","相对峰值"]]);
const cards = [
  {id:"stars",label:"Star",icon:Star,color:"#e6bf70",field:r=>r.latest.stars?.value},
  {id:"forks",label:"Fork",icon:GitFork,color:"#b8bcff",field:r=>r.latest.forks?.value},
  {id:"clones",label:"14 天克隆次数",icon:Download,color:"#b9a9ff",field:r=>r.window?.clones.count},
  {id:"views",label:"14 天浏览次数",icon:Eye,color:"#8ce2c8",field:r=>r.window?.views.count}
];
function Header({dark,setDark}) {
  return <header className="mast"><div className="wrap mast-inner"><Link className="profile-link" href="https://github.com/Stonewuu">
    <span className="brand-mark" aria-hidden><Activity size={21} strokeWidth={2.6}/></span><strong>Stonewuu</strong></Link>
    <div className="mast-actions"><Link className="archive-link" href="https://github.com/Stonewuu/Stonewuu/tree/traffic-history">数据归档<ArrowUpRight size={15}/></Link>
      <Tooltip delay={250}><Button isIconOnly variant="ghost" aria-label={dark?"切换到浅色主题":"切换到深色主题"} onPress={()=>setDark(!dark)}>{dark?<Sun size={17}/>:<Moon size={17}/>}</Button>
        <Tooltip.Content>{dark?"浅色主题":"深色主题"}</Tooltip.Content></Tooltip></div></div></header>;
}
function recentSeries(repo,id) {
  const source=repo.days,days=Object.keys(source).filter(day=>source[day][id]!=null);
  if(!days.length) {
    return [];
  }
  const end=dayTime(days.at(-1)),start=Math.max(dayTime(days[0]),end-27*dayMs);
  const values=[];
  for(let t=start;t<=end;t+=dayMs) {
    values.push(source[isoDay(t)]?.[id]??null);
  }
  return values;
}
function Overview({repos,repoKey,change}) {
  const recent=repos.map(r=>{
    const ends=["clones","views"].flatMap(k=>[r.window?.[k]?.first,r.window?.[k]?.last]).filter(Boolean).sort();
    return dateRange(ends[0],ends.at(-1));
  });
  const dates=new Set(recent).size<=1?recent[0]:repos.map((r,i)=>repoName(r.repository)+" "+recent[i]).join(" / ");
  return <><div className="intro"><div><h1>仓库统计</h1><p>{repos.length?"最近更新 "+repos.map(r=>r.updated).filter(Boolean).sort().at(-1)+" · UTC":"GitHub 仓库数据"}</p></div>
    <ChoiceRail className="repo-rail" label="选择仓库" value={repoKey} options={[...repositories.map(id=>({id,label:repoName(id)})),{id:"compare",label:"对比仓库",icon:ChartColumn}]} onChange={repo=>change({repo})}/></div>
    {repos.length>0&&<section className="overview" aria-label="仓库关注和流量概览"><div className="overview-head"><span className="overview-title"><span className="status-dot"/>{repos.length>1?"仓库对比":repoName(repos[0].repository)}</span>
      <span className="period-stamp"><CalendarDays size={14}/>流量周期 · {dates}</span></div>
      <div className="overview-grid">{cards.map(({id,label,icon:Icon,color,field})=><div className="overview-metric" key={id}>
        <div className="kpi-label"><Icon size={16} color={color}/>{label}</div>
        <div className="kpi-row"><strong>{display(field(repos[0]),"")}</strong><Spark color={color} values={recentSeries(repos[0],id)}/></div>
        {repos.length>1&&<small className="first-repo">{repoName(repos[0].repository)}</small>}
        {repos.slice(1).map(r=><div className="kpi-other" key={r.repository}><span>{repoName(r.repository)}</span><b>{display(field(r),"")}</b></div>)}
      </div>)}</div>
      <div className="overview-foot">{repos.map(r=><div key={r.repository}>{repos.length>1&&<strong>{repoName(r.repository)}</strong>}
        <span>订阅 <b>{display(r.latest.watchers?.value,"")}</b></span><span>独立克隆者 <b>{display(r.window?.clones.uniques,"")}</b></span>
        <span>独立访客 <b>{display(r.window?.views.uniques,"")}</b></span></div>)}</div>
    </section>}</>;
}
function Workspace({repos,view,change}) {
  const trend=useRef(null);
  const period=useMemo(()=>selectedPeriod(repos,view),[repos,view.range,view.selected,view.from,view.to]);
  const limits=useMemo(()=>dataBounds(repos,Object.keys(metrics)),[repos]);
  const result=useMemo(()=>{
    const result=buckets(repos,view.selected,period.start,period.end,view.grain);
    for(const row of result.series) {
      const ri=repos.findIndex(r=>r.repository===row.repository);
      row.key=row.repository+"/"+row.id;
      row.secondary=ri!==0;
      row.color=seriesColor(row.id,view.selected.indexOf(row.id),ri);
    }
    return result;
  },[repos,view.selected,period,view.grain]);
  const mixed=new Set(view.selected.map(id=>metrics[id].unit)).size>1;
  const autoRelative=mixed&&view.layout==="overlay";
  const relative=autoRelative||view.scale==="relative";
  const [copy,setCopy]=useState("");
  useEffect(()=>{
    if(copy) {
      const timer=setTimeout(()=>setCopy(""),2200);
      return ()=>clearTimeout(timer);
    }
  },[copy]);
  async function share() {
    try {
      const url=new URL(location.href);
      url.hash="trends";
      await navigator.clipboard.writeText(url.toString());
      setCopy("已复制链接");
    } catch {
      setCopy("可复制地址栏链接");
    }
  }
  function revealMetric(id) {
    change({selected:[id]});
    trend.current?.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
  }
  const selectedPreset=Object.keys(presets).find(k=>presets[k].join()===view.selected.join())??"";
  const seriesByMetric=useMemo(()=>view.selected.map(id=>result.series.filter(s=>s.id===id)),[result,view.selected]);
  return <><section className="paper trends" id="trends" ref={trend}><div className="section-heading chart-heading">
    <div className="heading-label"><span className="section-symbol"><ChartNoAxesCombined size={20}/></span><h2>指标趋势</h2></div>
    <div className="date-tools"><ChoiceRail label="时间范围" value={view.range} options={ranges} onChange={range=>change({range})}/>
      <DateRangeMenu active={view.range==="custom"} limits={limits} period={period} onApply={(from,to)=>change({range:"custom",from,to})}/></div></div>
    <div className="preset-strip"><span className="micro-label">常用组合</span><div className="preset-list">{Object.entries(presets).map(([key,ids])=>
      <Button variant="ghost" size="sm" key={key} className={"preset "+(selectedPreset===key?"chosen":"")} aria-pressed={selectedPreset===key} onPress={()=>change({selected:[...ids]})}>{key}</Button>)}</div></div>
    <div className="plot-tools"><div><MetricsPicker selected={view.selected} onChange={selected=>change({selected})}/>
      <ChoiceRail label="图表布局" value={view.layout} options={layouts} onChange={layout=>change({layout})}/></div>
      <div><MenuSelect label="统计周期" value={view.grain} items={grains} onChange={grain=>change({grain})}/>
        <MenuSelect label="纵轴刻度" value={relative?"relative":"value"} disabled={autoRelative} items={scales} onChange={scale=>change({scale})}/></div></div>
    {relative&&<p className="plot-note">每条曲线以区间内绝对值最大的读数为 100%，悬停可看原值。</p>}
    {view.selected.includes("starAdds")&&<p className="plot-note">新增 Star 使用 GitHub 的日历分组，日期边界可能与 UTC 略有差异。</p>}
    {view.selected.some(id=>id==="starHistoryTotal"||id==="forkHistoryTotal")&&<p className="plot-note">Star 按 GitHub 返回的历日新增数累计，Fork 按当前可查的创建日期累计。历史取消的 Star 和已删除的 Fork 无法逐日还原。</p>}
    {view.grain!=="day"&&view.selected.some(id=>metrics[id].rule==="peak")&&<p className="plot-note">独立人数显示周期内的单日最高值。</p>}
    <div id="plots" className={view.layout==="split"?"split-plots":"combined-plot"}>
      {view.layout==="overlay"?<TrendPlot dates={result.dates} series={result.series} relative={relative} compare={repos.length>1} grain={view.grain}/>:
        seriesByMetric.map((s,i)=><TrendPlot key={view.selected[i]} label={metrics[view.selected[i]].label} dates={result.dates} series={s} relative={relative} compare={repos.length>1} grain={view.grain}/>)}</div>
    <div className="plot-footer"><span>{dateRange(period.start,period.end)}{view.grain==="week"?" · 周日起算":""}</span>
      <Button size="sm" variant="ghost" onPress={share}>{copy?<Check size={13}/>:<Copy size={13}/>}<span aria-live="polite">{copy||"复制视图链接"}</span></Button></div>
    </section>
    <Summary key={[view.repo,view.grain,period.start,period.end].join("/")} repos={repos} view={view} result={result} period={period}/>
    <Details repos={repos} view={view} change={change} onMetric={revealMetric}/></>;
}
function App() {
  const openingAnchor=useRef(location.hash.slice(1));
  const [view,setView]=useState(()=>initialView(repositories,location.search));
  const [dark,setDark]=useState(()=>document.documentElement.classList.contains("dark"));
  const [data,setData]=useState({key:"",repos:[],error:false}),[retry,setRetry]=useState(0);
  const repos=data.key===view.repo?data.repos:[];
  useEffect(()=>{
    const id=openingAnchor.current;
    if (repos.length && (id==="details"||id==="trends")) {
      const frame=requestAnimationFrame(()=>{
        if (openingAnchor.current===id) {
          document.getElementById(id)?.scrollIntoView({block:"start",behavior:"instant"});
        }
        openingAnchor.current=null;
      });
      return ()=>cancelAnimationFrame(frame);
    }
  },[repos]);
  const change=patch=>{
    openingAnchor.current=null;
    setView(old=>({...old,...patch}));
  };
  useEffect(()=>{
    const next=viewQuery(view);
    if(location.search.slice(1)!==next) {
      history.replaceState(null,"",location.pathname+"?"+next+location.hash);
    }
  },[view]);
  useEffect(()=>{
    let current=true;
    const selected=view.repo==="compare"?repositories:[view.repo];
    Promise.all(selected.map(dataset)).then(repos=>{
      if(current) {
        setData({key:view.repo,repos,error:false});
      }
    }).catch(()=>{
      if(current) {
        setData({key:view.repo,repos:[],error:true});
      }
    });
    return ()=>{current=false;};
  },[view.repo,retry]);
  function theme(next) {
    document.documentElement.classList.toggle("dark",next);
    document.documentElement.dataset.theme=next?"dark":"light";
    setDark(next);
  }
  return <I18nProvider locale="zh-CN"><Header dark={dark} setDark={theme}/><main className="wrap content">
    <Overview repos={repos} repoKey={view.repo} change={change}/>
    {repos.length?<Workspace repos={repos} view={view} change={change}/>:data.error&&data.key===view.repo?
      <div className="paper loading" role="alert">仓库统计加载失败。<Button onPress={()=>{setData({...data,error:false});setRetry(n=>n+1);}}>重试</Button></div>:
      <div className="loading" role="status"><Spinner/>正在读取仓库数据…</div>}
    <footer className="page-end"><span>Stonewuu <span className="foot-divider">/</span> 仓库统计</span><Link href="https://docs.github.com/zh/rest/metrics">GitHub 统计说明 <ArrowUpRight size={13}/></Link></footer>
    </main></I18nProvider>;
}
createRoot(document.getElementById("root")).render(<App/>);
