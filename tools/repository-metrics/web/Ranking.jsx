import React, { useState } from "react";
import { ListBox } from "@heroui/react";
import { Blank } from "./controls.jsx";
import { numeric } from "../model.mjs";

const colors=["#7264d7","#43aa97","#ecaa65","#65a0d4","#c780b2","#80975e","#a99cdb","#62b7c4","#cd987e","#9ba1b4"];
function Distribution({entries,total,active,onHover,onPin,kind}) {
  const chosen=active==null?null:entries[active];
  let offset=0;
  return <div className="rank-visual">
    <div className="rank-donut"><svg viewBox="0 0 180 180" role="img" aria-label={kind+"浏览分布，上榜浏览次数合计 "+numeric.format(total)}>
      <circle cx="90" cy="90" r="72" fill="none" stroke="var(--mist)" strokeWidth="15"/>
      {entries.map((entry,i)=>{
        const share=total?entry.count/total*100:0, start=offset;
        offset+=share;
        if (!share) {
          return null;
        }
        const gap=entries.length>1?Math.min(.65,share*.2):0;
        return <circle key={entry.name+"-"+i} cx="90" cy="90" r="72" pathLength="100" fill="none" stroke={colors[i%colors.length]}
          strokeWidth={active===i?19:15} opacity={active==null||active===i?1:.36} transform="rotate(-90 90 90)"
          strokeDasharray={(share-gap)+" "+(100-share+gap)} strokeDashoffset={-start-gap/2}
          onPointerEnter={()=>onHover(i)} onPointerLeave={()=>onHover(null)} onClick={()=>onPin(i)}/>;
      })}
    </svg><div className="ring-readout"><b>{numeric.format(chosen?.count??total)}</b><span>{chosen?"浏览次数":"上榜浏览合计"}</span></div></div>
    <div className="ring-context"><span className="ring-context-label">{chosen?"当前"+kind:"浏览最多的"+kind}</span>
      <strong>{(chosen??entries[0]).title || (chosen??entries[0]).name}</strong>
      <span>{total?numeric.format((chosen??entries[0]).count/total*100):"0"}% 的上榜浏览量</span></div>
  </div>;
}
export function Ranking({repo,tab,date}) {
  const [point,setPoint]=useState(null),[pinned,setPinned]=useState(null);
  const entries=repo.ranks[date]?.[tab];
  const kind=tab==="paths"?"页面":"来源";
  if(!entries) {
    return <Blank>这个采集日期没有排行记录</Blank>;
  }
  if(!entries.length) {
    return <Blank>GitHub 未返回排行</Blank>;
  }
  const total=entries.reduce((sum,v)=>sum+v.count,0);
  const active=point??pinned;
  return <div className="rank-box"><div className="rank-layout">
    <Distribution entries={entries} total={total} active={active} onHover={setPoint} onPin={i=>setPinned(n=>n===i?null:i)} kind={kind}/>
    <div className="rank-ledger">
      <div className="rank-grid ledger-head"><span>{kind} <small>· 最近 14 天</small></span><span>浏览次数</span><span>独立访客</span></div>
      <ListBox className="ledger-list" aria-label={tab==="paths"?"热门页面排行":"来源网站排行"} selectionMode="single" selectionBehavior="toggle"
        selectedKeys={pinned==null?[]:[String(pinned)]} onSelectionChange={keys=>{const first=[...keys][0];setPinned(first==null?null:Number(first));}}>
        {entries.map((item,i)=><ListBox.Item key={i} id={String(i)} textValue={(item.title||item.name)+" "+item.count+" 次浏览，"+item.uniques+" 位独立访客"}
          className="rank-item rank-grid" data-active={active===i} onHoverStart={()=>setPoint(i)} onHoverEnd={()=>setPoint(null)}
          onFocus={()=>setPoint(i)} onBlur={()=>setPoint(null)}>
          <span className="entry-name"><i style={{backgroundColor:colors[i%colors.length]}}/><span>{item.title||item.name}{tab==="paths"&&<small>{item.name}</small>}</span></span>
          <b>{numeric.format(item.count)}</b><span className="visitor-count">{numeric.format(item.uniques)}</span>
        </ListBox.Item>)}
      </ListBox>
    </div>
  </div></div>;
}
