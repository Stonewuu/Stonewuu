import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStarSeries,
  parseRepositories,
  renderStarHistorySvg,
} from "../github-star-history.mjs";

test("parseRepositories uses the configured default when the variable is blank", () => {
  assert.deepEqual(parseRepositories("", "Stonewuu/ai-fusion-video"), [
    { fullName: "Stonewuu/ai-fusion-video", owner: "Stonewuu", name: "ai-fusion-video" },
  ]);
});

test("parseRepositories accepts comma, whitespace, and newline separators", () => {
  const repositories = parseRepositories(
    "Stonewuu/ai-fusion-video,Stonewuu/Stonewuu\nStonewuu/ai-fusion-video",
    "unused/default",
  );
  assert.deepEqual(repositories.map((repository) => repository.fullName), [
    "Stonewuu/ai-fusion-video",
    "Stonewuu/Stonewuu",
  ]);
});

test("buildStarSeries aggregates stargazers by UTC day", () => {
  const series = buildStarSeries(
    [
      { starred_at: "2026-01-04T08:00:00Z" },
      { starred_at: "2026-01-02T09:00:00Z" },
      { starred_at: "2026-01-02T18:00:00Z" },
    ],
    "2026-01-01T12:00:00Z",
    "2026-01-05T20:00:00Z",
  );
  assert.deepEqual(series, [
    { timestamp: Date.UTC(2026, 0, 1), count: 0 },
    { timestamp: Date.UTC(2026, 0, 2), count: 2 },
    { timestamp: Date.UTC(2026, 0, 4), count: 3 },
    { timestamp: Date.UTC(2026, 0, 5), count: 3 },
  ]);
});

test("renderStarHistorySvg escapes repository names and renders the total", () => {
  const svg = renderStarHistorySvg({
    repository: "owner/repo&<test>",
    series: [
      { timestamp: Date.UTC(2026, 0, 1), count: 0 },
      { timestamp: Date.UTC(2026, 0, 2), count: 12 },
    ],
    updatedAt: "2026-01-02T12:00:00Z",
  });
  assert.match(svg, /owner\/repo&amp;&lt;test&gt;/);
  assert.match(svg, /★ 12/);
  assert.doesNotMatch(svg, /owner\/repo&<test>/);
});
