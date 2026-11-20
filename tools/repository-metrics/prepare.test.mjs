import { test } from "node:test";
import assert from "node:assert/strict";
import { prepare } from "./prepare.mjs";
import { newArchive } from "./archive.mjs";
import { publicSourceName } from "./referrers.mjs";

const repo = "example/project";

test("公开排行保留来源的访问数字，历史排行和最新详情使用同一个公开名称", () => {
  const traffic = newArchive(repo);
  const source = { name: "192.168.1.20", count: 7, uniques: 4 };
  const obs = { date: "2026-11-20", repository: repo, sources: { referrers: { status: "ready", data: [source] } } };
  const result = prepare(repo, traffic, [obs], null);
  const expected = [{ name: "内网来源", count: 7, uniques: 4 }];
  assert.deepEqual(result.ranks[obs.date].referrers, expected);
  assert.deepEqual(result.details.referrers.data, expected);
  assert.equal(publicSourceName("github.com"), "github.com");
});

test("公共指标从可观测日期写入，GitHub 周日历的未来补位不计入图表", () => {
  const date = "2026-11-18";
  const week = Date.parse("2026-11-15T00:00:00Z") / 1000;
  const obs = { date, repository: repo, sources: {
    repository: { status: "ready", data: { createdAt: "2026-11-16T04:01:00Z", stars: 5 } },
    starHistory: { status: "ready", data: [{ week, days: [0, 2, 0, 3, 0, 0, 0] }] },
    jobPerformance: { status: "ready", data: {
      days: { [date]: { jobs: 4, doneJobs: 3, passJobs: 2, failJobs: 1, seconds: 18, timed: 3, waited: 0 } },
      completed: { "11-2": {} }
    }}
  }};
  const result = prepare(repo, newArchive(repo), [obs], null);
  assert.equal(result.days["2026-11-15"], undefined);
  assert.equal(result.days["2026-11-19"], undefined);
  assert.equal(result.days["2026-11-17"].starAdds, 0);
  assert.equal(result.days["2026-11-17"].stars, undefined);
  assert.equal(result.days[date].stars, 5);
  assert.equal(result.days[date].jobSuccessRate, 100 * 2 / 3);
  assert.equal(result.days[date].queueSeconds, undefined);
  assert.equal(result.details.jobPerformance.data.completed, undefined);
});
