import React, { useMemo, useState } from "react";
import { Button } from "@heroui/react";
import { Download } from "lucide-react";
import { metrics, rules, display, numeric, dayMs, dayTime } from "../model.mjs";
import { DataTable, Fold, Pager } from "./controls.jsx";
import { exportCsv, repoName } from "./view-state.mjs";

const additiveStocks = new Set(["stars","forks","openIssues","closedIssues","openPR","closedPR","mergedPR","releases","downloads","releaseAssets","workflows","cacheBytes","artifactBytes","cacheCount","artifactCount","totalIssues","totalPR","trackedFiles","trackedBytes","prLinesAdded","prLinesDeleted"]);
const weekly = new Set(["added","removed","netLines","weeklyCommits","ownerWeekly"]);
export function Summary({repos,result,view,period}) {
  const compare=repos.length===2;
  const [page,setPage]=useState(0);
  const size=8;
  const pages=Math.max(1,Math.ceil(result.dates.length/size));
  const current=Math.min(pages-1,page);
  const headers=["指标","区间统计",...repos.map(r=>repoName(r.repository)),...(compare?["两仓合计","差值（后者 − 前者）"]:[])];
  const rows=useMemo(()=>view.selected.map(id=>{
    const m=metrics[id],members=result.series.filter(s=>s.id===id);
    const values=members.map(s=>s.total);
    const cells=members.map(s=>{
      let note="";
      if(s.observed&&m.rule==="last") {
        note=s.lastDay;
      } else if(s.observed && s.observed<Math.round((dayTime(period.end)-dayTime(period.start))/dayMs)+1) {
        note=s.observed+(weekly.has(id)?" 条周记录":" 天有记录");
      }
      return <span>{display(s.total,m.unit)}{note&&<small className="cell-note">{note}</small>}</span>;
    });
    const diff=compare&&values.every(v=>v!=null)?values[1]-values[0]:null;
    const delta=diff==null?"—":(diff<0?"−":diff>0?"+":"")+(m.unit==="%"?numeric.format(Math.abs(diff))+" 个百分点":display(Math.abs(diff),m.unit));
    const addable=m.rule==="sum"||additiveStocks.has(id);
    const total=addable&&values.every(v=>v!=null)?display(values.reduce((a,b)=>a+b,0),m.unit):"—";
    return {id,text:m.label,cells:[m.label,rules[m.rule],...cells,...(compare?[total,delta]:[])]};
  }),[result,period,view.selected,compare]);
  const detailHeaders=["周期起始日（UTC）",...result.series.map(s=>s.metric.label+(compare?" · "+repoName(s.repository):""))];
  const detailRows=[];
  for(let offset=current*size;offset<Math.min(result.dates.length,(current+1)*size);offset++) {
    const i=result.dates.length-1-offset;
    detailRows.push({id:result.dates[i],text:result.dates[i],cells:[result.dates[i],...result.series.map(s=>display(s.values[i],s.metric.unit))]});
  }
  return <section className="paper"><div className="section-heading"><h2>区间汇总</h2>
    <Button variant="secondary" size="sm" isDisabled={!result.series.some(s=>s.observed)} onPress={()=>exportCsv(result,view,period,repos)}><Download size={15}/>导出明细 CSV</Button></div>
    <DataTable label="指标汇总" headers={headers} rows={rows}/>
    <Fold title="分期明细"><DataTable label="按周期的逐项明细" headers={detailHeaders} rows={detailRows}/>
      <Pager current={current} total={pages} onChange={setPage}/></Fold></section>;
}
