import { test } from "node:test";
import assert from "node:assert/strict";
import { newArchive } from "./archive.mjs";
import { prepare } from "./prepare.mjs";
import { buckets } from "./model.mjs";
import { participationSummary, summarizeBill } from "./more-sources.mjs";

test("倒序返回的 Star 日历和现存 Fork 按创建日回算，原始观测仍保留缺口",()=>{
  const repo="a/lib",date="2026-11-10";
  const w=iso=>Date.parse(iso+"T00:00:00Z")/1000;
  const data=prepare(repo,newArchive(repo),[{repository:repo,date,sources:{
    repository:{status:"ready",data:{createdAt:"2026-11-05T10:00:00Z",stars:5,forks:2}},
    starHistory:{status:"ready",data:[
      {week:w("2026-11-08"),days:[1,0,1,0,0,0,0]},{week:w("2026-11-01"),days:[0,0,0,0,2,0,1]}]},
    forkHistory:{status:"ready",data:{"2026-11-07":1,"2026-11-10":1}}
  }}],null);
  assert.equal(data.days["2026-11-07"].starHistoryTotal,3);
  assert.equal(data.days[date].starHistoryTotal,5);
  assert.equal(data.days["2026-11-06"].forkHistoryTotal,0);
  assert.equal(data.days[date].forkHistoryTotal,2);
  assert.equal(data.days["2026-11-07"].stars,undefined);
  assert.equal(data.days["2026-11-11"],undefined);
});

test("平均耗时使用各期实际样本数，缺少权重的一天不能计为零耗时",()=>{
  const repo={repository:"a/lib",days:{
    "2026-11-06":{issueCloseHours:1,issueCloseSeconds:3600,issueClosed:1},
    "2026-11-07":{issueCloseHours:3,issueCloseSeconds:32400,issueClosed:3},
    "2026-11-08":{issueClosed:2}
  }};
  const sample=buckets([repo],["issueCloseHours"],"2026-11-06","2026-11-08","month").series[0];
  assert.equal(sample.total,2.5);
  assert.deepEqual(sample.values,[2.5]);
  assert.equal(sample.observed,2);
});

test("Issue 列表中的 PR 评论和表情分开统计，标签名按原文保留",()=>{
  const reactions={total_count:1,"+1":1,"-1":0,laugh:0,hooray:0,confused:0,heart:0,rocket:0,eyes:0};
  const item={state:"open",labels:[{name:"toString"}],assignees:[],milestone:null,comments:2,locked:false,reactions};
  const stats=participationSummary([item,{...item,pull_request:{},comments:3}]);
  assert.equal(stats.values.issueComments,2);
  assert.equal(stats.values.prComments,3);
  assert.deepEqual(stats.labels,[{name:"toString",issue:1,pr:1}]);
  assert.deepEqual(stats.byReaction["+1"],{issue:1,pr:1});
});

test("软件包统计排除仓库自身，并区分依赖包、许可证和关系数量",()=>{
  const bill={SPDXID:"doc",packages:[{SPDXID:"root"},{SPDXID:"dependency",licenseDeclared:"MIT",
    externalRefs:[{referenceType:"purl",referenceLocator:"pkg:npm/project@1"}]}],
    relationships:[{spdxElementId:"doc",relationshipType:"DESCRIBES",relatedSpdxElement:"root"},
      {spdxElementId:"root",relationshipType:"DEPENDS_ON",relatedSpdxElement:"dependency"}]};
  assert.deepEqual(summarizeBill(bill).values,{dependencyPackages:1,dependencyEcosystems:1,licensedDependencies:1,dependencyEdges:1});
});
