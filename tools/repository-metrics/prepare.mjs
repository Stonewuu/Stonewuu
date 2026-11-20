import { isoDay, dayTime, dayMs, metrics } from "./model.mjs";
import { validateArchive } from "./archive.mjs";

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
    for (const week of starWeeks ?? []) {
      week.days.forEach((count,i)=>{
        const day=isoDay(week.week*1000+i*dayMs);
        if (day<=date && (!birth || day>=birth)) {
          value(day,"starAdds",count);
        }
      });
    }
    const forks = data("forkHistory");
    if (forks) {
      calendar(birth,date,d=>value(d,"forkCreated",forks[d]??0));
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
      });
    }
    const runs = data("actions");
    if (runs) {
      value(date,"workflows",runs.workflows);
      const first=Object.keys(runs.days).sort()[0] ?? date;
      calendar(first,date,d=>{
        const states = runs.days[d] ?? {};
        totals(d,{runs:Object.values(states).reduce((a,b)=>a+b,0),success:states.success??0,failure:states.failure??0,cancelled:states.cancelled??0});
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
        totals(d,{jobs:day?.jobs??0,doneJobs:day?.doneJobs??0,passJobs:day?.passJobs??0,failJobs:day?.failJobs??0,
          jobSeconds:!day||day.timed?day?.seconds??0:null,queueSeconds:!day||day.waited?day?.wait??0:null,
          jobSuccessRate:day?.doneJobs?100*day.passJobs/day.doneJobs:null});
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
      totals(isoDay(t*1000),{added:add,removed:Math.abs(del)});
    }
    data("punchCard");
    data("contributors");
    const referrers = data("referrers");
    const paths = data("paths");
    if (referrers || paths) {
      ranks[date] = { referrers: referrers ?? null, paths: paths ?? null };
    }
  }
  return {repository, days:Object.fromEntries(Object.entries(table).sort(([a],[b])=>a.localeCompare(b))),
    window:history.snapshots.at(-1)??null,updated:observations.at(-1)?.date??null,ranks,details,statuses};
}
