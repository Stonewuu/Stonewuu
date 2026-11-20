import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { axisDomain, curveGeometry } from "../geometry.mjs";
import { display } from "../model.mjs";
import { formatDay, repoName } from "./view-state.mjs";
import { Blank } from "./controls.jsx";

const hues = [
  ["var(--chart-violet)","var(--chart-orchid)"],["var(--chart-teal)","var(--chart-blue)"],
  ["var(--chart-amber)","var(--chart-rose)"],["var(--chart-blue)","var(--chart-violet)"],
  ["var(--chart-rose)","var(--chart-teal)"],["var(--chart-olive)","var(--chart-amber)"]
];
const primary = {clones:0,views:1,stars:2,forks:3,watchers:4};
export function seriesColor(id,metricIndex,repoIndex) {
  return hues[(primary[id]??metricIndex)%hues.length][repoIndex%2];
}
function Dot({x,y,color,secondary,size=3}) {
  return secondary?<path d={'M'+x+' '+(y-size)+'l'+size+' '+size+' -'+size+' '+size+' -'+size+' -'+size+'Z'}
    fill={color} className="data-point"/>:<circle cx={x} cy={y} r={size} fill={color} className="data-point"/>;
}
export function Spark({values,color}) {
  const samples=values.filter(v=>v!=null);
  if (samples.length<2) {
    return null;
  }
  const min=Math.min(...samples),max=Math.max(...samples);
  const graph=curveGeometry(values,i=>values.length<=1?32:2+62*i/(values.length-1),v=>max===min?12:23-(v-min)*20/(max-min));
  return <svg aria-hidden="true" className="spark" viewBox="0 0 66 27">
    {graph.pieces.map((s,i)=><path key={i} d={s.path} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeDasharray={s.gap?"2 3":undefined}/>)}
    {graph.isolated.map(p=><circle key={p.index} cx={p.x} cy={p.y} r="1.7" fill={color}/>)}
  </svg>;
}

export function TrendPlot({label,dates,series,relative,compare,grain}) {
  const id=useId().replace(/[^a-zA-Z0-9_-]/g,"");
  const svg=useRef(null),tip=useRef(null);
  const [size,setSize]=useState({w:0,h:0});
  const [index,setIndex]=useState(null);
  const [tipWidth,setTipWidth]=useState(190);
  const [announce,setAnnounce]=useState(false);
  const hasValues=series.some(s=>s.observed>0);
  useLayoutEffect(()=>{
    if (!svg.current) {
      return;
    }
    const el=svg.current;
    const measure=()=>{
      const rect=el.getBoundingClientRect();
      setSize(old=>old.w===rect.width&&old.h===rect.height?old:{w:rect.width,h:rect.height});
    };
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(el);
    return ()=>observer.disconnect();
  },[hasValues]);
  useEffect(()=>setIndex(null),[series,dates,relative]);
  const chart=useMemo(()=>{
    if (!hasValues || !size.w) {
      return null;
    }
    const scaled=series.map(s=>{
      const peak=s.values.reduce((a,b)=>b==null?a:Math.max(a,Math.abs(b)),0);
      return s.values.map(v=>v==null?null:relative&&peak?v/peak*100:v);
    });
    let low=0,high=0;
    for(const values of scaled) {
      for(const value of values) {
        if(value!=null) {
          low=Math.min(low,value);
          high=Math.max(high,value);
        }
      }
    }
    const axis=axisDomain(low,high,relative);
    const formatTick=v=>relative?Math.round(v)+"%":display(v,series[0].metric.unit,true);
    const left=Math.max(34,Math.max(formatTick(axis.max).length,formatTick(axis.min).length)*7+10);
    const right=Math.max(left+1,size.w-11),top=13,bottom=Math.max(top+1,size.h-29);
    const x=i=>dates.length===1?(left+right)/2:left+i*(right-left)/Math.max(1,dates.length-1);
    const y=v=>bottom-(v-axis.min)*(bottom-top)/(axis.max-axis.min);
    const shapes=scaled.map(values=>curveGeometry(values,x,y));
    const ticks=[];
    for(let i=0;i<=Math.round((axis.max-axis.min)/axis.step);i++) {
      ticks.push(axis.min+i*axis.step);
    }
    const count=Math.min(dates.length,Math.max(2,Math.floor((right-left)/78)+1));
    const labels=Array.from({length:count},(_,i)=>count===1?0:Math.round(i*(dates.length-1)/(count-1)));
    return {left,right,top,bottom,x,y,shapes,scaled,ticks,formatTick,labels};
  },[hasValues,series,dates,relative,size]);
  const active=chart && index!=null && index<dates.length;
  useLayoutEffect(()=>{
    if(active&&tip.current) {
      setTipWidth(tip.current.offsetWidth);
    }
  },[active,index,series]);
  const name=s=>s.metric.label+(compare?" · "+repoName(s.repository):"");
  const hasGap=chart?.shapes.some(shape=>shape.pieces.some(p=>p.gap));
  function selectAt(e) {
    if(!chart) {
      return;
    }
    const off=e.clientX-svg.current.getBoundingClientRect().left;
    const f=Math.max(0,Math.min(1,(off-chart.left)/(chart.right-chart.left)));
    setAnnounce(false);
    setIndex(Math.round(f*(dates.length-1)));
  }
  const note=active?(grain==="month"?dates[index].slice(0,7):formatDay(dates[index])+(grain==="week"?" 起的周":"")):"";
  const caption=label || "指标趋势";
  return <figure className="plot-card">
    {label&&<figcaption>{label}</figcaption>}
    <div className="plot-legend">{series.map(s=><span key={s.key}><i className={s.secondary?"diamond":""} style={{"--series":s.color}}/>{name(s)}</span>)}
      {hasGap&&<span className="gap-key"><i/>缺失区间</span>}</div>
    {!hasValues?<Blank>所选时段暂无这项指标的记录</Blank>:
      <div className="plot-wrap"><svg className="graph" ref={svg} viewBox={'0 0 '+(size.w||1)+' '+(size.h||1)} role="group" tabIndex={0}
        aria-label={caption+"，左右方向键逐期查看，Home 和 End 跳到首尾"}
        onPointerMove={selectAt} onPointerDown={selectAt} onPointerLeave={e=>{if(e.pointerType==="mouse"){setIndex(null);}}}
        onFocus={()=>{setAnnounce(true);setIndex(current=>current??dates.length-1);}} onBlur={()=>setIndex(null)}
        onKeyDown={e=>{
          const keys={ArrowLeft:Math.max(0,(index??0)-1),ArrowRight:Math.min(dates.length-1,(index??-1)+1),Home:0,End:dates.length-1};
          if (Object.hasOwn(keys,e.key)) {
            e.preventDefault();
            setAnnounce(true);
            setIndex(keys[e.key]);
          } else if(e.key==="Escape") {
            setIndex(null);
          }
        }}>
        {chart&&<>
          <defs><linearGradient id={id+"-area"} x1="0" x2="0" y1="0" y2="1"><stop stopColor={series[0].color} stopOpacity=".15"/><stop offset="1" stopColor={series[0].color} stopOpacity=".012"/></linearGradient></defs>
          {chart.ticks.map(v=><g key={v}><line className="plot-grid" x1={chart.left} x2={chart.right} y1={chart.y(v)} y2={chart.y(v)}/>
            <text className="axis" x={chart.left-8} y={chart.y(v)+4} textAnchor="end">{chart.formatTick(v)}</text></g>)}
          {chart.labels.map((i,k)=><text className="axis" key={i} x={chart.x(i)} y={size.h-5}
            textAnchor={chart.labels.length===1?"middle":k===0?"start":k===chart.labels.length-1?"end":"middle"}>
            {grain==="month"||dates.length>500?dates[i].slice(0,7):dates[i].slice(5).replace("-","/")}</text>)}
          <g className="curve-layer" key={dates[0]+dates.at(-1)+series.map(s=>s.key).join("")+relative+grain}>
            {series.map((s,j)=><g key={s.key}>{chart.shapes[j].pieces.map((piece,k)=><React.Fragment key={k}>
              {j===0 && !piece.gap && <path fill={'url(#'+id+'-area)'} d={piece.path+"L"+piece.to.x+" "+chart.y(0)+"L"+piece.from.x+" "+chart.y(0)+"Z"}/>}
              <path className={piece.gap?"plot-line missing-interval":"plot-line observed-line"} d={piece.path} stroke={s.color} fill="none"
                data-from={piece.gap?dates[piece.from.index]:undefined} data-to={piece.gap?dates[piece.to.index]:undefined}
                strokeDasharray={piece.gap?"4 4":undefined} pathLength={piece.gap&&piece.to.x-piece.from.x<12?9:undefined}/>
            </React.Fragment>)}
            {chart.shapes[j].isolated.map(p=><Dot key={p.index} x={p.x} y={p.y} color={s.color} secondary={s.secondary}/>)}
            {s.secondary&&chart.scaled[j].map((v,i)=>v!=null&&dates.length>1&&i%Math.max(1,Math.ceil(dates.length/7))===0?
              <Dot key={"m"+i} x={chart.x(i)} y={chart.y(v)} color={s.color} secondary size={2.7}/>:null)}
            </g>)}
          </g>
          {active&&<g aria-hidden><line className="pointer-line" x1={chart.x(index)} x2={chart.x(index)} y1={chart.top} y2={chart.bottom}/>
            {series.map((s,j)=>chart.scaled[j][index]==null?null:<Dot key={s.key} x={chart.x(index)} y={chart.y(chart.scaled[j][index])} color={s.color} secondary={s.secondary} size={4.5}/>)}</g>}
        </>}
      </svg>
      {active&&<div className="point-tip" ref={tip}
        style={{left:Math.max(0,Math.min(size.w-tipWidth,chart.x(index)+tipWidth+12<size.w?chart.x(index)+10:chart.x(index)-tipWidth-10)),top:chart.top+5}}><b>{note}</b>{series.map(s=><div key={s.key}>
        <span><i style={{background:s.color}}/>{name(s)}</span><strong>{display(s.values[index],s.metric.unit)}</strong></div>)}</div>}
      <span className="visually-hidden" aria-live="polite">{announce&&active?note+"，"+series.map(s=>name(s)+" "+display(s.values[index],s.metric.unit)).join("，"):""}</span>
      </div>}
  </figure>;
}
