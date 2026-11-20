const tabs = {referrers:"来源网站",paths:"热门页面",code:"代码与贡献",releases:"发布与自动化",status:"采集状态"};
const sourceNames = {repository:"仓库概况",collaboration:"Issue、PR 与引用",discussions:"讨论",languages:"语言分布",community:"社区健康度",releases:"版本与下载",actions:"工作流运行",lifecycle:"协作活动",contributorCount:"贡献者人数",actionsCache:"Actions 缓存",deployments:"部署",artifacts:"Actions 构件",commitActivity:"提交活跃度",codeFrequency:"代码增减",participation:"参与度",punchCard:"提交时段",contributors:"贡献者统计",referrers:"来源网站",paths:"热门页面"};
const statusNames = {ready:"已采集",pending:"GitHub 正在计算",disabled:"仓库未开启",forbidden:"权限不足",unavailable:"接口未提供",unsupported:"不支持此仓库",limited:"达到接口限额",network:"连接失败",error:"读取失败",invalid:"数据格式异常"};
const empty = message => '<p class="empty-state">'+esc(message)+'</p>';
function dataTable(headings, lines) {
  if (!lines.length) {
    return empty("暂无记录");
  }
  return '<div class="table-scroll" tabindex="0"><table><thead><tr>'+headings.map(h=>'<th scope="col">'+esc(h)+'</th>').join("")+'</tr></thead><tbody>'+
    lines.map(row=>'<tr>'+row.map((cell,i)=>i?'<td>'+cell+'</td>':'<th scope="row">'+cell+'</th>').join("")+'</tr>').join("")+'</tbody></table></div>';
}
function statusFor(repo,key) {
  return statusNames[repo.statuses[key]?.status]??"尚无快照";
}
sourceNames.starHistory = "新增 Star 历史";
sourceNames.jobPerformance = "工作流任务耗时与成功率";
sourceNames.forkHistory = "现存 Fork 创建历史";
function ranking(repo,type,date) {
  const list=repo.ranks[date]?.[type];
  if(!list) {
    return empty("这个采集日期没有排行记录");
  }
  if(!list.length) {
    return empty(type==="paths"?"GitHub 未返回热门页面":"GitHub 未返回来源网站");
  }
  const max=Math.max(1,...list.map(v=>v.count));
  return '<p class="source-note">GitHub 最近 14 天的前十名</p>'+dataTable([type==="paths"?"页面":"来源","浏览次数","独立访客"],list.map(v=>[
    '<span class="ranking-label">'+esc(type==="paths"?(v.title||v.name):v.name)+'</span>'+
    (type==="paths"?'<span class="rank-path">'+esc(v.name)+'</span>':"")+
    '<span class="bar" aria-hidden="true"><i style="width:'+(v.count/max*100)+'%"></i></span>',numeric.format(v.count),numeric.format(v.uniques)]));
}
function codeDetails(repo) {
  const d=repo.details, lang=d.languages?.data, health=d.community?.data;
  let html="<h4>语言分布</h4>";
  if(lang) {
    const all=Object.values(lang).reduce((a,b)=>a+b,0);
    html+=dataTable(["语言","容量","占比"],Object.entries(lang).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[esc(k),display(v,"字节"),all?numeric.format(v/all*100)+"%":"—"]));
  } else {
    html+=empty(statusFor(repo,"languages"));
  }
  html+="<h4>提交时段 · UTC</h4>";
  const hours=d.punchCard?.data;
  if(hours?.length) {
    const values=new Map(hours.map(([day,hour,v])=>[day+"-"+hour,v]));
    const max=Math.max(1,...hours.map(x=>x[2]));
    const weekdays=["日","一","二","三","四","五","六"];
    let content="<span></span>"+Array.from({length:24},(_,i)=>"<span>"+(i%6===0?i:"")+"</span>").join("");
    for(let i=0;i<7;i++) {
      content+="<span>周"+weekdays[i]+"</span>";
      for(let h=0;h<24;h++) {
        const n=values.get(i+"-"+h);
        const label="周"+weekdays[i]+" "+h+" 时 · "+(n==null?"未知":n+" 次提交");
        content+='<i role="img" aria-label="'+label+'" title="'+label+'" style="--level:'+(n==null?0:Math.round(n/max*90))+'%"></i>';
      }
    }
    html+='<div class="heat">'+content+'</div>';
  } else {
    html+=empty(statusFor(repo,"punchCard"));
  }
  const contributors=d.contributors?.data;
  if(contributors?.length) {
    html+='<details class="more"><summary>贡献者提交、增删行数</summary>'+dataTable(["贡献者","提交","新增行","删除行"],[...contributors].sort((a,b)=>b.commits-a.commits).map(p=>[
      esc(p.login??"匿名贡献者"),numeric.format(p.commits),numeric.format(p.weeks.reduce((n,w)=>n+w.a,0)),numeric.format(p.weeks.reduce((n,w)=>n+w.d,0))]))+'</details>';
  }
  if(health) {
    const labels={code_of_conduct:"行为准则",code_of_conduct_file:"行为准则文件",contributing:"贡献指南",issue_template:"Issue 模板",pull_request_template:"PR 模板",license:"许可证",readme:"README"};
    html+='<details class="more"><summary>社区健康度 · '+display(health.health,"%")+'</summary>'+dataTable(["项目文件","状态"],Object.entries(health.files).map(([k,v])=>[esc(labels[k]??k),v?"已配置":"未配置"]))+'</details>';
  }
  return html;
}
function releaseDetails(repo) {
  const d=repo.details, releases=d.releases?.data;
  let html="<h4>版本和附件下载</h4>";
  if(releases?.length) {
    html+=dataTable(["版本","发布日期","附件","累计下载"],releases.map(r=>[esc(r.tag),esc(r.date.slice(0,10)),String(r.assets.length),numeric.format(r.assets.reduce((n,a)=>n+a.downloads,0))]));
    const assets=releases.flatMap(r=>r.assets.map(a=>[esc(r.tag),esc(a.name),display(a.bytes,"字节"),numeric.format(a.downloads)]));
    if(assets.length) {
      html+='<details class="more"><summary>各附件下载量</summary>'+dataTable(["版本","附件","大小","下载"],assets)+'</details>';
    }
  } else {
    html+=empty(releases?"暂无公开版本":statusFor(repo,"releases"));
  }
  if(d.actions) {
    const totals={};
    for(const day of Object.values(d.actions.data.days)) {
      for(const [state,n] of Object.entries(day)) {
        totals[state]=(totals[state]??0)+n;
      }
    }
    const labels={success:"成功",failure:"失败",cancelled:"已取消",skipped:"已跳过",timed_out:"超时",in_progress:"运行中",queued:"排队中",action_required:"需要操作",neutral:"中性"};
    html+="<h4>工作流运行结果</h4>"+dataTable(["状态","次数"],Object.entries(totals).map(([k,v])=>[esc(labels[k]??k),numeric.format(v)]));
  }
  return html;
}
function renderDetails(repos,tab,date) {
  const panel=document.querySelector("#breakdowns");
  panel.className="detail-grid"+(repos.length>1?" compare":"");
  panel.innerHTML=repos.map(repo=>{
    let body;
    if(tab==="referrers"||tab==="paths") {
      body=ranking(repo,tab,date);
    } else if(tab==="code") {
      body=codeDetails(repo);
    } else if(tab==="releases") {
      body=releaseDetails(repo);
    } else {
      body=dataTable(["数据来源","状态","采集日期"],Object.entries(sourceNames).map(([key,title])=>[esc(title),esc(statusFor(repo,key)),esc(repo.statuses[key]?.date??"—")]));
    }
    return '<div class="detail-column">'+(repos.length>1?'<h3>'+esc(nameOf(repo.repository))+'</h3>':"")+body+'</div>';
  }).join("");
}
