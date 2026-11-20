import { dataBounds, dayMs, dayTime, isoDay, metrics, rules, validDate } from "../model.mjs";

export const presets = {
  流量:["clones","views"], 关注:["stars","forks","watchers"], 关注增长:["starHistoryTotal","forkHistoryTotal"], 协作:["issueOpened","prOpened","prMerged"],
  代码:["dailyCommits","added","removed"], 发布:["releases","downloads"], 自动化:["runs","success","failure"],
  依赖:["trackedManifests","lockFiles","manifests"]
};
export const detailTabs = {catalog:"指标目录",referrers:"来源网站",paths:"热门页面",code:"代码与贡献",
  collaboration:"协作与评审",releases:"发布与自动化",dependencies:"依赖与社区",status:"采集状态"};
export const repoName = full => full.split("/").at(-1);
export const formatDay = day => new Intl.DateTimeFormat("zh-CN",{year:"numeric",month:"long",day:"numeric",timeZone:"UTC"}).format(dayTime(day));
export function dateRange(first,last) {
  if (!first || !last) {
    return "暂无记录";
  }
  if (first===last) {
    return formatDay(first);
  }
  return formatDay(first)+" – "+(first.slice(0,7)===last.slice(0,7)?Number(last.slice(8))+"日":formatDay(last));
}

export function initialView(names, query) {
  const params=new URLSearchParams(query);
  const choice=(key,options,defaultValue)=>options.includes(params.get(key))?params.get(key):defaultValue;
  const requested=[...new Set((params.get("metrics")??"clones,views").split(","))].filter(id=>Object.hasOwn(metrics,id));
  const match=names.find(name=>params.get("repo")===name||params.get("repo")===repoName(name));
  const from=params.get("from"),to=params.get("to");
  const range=choice("range",["7","14","30","90","all","custom"],"14");
  return {repo:params.get("repo")==="compare"?"compare":match??names[0],selected:requested.length?requested:["clones","views"],
    range:range==="custom"&&(!validDate(from)||!validDate(to)||from>to)?"14":range,from,to,
    grain:choice("grain",["day","week","month"],"day"),layout:choice("layout",["overlay","split"],"overlay"),
    scale:choice("scale",["value","relative"],"value"),tab:choice("tab",Object.keys(detailTabs),"referrers"),snapshot:params.get("snapshot")};
}
export function viewQuery(view) {
  const p=new URLSearchParams({repo:view.repo==="compare"?"compare":repoName(view.repo),metrics:view.selected.join(","),range:view.range});
  if (view.range==="custom") {
    p.set("from",view.from);
    p.set("to",view.to);
  }
  for (const [key,normal] of Object.entries({layout:"overlay",grain:"day",scale:"value",tab:"referrers"})) {
    if(view[key]!==normal) {
      p.set(key,view[key]);
    }
  }
  if(view.snapshot) {
    p.set("snapshot",view.snapshot);
  }
  return p.toString();
}
export function selectedPeriod(repos,view) {
  const bounds=dataBounds(repos,view.selected);
  if(view.range==="custom") {
    const all=dataBounds(repos,Object.keys(metrics));
    if(!all.first || view.to<all.first || view.from>all.last) {
      return {start:"",end:""};
    }
    return {start:view.from<all.first?all.first:view.from,end:view.to>all.last?all.last:view.to};
  }
  if (!bounds.first || view.range==="all") {
    return {start:bounds.first,end:bounds.last};
  }
  return {start:isoDay(Math.max(dayTime(bounds.first),dayTime(bounds.last)-(Number(view.range)-1)*dayMs)),end:bounds.last};
}

export function exportCsv(result,view,period,repos) {
  const metricList=view.selected.map(id=>metrics[id]);
  const rows=[["周期起始日（UTC）","仓库",...metricList.map(m=>m.label+"（"+m.unit+(view.grain==="day"?"":"，"+rules[m.rule])+"）")]];
  const seriesByRepo=repos.map(r=>result.series.filter(s=>s.repository===r.repository));
  result.dates.forEach((date,i)=>{
    repos.forEach((r,repoIndex)=>{
      rows.push([date,r.repository,...seriesByRepo[repoIndex].map(s=>s.values[i])]);
    });
  });
  const quote=v=>'"'+String(v??"").replaceAll('"','""')+'"';
  const text=rows.map(row=>row.map(quote).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob(["\uFEFF"+text+"\r\n"],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");
  link.href=url;
  link.download="repository-metrics-"+(view.repo==="compare"?"compare":repoName(view.repo))+"-"+period.start+"_"+period.end+".csv";
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
