import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Tabs } from "@heroui/react";
import { Boxes, ChartNoAxesCombined, Code2, Compass, FileText, GitPullRequest, Rocket, ScanLine } from "lucide-react";
import { display, metrics, numeric } from "../model.mjs";
import { additionalSourceNames } from "../more-metrics.mjs";
import { Blank, DataTable, Fold, MenuSelect, Pager } from "./controls.jsx";
import { detailTabs, repoName } from "./view-state.mjs";
import { Catalogue } from "./Catalogue.jsx";
import { Ranking } from "./Ranking.jsx";
import { useSelectionTrack } from "./motion.js";

const sourceLabels = {repository:"仓库概况",collaboration:"Issue、PR 与引用",discussions:"讨论",languages:"语言分布",
  community:"社区健康度",releases:"版本与下载",actions:"工作流运行",jobPerformance:"任务耗时与成功率",
  lifecycle:"协作活动",contributorCount:"贡献人数",actionsCache:"Actions 缓存",deployments:"部署",artifacts:"Actions 构件",
  commitActivity:"提交活跃度",codeFrequency:"代码增减",participation:"提交参与度",punchCard:"提交时段",contributors:"贡献者统计",
  starHistory:"新增 Star 历史",forkHistory:"现存 Fork 创建历史",referrers:"来源网站",paths:"热门页面",...additionalSourceNames};
const states = {ready:"已采集",pending:"GitHub 正在计算",disabled:"仓库未开启",forbidden:"权限不足",unavailable:"接口未提供",
  unsupported:"不支持此仓库",limited:"达到接口限额",network:"连接失败",error:"读取失败",invalid:"数据格式异常",partial:"数据不完整"};
const stat=(repo,key)=>states[repo.statuses[key]?.status]??"尚无记录";
const row=(id,...cells)=>({id:String(id),text:String(id),cells});
function PageTable({label,headers,rows,limit=12}) {
  const [page,setPage]=useState(0);
  const pages=Math.max(1,Math.ceil(rows.length/limit));
  const current=Math.min(page,pages-1);
  return <><DataTable label={label} headers={headers} rows={rows.slice(current*limit,(current+1)*limit)}/>
    <Pager current={current} total={pages} onChange={setPage}/></>;
}

function Heatmap({hours}) {
  const [selected,setSelected]=useState(null);
  const weekdays=["日","一","二","三","四","五","六"];
  const cells=useMemo(()=>new Map(hours.map(([d,h,n])=>[d*24+h,n])),[hours]);
  const max=Math.max(1,...cells.values());
  const label=i=>"周"+weekdays[Math.floor(i/24)]+" "+i%24+" 时 · "+display(cells.get(i),"")+" 次提交";
  return <><div className="heat" role="group" tabIndex={0} aria-label="一周提交时段，上下键切换日期，左右键切换小时" onFocus={()=>setSelected(n=>n??0)}
    onKeyDown={e=>{
      const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-24,ArrowDown:24}[e.key];
      if(step) {
        e.preventDefault();
        setSelected(n=>Math.max(0,Math.min(167,(n??0)+step)));
      }
    }}><span/>{Array.from({length:24},(_,i)=><span key={i}>{i%6===0?i:""}</span>)}
    {weekdays.map((d,i)=><React.Fragment key={d}><span>周{d}</span>{Array.from({length:24},(_,h)=>{
      const n=i*24+h;
      return <i key={h} aria-hidden data-current={selected===n} onPointerEnter={()=>setSelected(n)} onPointerDown={()=>setSelected(n)}
        style={{"--intensity":((cells.get(n)??0)/max*92)+"%"}}/>;
    })}</React.Fragment>)}</div>
    <p className="small-note heat-note" aria-live="polite">{selected==null?"UTC":label(selected)+" · UTC"}</p></>;
}
function Codes({repo}) {
  const d=repo.details, languages=d.languages?.data, stats=d.files?.data, people=d.contributors?.data;
  const total=languages?Object.values(languages).reduce((a,b)=>a+b,0):0;
  return <><h4>语言分布</h4>{languages?<PageTable label="语言分布" headers={["语言","容量","占比"]}
    rows={Object.entries(languages).sort((a,b)=>b[1]-a[1]).map(([k,v])=>row(k,k,display(v,"字节"),total?display(v/total*100,"%"):"—"))}/>:<Blank>{stat(repo,"languages")}</Blank>}
    {d.punchCard?.data?.length>0&&<><h4>提交时段</h4><Heatmap hours={d.punchCard.data}/></>}
    {people?.length>0&&<Fold title="贡献者提交与增删行数"><PageTable label="贡献者" headers={["贡献者","提交","新增行","删除行"]}
      rows={[...people].sort((a,b)=>b.commits-a.commits).map((p,i)=>row(i,p.login??"匿名贡献者",numeric.format(p.commits),numeric.format(p.weeks.reduce((n,w)=>n+w.a,0)),numeric.format(p.weeks.reduce((n,w)=>n+w.d,0))))}/></Fold>}
    {stats&&<Fold title="默认分支文件类型"><PageTable label="文件类型" headers={["扩展名","文件数","容量"]}
      rows={stats.types.map(t=>row(t.name,t.name,numeric.format(t.files),display(t.bytes,"字节")))}/></Fold>}
  </>;
}
function ValuesTable({repo,source,label}) {
  const item=repo.details[source]?.data;
  if(!item?.values) {
    return <Blank>{stat(repo,source)}</Blank>;
  }
  return <DataTable label={label} headers={["指标","数值"]} rows={Object.entries(item.values).filter(([id])=>metrics[id]).map(([id,v])=>row(id,metrics[id].label,display(v,metrics[id].unit)))}/>;
}
function Collaboration({repo}) {
  const d=repo.details, engage=d.engagement?.data;
  const reviews=d.reviewMetrics?.data.values;
  return <><div className="inline-figures">{[["评审记录",reviews?.submittedReviews],["通过评审",reviews?.approvalReviews],["要求修改",reviews?.changeReviews]].map(([label,value])=><div key={label}><span>{label}</span><b>{display(value,"条")}</b></div>)}</div>
    <Fold title="PR 评审与变更明细"><ValuesTable repo={repo} source="reviewMetrics" label="PR 评审统计"/></Fold>
    <Fold title="Issue 和 PR 互动"><ValuesTable repo={repo} source="engagement" label="议题互动"/>
      {engage?.byReaction&&<DataTable label="表情回应" headers={["回应","Issue","PR"]} rows={Object.entries(engage.byReaction).map(([key,v])=>row(key,key,v.issue,v.pr))}/>}</Fold>
    {engage?.labels?.length>0&&<Fold title="议题标签"><PageTable label="议题标签" headers={["标签","Issue","PR"]} rows={engage.labels.map(v=>row(v.name,v.name,v.issue,v.pr))}/></Fold>}
    <Fold title="分支与引用活动">{d.activity?<DataTable label="引用活动" headers={["类型","次数"]} rows={Object.entries(d.activity.data.types).map(([k,v])=>row(k,({push:"普通推送",force_push:"强制推送",branch_creation:"创建分支",branch_deletion:"删除分支",pr_merge:"合入 PR",merge_queue_merge:"队列合并"})[k]??k,numeric.format(v)))}/>:<Blank>{stat(repo,"activity")}</Blank>}</Fold>
  </>;
}
function Delivery({repo}) {
  const d=repo.details,releases=d.releases?.data;
  const totals={};
  for(const day of Object.values(d.actions?.data.days??{})) {
    for(const [key,value] of Object.entries(day)) {
      totals[key]=(totals[key]??0)+value;
    }
  }
  const titles={success:"成功",failure:"失败",cancelled:"已取消",skipped:"已跳过",timed_out:"超时",in_progress:"运行中",queued:"排队中",action_required:"需要操作",neutral:"中性"};
  return <><h4>公开版本与附件下载</h4>{releases?.length?<PageTable label="发布版本" headers={["版本","日期","附件","累计下载"]}
    rows={releases.map(r=>row(r.tag,r.tag,r.date.slice(0,10),r.assets.length,numeric.format(r.assets.reduce((n,a)=>n+a.downloads,0))))}/>:<Blank>{releases?"暂无已发布版本":stat(repo,"releases")}</Blank>}
    {!!releases?.some(r=>r.assets.length)&&<Fold title="各附件下载量"><PageTable label="附件下载" headers={["版本","附件","大小","下载"]} rows={releases.flatMap(r=>r.assets.map(a=>row(r.tag+'/'+a.name,r.tag,a.name,display(a.bytes,"字节"),numeric.format(a.downloads))))}/></Fold>}
    <h4>工作流运行结果</h4><DataTable label="运行结果" headers={["结果","次数"]} rows={Object.entries(totals).map(([k,v])=>row(k,titles[k]??k,numeric.format(v)))}/>
  </>;
}
function Dependencies({repo}) {
  const files=repo.details.files?.data,health=repo.details.community?.data;
  const labels={code_of_conduct:"行为准则",code_of_conduct_file:"行为准则文件",contributing:"贡献指南",issue_template:"Issue 模板",pull_request_template:"PR 模板",license:"许可证",readme:"README"};
  return <><h4>仓库内包管理清单</h4>{files?<DataTable label="仓库内清单" headers={["生态","文件数"]} rows={Object.entries(files.ecosystems).map(([k,v])=>row(k,k,v))}/>:<Blank>{stat(repo,"files")}</Blank>}
    {[["manifests","GitHub 依赖图清单"],["dependencies","软件材料清单"],["packages","GitHub Packages"],["publishedAdvisories","已公开的安全公告"],["discussionDetail","讨论互动"]].map(([key,title])=>
      <Fold key={key} title={title}><ValuesTable repo={repo} source={key} label={title}/></Fold>)}
    {health&&<Fold title={"社区健康度 · "+display(health.health,"%")}><DataTable label="社区文件" headers={["文件","状态"]}
      rows={Object.entries(health.files).map(([k,v])=>row(k,labels[k]??k,v?"已配置":"未配置"))}/></Fold>}
  </>;
}
function Status({repo}) {
  return <PageTable label="来源状态" headers={["数据来源","状态","采集日"]} rows={Object.entries(sourceLabels).map(([id,name])=>{
    const status=repo.statuses[id];
    return row(id,name,<span className="source-status" data-ready={status?.status==="ready"}><i/>{stat(repo,id)}</span>,status?.date??"—");
  })}/>;
}
export function Details({repos,view,change,onMetric}) {
  const scroller=useRef(null),anchor=useRef(null);
  const [reserve,setReserve]=useState(0);
  const bindTrack=useSelectionTrack(view.tab,'[role="tab"][aria-selected="true"]',scroller);
  useLayoutEffect(()=>{
    if (anchor.current!=null && scroller.current) {
      const delta=scroller.current.getBoundingClientRect().top-anchor.current;
      if (Math.abs(delta)>1) {
        window.scrollBy({top:delta,behavior:"instant"});
      }
      anchor.current=null;
    }
  },[view.tab]);
  function choose(tab) {
    if (tab===view.tab) {
      return;
    }
    const bounds=scroller.current.getBoundingClientRect();
    anchor.current=bounds.top;
    setReserve(Math.max(0,window.innerHeight-bounds.bottom-34));
    change({tab:String(tab)});
  }
  const icons={catalog:ChartNoAxesCombined,referrers:Compass,paths:FileText,code:Code2,collaboration:GitPullRequest,releases:Rocket,dependencies:Boxes,status:ScanLine};
  const dates=useMemo(()=>[...new Set(repos.flatMap(r=>Object.keys(r.ranks)))].sort().reverse(),[repos]);
  const date=dates.includes(view.snapshot)?view.snapshot:dates[0];
  const ranks=view.tab==="referrers"||view.tab==="paths";
  return <section className="insights details-section" id="details"><div className="insights-head"><div><h2>仓库详情</h2><p>{repos.map(r=>repoName(r.repository)).join(" / ")}</p></div>
    <div className="insights-context">{ranks&&dates.length>0?<MenuSelect label="排行采集日期" value={date} items={dates.map(id=>({id,label:id}))} onChange={snapshot=>change({snapshot})}/>:<span>采集于 {repos.map(r=>r.updated).filter(Boolean).sort().at(-1)}</span>}</div></div>
    <Tabs className="detail-tabs" aria-label="详情分类" variant="secondary" selectedKey={view.tab} onSelectionChange={choose}>
      <div className="details-nav-scroll" ref={scroller}><div className="details-track" ref={bindTrack}>
        <span className="selection-glide" aria-hidden/><Tabs.List className="details-nav" aria-label="详情类型">{Object.entries(detailTabs).map(([id,title])=>{
          const Icon=icons[id];
          return <Tabs.Tab className="details-nav-tab" key={id} id={id}><Icon size={15} aria-hidden/>{title}</Tabs.Tab>;
        })}</Tabs.List></div></div>
      <div className="details-canvas" style={{minHeight:reserve}}>{Object.keys(detailTabs).map(tab=><Tabs.Panel className="detail-panel" key={tab} id={tab}>
        {tab==="catalog"?<Catalogue repos={repos} onMetric={onMetric}/>:<div className={"detail-grid "+(repos.length>1?"by-repo":"")}>{repos.map(repo=><article key={repo.repository}>
          {repos.length>1&&<h3 className="repo-caption">{repoName(repo.repository)}</h3>}
          {tab==="referrers"||tab==="paths"?<Ranking key={repo.repository+tab+date} repo={repo} tab={tab} date={date}/>:
            tab==="code"?<Codes repo={repo}/>:tab==="collaboration"?<Collaboration repo={repo}/>:tab==="releases"?<Delivery repo={repo}/>:
            tab==="dependencies"?<Dependencies repo={repo}/>:<Status repo={repo}/>}</article>)}</div>}
      </Tabs.Panel>)}</div>
    </Tabs></section>;
}
