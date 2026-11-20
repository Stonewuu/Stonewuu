import React, { useState } from "react";
import { ListBox } from "@heroui/react";
import { ChevronRight } from "lucide-react";
import { display, metrics, metricGroups } from "../model.mjs";
import { Blank, MenuSelect, Pager, Search } from "./controls.jsx";
import { repoName } from "./view-state.mjs";

export function Catalogue({repos,onMetric}) {
  const [query,setQuery]=useState(""),[group,setGroup]=useState("全部分类"),[page,setPage]=useState(0);
  const lookup=query.trim().toLowerCase();
  const items=Object.values(metrics).filter(m=>(group==="全部分类"||m.group===group)&&(m.id+" "+m.label).toLowerCase().includes(lookup));
  const pages=Math.max(1,Math.ceil(items.length/10));
  const current=Math.min(page,pages-1);
  return <div className="metric-catalog"><div className="directory-tools"><Search label="搜索全部指标" value={query} onChange={q=>{setQuery(q);setPage(0);}}/>
    <MenuSelect label="目录分类" value={group} onChange={g=>{setGroup(g);setPage(0);}} items={["全部分类",...metricGroups].map(id=>({id,label:id}))}/>
    <span>{items.length} 项</span></div>
    <div className="catalog-grid ledger-head" style={{"--repos":repos.length}}><span>指标</span>{repos.map(r=><span key={r.repository}>{repoName(r.repository)}</span>)}<span/></div>
    {items.length>0?<ListBox key={group+query+page} className="ledger-list" style={{"--repos":repos.length}} aria-label="指标目录列表"
      selectionMode="none" onAction={id=>onMetric(String(id))}>
        {items.slice(current*10,(current+1)*10).map(m=><ListBox.Item key={m.id} id={m.id} textValue={m.label} className="catalog-row catalog-grid">
          <span className="catalog-label"><strong>{m.label}</strong><small>{m.group}</small></span>
          {repos.map(repo=><b key={repo.repository}>{display(repo.latest[m.id]?.value,m.unit)}</b>)}
          <ChevronRight className="catalog-chevron" size={14} aria-hidden/>
        </ListBox.Item>)}
      </ListBox>:<Blank>没有匹配的指标</Blank>}
    <Pager current={current} total={pages} onChange={setPage}/>
  </div>;
}
