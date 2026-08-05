import assert from "node:assert/strict";
import test from "node:test";

import {
  historyToSeries,
  mergeObservation,
  normalizeHistory,
  parseRepositories,
  renderStarHistorySvg,
} from "../github-star-history.mjs";

const repository = {
  fullName: "Stonewuu/ai-fusion-video",
  owner: "Stonewuu",
  name: "ai-fusion-video",
};

test("parseRepositories uses the configured default when the variable is blank", () => {
  assert.deepEqual(parseRepositories("", repository.fullName), [repository]);
});

test("parseRepositories accepts separators and removes duplicates", () => {
  const repositories = parseRepositories(
    "Stonewuu/ai-fusion-video,Stonewuu/Stonewuu\nStonewuu/ai-fusion-video",
    "unused/default",
  );
  assert.deepEqual(repositories.map((item) => item.fullName), [
    "Stonewuu/ai-fusion-video",
    "Stonewuu/Stonewuu",
  ]);
});

test("mergeObservation sorts history and replaces the current day", () => {
  const history = mergeObservation(
    {
      repository: repository.fullName,
      observations: [
        { date: "2026-08-04", count: 10 },
        { date: "2026-08-02", count: 8 },
      ],
    },
    repository,
    { date: "2026-08-04", count: 9 },
  );
  assert.deepEqual(history.observations, [
    { date: "2026-08-02", count: 8 },
    { date: "2026-08-04", count: 9 },
  ]);
});

test("normalizeHistory rejects state for another repository", () => {
  assert.throws(
    () => normalizeHistory({ repository: "other/repo", observations: [] }, repository),
    /belongs to another repository/,
  );
});

test("historyToSeries converts persisted UTC dates", () => {
  assert.deepEqual(
    historyToSeries({
      repository: repository.fullName,
      observations: [
        { date: "2026-08-02", count: 8 },
        { date: "2026-08-04", count: 9 },
      ],
    }),
    [
      { timestamp: Date.UTC(2026, 7, 2), count: 8 },
      { timestamp: Date.UTC(2026, 7, 4), count: 9 },
    ],
  );
});

test("historyToSeries starts one day before the first star", () => {
  assert.deepEqual(
    historyToSeries({
      repository: repository.fullName,
      observations: [
        { date: "2026-03-16", count: 0 },
        { date: "2026-04-17", count: 173 },
        { date: "2026-04-18", count: 237 },
      ],
    }),
    [
      { timestamp: Date.UTC(2026, 3, 16), count: 0 },
      { timestamp: Date.UTC(2026, 3, 17), count: 173 },
      { timestamp: Date.UTC(2026, 3, 18), count: 237 },
    ],
  );
});

test("renderStarHistorySvg escapes names and shows the latest count after a drop", () => {
  const svg = renderStarHistorySvg({
    repository: "owner/repo&<test>",
    series: [
      { timestamp: Date.UTC(2026, 7, 1), count: 12 },
      { timestamp: Date.UTC(2026, 7, 2), count: 10 },
    ],
    updatedAt: "2026-08-02T12:00:00Z",
  });
  assert.match(svg, /owner\/repo&amp;&lt;test&gt;/);
  assert.match(svg, /★ 10/);
  assert.doesNotMatch(svg, /owner\/repo&<test>/);
});
