import {test} from "node:test";
import assert from "node:assert/strict";
import {buckets,dataBounds,groupStart} from "./model.mjs";

const first={repository:"a/one",days:{
  "2026-10-31":{clones:4,cloners:3,stars:8},"2026-11-01":{clones:0,cloners:0,stars:9},
  "2026-11-03":{clones:6,cloners:2,stars:12}
}};
const second={repository:"a/two",days:{"2026-11-01":{clones:3},"2026-11-02":{clones:7}}};
test("按月分别累计次数、取单日最高人数和末次 Star，不用零填补缺失指标",()=>{
  const r=buckets([first,second],["clones","cloners","stars"],"2026-10-31","2026-11-03","month");
  assert.deepEqual(r.dates,["2026-10-01","2026-11-01"]);
  assert.deepEqual(r.series.map(s=>s.values),[[4,6],[null,10],[3,2],[null,null],[8,12],[null,null]]);
  assert.deepEqual(r.series.map(s=>s.total),[10,10,3,null,12,null]);
});
test("比较仓库共享日期轴，并保留真实零值和无记录的区别",()=>{
  const r=buckets([first,second],["clones"],"2026-11-01","2026-11-03","day");
  assert.deepEqual(r.series[0].values,[0,null,6]);
  assert.deepEqual(r.series[1].values,[3,7,null]);
  assert.deepEqual(dataBounds([first,second],["stars"]),{first:"2026-10-31",last:"2026-11-03"});
});
test("跨年周归入同一个 UTC 周日，区间汇总只包含选中的日期",()=>{
  assert.equal(groupStart("2027-01-01","week"),"2026-12-27");
  assert.equal(buckets([first],["clones"],"2026-11-01","2026-11-01","week").series[0].total,0);
});

test("成功率按完成任务数加权，零成功与没有已完成任务是不同状态",()=>{
  const repo={repository:"a/ci",days:{
    "2026-11-01":{passJobs:1,doneJobs:1,jobSuccessRate:100},
    "2026-11-02":{passJobs:0,doneJobs:3,jobSuccessRate:0},
    "2026-11-03":{passJobs:0,doneJobs:0}
  }};
  const sample=buckets([repo],["jobSuccessRate"],"2026-11-01","2026-11-03","month").series[0];
  assert.deepEqual(sample.values,[25]);
  assert.equal(sample.total,25);
});
