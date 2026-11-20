import { isoDay, dayTime, dayMs, metrics } from "./model.mjs";
import { validateArchive } from "./archive.mjs";
import { additionalSourceNames, ratios } from "./more-metrics.mjs";

const lifeKeys = ["issueOpened","issueClosed","prOpened","prClosed","prMerged"];

export function prepare(repository, history, observations, starHistory) {
  validateArchive(history, repository);
  const table = {};
  function value(date, id, v) {
    if (Number.isFinite(v)) {
      (table[date] ??= {})[id] = v;
    }
  }
  function totals(date, values) {
    for (const [k,v] of Object.entries(values)) {
      if (metrics[k]) {
        value(date,k,v);
      }
    }
  }
  function calendar(from, until, visit) {
    if (!from) {
      return;
    }
    for (let t=dayTime(from); t<=dayTime(until); t+=dayMs) {
      visit(isoDay(t));
    }
  }
  if (starHistory) {
    if (starHistory.repository !== repository || !Array.isArray(starHistory.observations)) {
      throw new Error("Star 历史所属仓库无效。");
    }
    for (const row of starHistory.observations) {
      value(row.date,"stars",row.count);
    }
  }
  for (const row of history.days) {
    totals(row.date,{clones:row.clones?.count,cloners:row.clones?.uniques,views:row.views?.count,visitors:row.views?.uniques});
  }
  for (const snap of history.snapshots) {
    totals(snap.observedOn,{windowClones:snap.clones.count,windowCloners:snap.clones.uniques,windowViews:snap.views.count,windowVisitors:snap.views.uniques});
  }
  const ranks = {};
  const details = {};
  const statuses = {};
  let birth;
  for (const obs of observations) {
    if (obs.repository !== repository) {
      throw new Error("快照所属仓库无效。");
    }
    const date = obs.date;
    function data(key) {
      const source = obs.sources[key];
      if (!source) {
        return undefined;
      }
      statuses[key] = {status:source.lastAttempt ?? source.status, date};
      if (source.status === "ready") {
        details[key] = {date,data:source.data};
        return source.data;
      }
    }
    const meta = data("repository");
    if (meta) {
      birth = meta.createdAt.slice(0,10);
      totals(date,meta);
    }
    const starWeeks = data("starHistory");
    let starTotal=0;
    for (const week of [...(starWeeks ?? [])].sort((a,b)=>a.week-b.week)) {
      week.days.forEach((count,i)=>{
        const day=isoDay(week.week*1000+i*dayMs);
        if (day<=date && (!birth || day>=birth)) {
          value(day,"starAdds",count);
          starTotal+=count;
          value(day,"starHistoryTotal",starTotal);
        }
      });
    }
    const forks = data("forkHistory");
    if (forks) {
      let forkTotal=0;
      calendar(birth,date,d=>{
        const created=forks[d]??0;
        forkTotal+=created;
        value(d,"forkCreated",created);
        value(d,"forkHistoryTotal",forkTotal);
      });
    }
    const collaboration = data("collaboration");
    if (collaboration) {
      totals(date,collaboration);
    }
    value(date,"discussions",data("discussions"));
    value(date,"contributorCount",data("contributorCount"));
    value(date,"health",data("community")?.health);
    const lang = data("languages");
    if (lang) {
      totals(date,{languageCount:Object.keys(lang).length,languageBytes:Object.values(lang).reduce((a,b)=>a+b,0)});
    }
    const releases = data("releases");
    if (releases) {
      const assets = releases.flatMap(r=>r.assets);
      totals(date,{releases:releases.length,releaseAssets:assets.length,downloads:assets.reduce((a,b)=>a+b.downloads,0)});
      totals(date,{stableReleases:releases.filter(r=>!r.prerelease).length,prereleases:releases.filter(r=>r.prerelease).length,
        releaseBytes:assets.reduce((n,a)=>n+a.bytes,0),downloadedAssets:assets.filter(a=>a.downloads>0).length});
      const byDate = {};
      for (const release of releases) {
        const d=release.date.slice(0,10);
        byDate[d]=(byDate[d]??0)+1;
      }
      calendar(birth,date,d=>value(d,"published",byDate[d]??0));
    }
    const lifecycle = data("lifecycle");
    if (lifecycle) {
      calendar(birth,date,d=>{
        for (const key of lifeKeys) {
          value(d,key,lifecycle[d]?.[key]??0);
        }
        value(d,"issueCloseSeconds",lifecycle[d]?.issueCloseSeconds);
      });
    }
    const runs = data("actions");
    if (runs) {
      value(date,"workflows",runs.workflows);
      const active=runs.states.active??0;
      totals(date,{activeWorkflows:active,inactiveWorkflows:runs.workflows-active});
      const first=Object.keys(runs.days).sort()[0] ?? date;
      calendar(first,date,d=>{
        const states = runs.days[d] ?? {};
        totals(d,{runs:Object.values(states).reduce((a,b)=>a+b,0),success:states.success??0,failure:states.failure??0,cancelled:states.cancelled??0});
        const completed=["success","failure","timed_out","neutral","cancelled","skipped","stale","action_required","startup_failure"]
          .reduce((count,outcome)=>count+(states[outcome]??0),0);
        totals(d,{completedRuns:completed,skippedRuns:states.skipped??0,timedOutRuns:states.timed_out??0,neutralRuns:states.neutral??0});
      });
    }
    const deployments = data("deployments");
    const performance = data("jobPerformance");
    if (performance) {
      // 每个运行的缓存留在归档分支，页面只需要按日期汇总的结果。
      details.jobPerformance.data = { days: performance.days };
      const first=Object.keys(performance.days).sort()[0] ?? date;
      calendar(first,date,d=>{
        const day=performance.days[d];
        value(d,"timedJobs",day?.timed??0);
        value(d,"waitedJobs",day?.waited??0);
        totals(d,{jobs:day?.jobs??0,doneJobs:day?.doneJobs??0,passJobs:day?.passJobs??0,failJobs:day?.failJobs??0,
          jobSeconds:!day||day.timed?day?.seconds??0:null,queueSeconds:!day||day.waited?day?.wait??0:null});
      });
    }
    if (deployments) {
      value(date,"deployments",deployments.count);
      calendar(birth,date,d=>value(d,"dailyDeploy",deployments.days[d]??0));
    }
    const cache = data("actionsCache");
    const artifacts = data("artifacts");
    totals(date,{cacheCount:cache?.count,cacheBytes:cache?.bytes,artifactCount:artifacts?.count,artifactBytes:artifacts?.bytes});
    const weeks = data("commitActivity");
    if (weeks) {
      for (const week of weeks) {
        week.days.forEach((count,i)=>{
          const day=isoDay(week.week*1000 + i*dayMs);
          if (day <= date && (!birth || day >= birth)) {
            value(day,"dailyCommits",count);
          }
        });
      }
    }
    const participation = data("participation");
    if (participation) {
      const end=dayTime(date)-new Date(dayTime(date)).getUTCDay()*dayMs;
      participation.all.forEach((count,i)=>{
        const d=isoDay(end - (participation.all.length-1-i)*7*dayMs);
        if (!birth || d>=isoDay(dayTime(birth)-6*dayMs)) {
          totals(d,{weeklyCommits:count,ownerWeekly:participation.owner[i]});
        }
      });
    }
    const frequency = data("codeFrequency");
    for (const [t,add,del] of frequency ?? []) {
      totals(isoDay(t*1000),{added:add,removed:Math.abs(del),netLines:add-Math.abs(del)});
    }
    data("punchCard");
    data("contributors");
    const referrers = data("referrers");
    const paths = data("paths");
    if (referrers || paths) {
      ranks[date] = { referrers: referrers ?? null, paths: paths ?? null };
    }
    for (const source of Object.keys(additionalSourceNames)) {
      const item=data(source);
      if (!item) {
        continue;
      }
      if (item.values) {
        totals(date,item.values);
      }
      if (source==="activity") {
        const first=Object.keys(item.days).sort()[0]??date;
        calendar(first,date,day=>{
          for (const field of ["gitEvents","pushes","forcePushes","branchCreates","branchDeletes","prMergeActivity","queueMerges"]) {
            value(day,field,item.days[day]?.[field]??0);
          }
        });
      } else if (source==="reviewMetrics") {
        for (const [day,bucket] of Object.entries(item.days)) {
          value(day,"mergeSeconds",bucket.mergeSeconds);
          value(day,"mergedSamples",bucket.mergedSamples);
        }
      } else if (source==="reviewComments") {
        calendar(birth,date,day=>value(day,"newInlineComments",item.days[day]??0));
      }
    }
  }
  for (const [day,fields] of Object.entries(table)) {
    const previous=table[isoDay(dayTime(day)-dayMs)];
    for (const [metric,change] of [["stars","starChange"],["forks","forkChange"],["watchers","watcherChange"]]) {
      if (fields[metric]!=null && previous?.[metric]!=null) {
        value(day,change,fields[metric]-previous[metric]);
      }
    }
    for (const [id,[numerator,denominator,factor]] of Object.entries(ratios)) {
      if (fields[denominator]>0 && fields[numerator]!=null) {
        value(day,id,factor*fields[numerator]/fields[denominator]);
      }
    }
  }
  return {repository, days:Object.fromEntries(Object.entries(table).sort(([a],[b])=>a.localeCompare(b))),
    window:history.snapshots.at(-1)??null,updated:observations.at(-1)?.date??null,ranks,details,statuses};
}
