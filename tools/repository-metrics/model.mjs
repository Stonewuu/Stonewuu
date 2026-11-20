import { extraEntries, ratios } from "./more-metrics.mjs";

const GROUPS = ["仓库流量", "关注与项目", "议题与协作", "代码与贡献", "发布与自动化", "社区与依赖"];
const entries = [
  ["clones","克隆次数",0,"次","sum"],["views","浏览次数",0,"次","sum"],
  ["cloners","独立克隆者",0,"人","peak"],["visitors","独立访客",0,"人","peak"],
  ["windowClones","14 天克隆次数",0,"次"],["windowViews","14 天浏览次数",0,"次"],
  ["windowCloners","14 天独立克隆者",0,"人"],["windowVisitors","14 天独立访客",0,"人"],
  ["stars","Star",1,"个"],["forks","Fork",1,"个"],["watchers","订阅者",1,"人"],["network","Fork 网络仓库",1,"个"],
  ["starAdds","新增 Star",1,"个","sum"],["forkCreated","现存 Fork 创建数",1,"个","sum"],
  ["size","仓库大小",1,"KiB"],["health","社区健康度",1,"%"],["languageCount","编程语言",1,"种"],["languageBytes","语言代码量",1,"字节"],
  ["openIssues","未关闭 Issue",2,"个"],["closedIssues","已关闭 Issue",2,"个"],["openPR","待合并 PR",2,"个"],
  ["mergedPR","已合并 PR",2,"个"],["closedPR","已关闭未合并 PR",2,"个"],["discussions","讨论",2,"个"],
  ["labels","标签分类",2,"个"],["milestones","里程碑",2,"个"],["openItems","待处理 Issue 和 PR",2,"个"],
  ["issueOpened","新建 Issue",2,"个","sum"],["issueClosed","关闭 Issue",2,"个","sum"],
  ["prOpened","新建 PR",2,"个","sum"],["prClosed","关闭 PR（含合并）",2,"个","sum"],["prMerged","合并 PR",2,"个","sum"],
  ["commits","默认分支提交总数",3,"次"],["dailyCommits","提交次数",3,"次","sum"],["contributorCount","贡献者",3,"人"],
  ["branches","分支",3,"个"],["tags","Git 标签",3,"个"],["added","每周新增代码行",3,"行","sum"],["removed","每周删除代码行",3,"行","sum"],
  ["weeklyCommits","每周全部提交",3,"次","sum"],["ownerWeekly","每周仓库所有者提交",3,"次","sum"],
  ["releases","版本发布",4,"个"],["releaseAssets","发布附件",4,"个"],["downloads","发布附件累计下载",4,"次"],
  ["published","新发布版本",4,"个","sum"],["workflows","工作流",4,"个"],["runs","工作流运行",4,"次","sum"],
  ["success","成功运行",4,"次","sum"],["failure","失败运行",4,"次","sum"],["cancelled","取消运行",4,"次","sum"],
  ["deployments","部署记录",4,"个"],["dailyDeploy","新增部署",4,"次","sum"],
  ["cacheCount","Actions 缓存",4,"个"],["cacheBytes","Actions 缓存容量",4,"字节"],
  ["artifactCount","Actions 构件",4,"个"],["artifactBytes","Actions 构件容量",4,"字节"],
  ["jobs","工作流任务",4,"个","sum"],["doneJobs","已完成任务",4,"个","sum"],["passJobs","成功任务",4,"个","sum"],
  ["failJobs","失败任务",4,"个","sum"],["jobSeconds","任务运行总时长",4,"秒","sum"],["queueSeconds","任务等待总时长",4,"秒","sum"],
  ["jobSuccessRate","任务成功率",4,"%","rate"]
];
export const metrics = Object.fromEntries([...entries,...extraEntries].map(([id,label,group,unit,rule = "last"]) => [id,{id,label,group:GROUPS[group],unit,rule}]));
export const metricGroups = GROUPS;
export const dayMs = 86400000;
export const dayTime = str => Date.parse(str + "T00:00:00Z");
export const isoDay = value => new Date(value).toISOString().slice(0,10);
export const validDate = str => typeof str === "string" && /^\d{4}-\d{2}-\d{2}$/.test(str) && Number.isFinite(dayTime(str)) && isoDay(dayTime(str)) === str;
export const rules = {sum:"合计",peak:"单日最高",last:"末次观测",rate:"按完成数加权",weighted:"按样本数加权"};
export const numeric = new Intl.NumberFormat("zh-CN",{maximumFractionDigits:2});
export function display(value, unit, compact = false) {
  if (value == null) {
    return "—";
  }
  if (unit === "秒" || unit === "小时") {
    return numeric.format(value) + " " + unit;
  }
  if (unit === "字节" || unit === "KiB") {
    const bytes = unit === "KiB" ? value * 1024 : value;
    const scale = bytes === 0 ? 0 : Math.min(4, Math.max(0, Math.floor(Math.log(Math.abs(bytes))/Math.log(1024))));
    return numeric.format(bytes/1024**scale) + " " + ["B","KiB","MiB","GiB","TiB"][scale];
  }
  if (compact && Math.abs(value) >= 10000) {
    return numeric.format(value / 10000) + "万";
  }
  return numeric.format(value) + (unit === "%" ? "%" : "");
}

export function groupStart(day, grain) {
  if (grain === "month") {
    return day.slice(0,7) + "-01";
  }
  const time = dayTime(day);
  return grain === "week" ? isoDay(time - new Date(time).getUTCDay()*dayMs) : day;
}

export function combine(prior, value, rule) {
  if (value == null) {
    return prior;
  }
  if (rule === "sum") {
    return (prior ?? 0) + value;
  }
  return rule === "peak" ? Math.max(prior ?? 0, value) : value;
}

export function dataBounds(repositories, selected) {
  let first = "", last = "";
  for (const repository of repositories) {
    for (const [day, data] of Object.entries(repository.days)) {
      if (selected.some(id => data[id] != null)) {
        if (!first || day < first) {
          first = day;
        }
        if (day > last) {
          last = day;
        }
      }
    }
  }
  return {first,last};
}

export function buckets(repositories, selected, start, end, grain) {
  if (!validDate(start) || !validDate(end) || start > end) {
    return {dates:[],series:[]};
  }
  const dates = [];
  const windows = [];
  for (let time = dayTime(start); time <= dayTime(end); time += dayMs) {
    const day = isoDay(time);
    const group = groupStart(day, grain);
    if (dates.at(-1) !== group) {
      dates.push(group);
      windows.push([]);
    }
    windows.at(-1).push(day);
  }
  const series = [];
  for (const id of selected) {
    const metric = metrics[id];
    const ratio = ratios[id];
    for (const repo of repositories) {
      const values = [];
      let total = null;
      let observed = 0;
      let lastDay = null;
      let totalNumerator = 0, totalDenominator = 0;
      for (const window of windows) {
        let value = null;
        let numerator = 0, denominator = 0;
        for (const day of window) {
          const current = repo.days[day]?.[id];
          if (current != null) {
            observed++;
            lastDay = day;
            if (ratio) {
              numerator += repo.days[day][ratio[0]];
              denominator += repo.days[day][ratio[1]];
            } else {
              total = combine(total,current,metric.rule);
              value = combine(value,current,metric.rule);
            }
          }
        }
        if (ratio && denominator) {
          totalNumerator += numerator;
          totalDenominator += denominator;
          value = ratio[2]*numerator/denominator;
          total = ratio[2]*totalNumerator/totalDenominator;
        }
        values.push(value);
      }
      series.push({id,repository:repo.repository,metric,values,total,observed,lastDay});
    }
  }
  return {dates,series};
}
