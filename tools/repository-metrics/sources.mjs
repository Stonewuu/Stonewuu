import { api, allPages, SourceError, inBatches } from "./api.mjs";
import { extraSources } from "./more-sources.mjs";

const issueQuery = [
  "query($owner:String!, $name:String!) { repository(owner:$owner,name:$name) {",
  "openIssues:issues(states:OPEN){totalCount} closedIssues:issues(states:CLOSED){totalCount}",
  "openPR:pullRequests(states:OPEN){totalCount} closedPR:pullRequests(states:CLOSED){totalCount}",
  "mergedPR:pullRequests(states:MERGED){totalCount} branches:refs(refPrefix:\"refs/heads/\"){totalCount}",
  "tags:refs(refPrefix:\"refs/tags/\"){totalCount} milestones:milestones{totalCount} labels{totalCount}",
  "defaultBranchRef{target{... on Commit{history{totalCount}}}} } }"
].join(" ");

function tally(rows, key) {
  const result = {};
  for (const row of rows) {
    const name = row[key];
    result[name] = (result[name] ?? 0) + 1;
  }
  return result;
}

async function issueStats(repository) {
  const [owner, name] = repository.split("/");
  const { body } = await api("graphql", { fields: { query: issueQuery, owner, name } });
  if (body.errors?.length || !body.data?.repository) {
    throw new SourceError("unavailable");
  }
  const { defaultBranchRef, ...connections } = body.data.repository;
  return { ...Object.fromEntries(Object.entries(connections).map(([k, v]) => [k, v.totalCount])), commits: defaultBranchRef?.target.history.totalCount ?? 0 };
}

async function releaseStats(base) {
  const releases = (await allPages(base + "/releases?per_page=100")).filter(r => !r.draft);
  return inBatches(releases, 3, async release => {
    const assets = release.assets.length >= 30 ? await allPages(base + "/releases/" + release.id + "/assets?per_page=100") : release.assets;
    return {
      tag: release.tag_name, date: release.published_at, prerelease: release.prerelease,
      assets: assets.map(a => ({ name: a.name, bytes: a.size, downloads: a.download_count }))
    };
  });
}

async function actionsStats(base, runs) {
  const workflows = await allPages(base + "/actions/workflows?per_page=100", "workflows");
  const days = {};
  for (const run of runs) {
    const day = run.created_at.slice(0, 10);
    const status = run.conclusion ?? run.status;
    const row = days[day] ??= {};
    row[status] = (row[status] ?? 0) + 1;
  }
  return { days, runs: runs.length, states: tally(workflows, "state"), workflows: workflows.length };
}

async function jobPerformance(base, runs, previous = {}) {
  const cached = previous.completed ?? {};
  const completed = {};
  const days = {};
  await inBatches(runs, 3, async run => {
    const key = run.id + "-" + run.run_attempt;
    let totals = cached[key];
    if (!totals) {
      const jobs = await allPages(base + "/actions/runs/" + run.id + "/jobs?filter=all&per_page=100", "jobs");
      totals = {};
      for (const job of jobs) {
        const date = (job.started_at ?? job.created_at ?? run.created_at).slice(0, 10);
        const row = totals[date] ??= { jobs: 0, doneJobs: 0, passJobs: 0, failJobs: 0, seconds: 0, wait: 0, timed: 0, waited: 0 };
        row.jobs++;
        if (job.status === "completed") {
          row.doneJobs++;
          row.passJobs += Number(job.conclusion === "success");
          row.failJobs += Number(job.conclusion === "failure");
        }
        if (job.started_at && job.completed_at) {
          row.seconds += Math.max(0, (Date.parse(job.completed_at) - Date.parse(job.started_at)) / 1000);
          row.timed++;
        }
        if (job.created_at && job.started_at) {
          row.wait += Math.max(0, (Date.parse(job.started_at) - Date.parse(job.created_at)) / 1000);
          row.waited++;
        }
      }
    }
    if (run.status === "completed") {
      completed[key] = totals;
    }
    for (const [date, stats] of Object.entries(totals)) {
      const day = days[date] ??= {};
      for (const [field,count] of Object.entries(stats)) {
        day[field] = (day[field] ?? 0) + count;
      }
    }
  });
  return { days, completed };
}

async function lifecycle(base, issueList) {
  const [issues, pulls] = await Promise.all([
    issueList(),
    allPages(base + "/pulls?state=all&per_page=100")
  ]);
  const days = {};
  function add(timestamp, metric) {
    if (timestamp) {
      const row = days[timestamp.slice(0, 10)] ??= {};
      row[metric] = (row[metric] ?? 0) + 1;
    }
  }
  for (const issue of issues) {
    if (!issue.pull_request) {
      add(issue.created_at, "issueOpened");
      add(issue.closed_at, "issueClosed");
      if (issue.closed_at) {
        const bucket = days[issue.closed_at.slice(0,10)];
        bucket.issueCloseSeconds = (bucket.issueCloseSeconds ?? 0) +
          (Date.parse(issue.closed_at)-Date.parse(issue.created_at))/1000;
      }
    }
  }
  for (const pr of pulls) {
    add(pr.created_at, "prOpened");
    add(pr.closed_at, "prClosed");
    add(pr.merged_at, "prMerged");
  }
  return days;
}

async function withStatus(run) {
  try {
    return { status: "ready", data: await run() };
  } catch (error) {
    if (!(error instanceof SourceError)) {
      throw error;
    }
    return { status: error.status, httpStatus: error.httpStatus };
  }
}

export async function publicSources(repository, previousJobs) {
  const base = "repos/" + repository;
  const { body: repo } = await api(base);
  if (repo.private || repo.full_name.toLowerCase() !== repository.toLowerCase()) {
    throw new Error("公开统计页只能发布配置中指定的公开仓库。");
  }
  const get = async endpoint => (await api(base + "/" + endpoint)).body;
  const statistic = async name => (await api(base + "/stats/" + name, { statistics: true })).body;
  let runs;
  const workflowRuns = () => runs ??= allPages(base + "/actions/runs?per_page=100", "workflow_runs");
  let issues;
  const issueRows = () => issues ??= allPages(base + "/issues?state=all&per_page=100");
  const jobs = {
    repository: async () => ({
      stars: repo.stargazers_count, forks: repo.forks_count, watchers: repo.subscribers_count,
      size: repo.size, openItems: repo.open_issues_count, network: repo.network_count,
      language: repo.language, license: repo.license?.spdx_id ?? null, defaultBranch: repo.default_branch,
      createdAt: repo.created_at, pushedAt: repo.pushed_at
    }),
    collaboration: () => issueStats(repository),
    discussions: async () => {
      if (!repo.has_discussions) {
        throw new SourceError("disabled");
      }
      const [owner, name] = repository.split("/");
      const query = "query($owner:String!, $name:String!){repository(owner:$owner,name:$name){discussions{totalCount}}}";
      const { body } = await api("graphql", { fields: { query, owner, name } });
      if (body.errors?.length || !body.data?.repository?.discussions) {
        throw new SourceError("unavailable");
      }
      return body.data.repository.discussions.totalCount;
    },
    languages: () => get("languages"),
    starHistory: () => allPages(base + "/stargazers/history?per_page=30"),
    forkHistory: async () => {
      const forks = await allPages(base + "/forks?per_page=100");
      return tally(forks.map(fork => ({ day: fork.created_at.slice(0, 10) })), "day");
    },
    community: async () => {
      const profile = await get("community/profile");
      return { health: profile.health_percentage, files: Object.fromEntries(Object.entries(profile.files).map(([k, v]) => [k, v !== null])) };
    },
    releases: () => releaseStats(base),
    actions: async () => actionsStats(base, await workflowRuns()),
    jobPerformance: async () => jobPerformance(base, await workflowRuns(), previousJobs),
    lifecycle: () => lifecycle(base, issueRows),
    contributorCount: async () => (await allPages(base + "/contributors?anon=true&per_page=100")).length,
    actionsCache: async () => {
      const cache = await get("actions/cache/usage");
      return { count: cache.active_caches_count, bytes: cache.active_caches_size_in_bytes };
    },
    deployments: async () => {
      const deployments = await allPages(base + "/deployments?per_page=100");
      return { count: deployments.length, days: tally(deployments.map(d => ({ day: d.created_at.slice(0, 10) })), "day") };
    },
    artifacts: async () => {
      const artifacts = await allPages(base + "/actions/artifacts?per_page=100", "artifacts");
      return { count: artifacts.length, bytes: artifacts.reduce((sum, a) => sum + a.size_in_bytes, 0) };
    },
    commitActivity: () => statistic("commit_activity"),
    codeFrequency: () => statistic("code_frequency"),
    participation: () => statistic("participation"),
    punchCard: () => statistic("punch_card"),
    contributors: async () => (await statistic("contributors") ?? []).map(person => ({
      login: person.author?.login ?? null, commits: person.total, weeks: person.weeks
    })),
    ...extraSources(repository, repo, issueRows)
  };
  return Object.fromEntries(await inBatches(Object.entries(jobs), 4, async ([key, run]) => [key, await withStatus(run)]));
}

export async function trafficSources(repository, token) {
  const base = "repos/" + repository + "/traffic/";
  const endpoints = { views: "views?per=day", clones: "clones?per=day", referrers: "popular/referrers", paths: "popular/paths" };
  return Object.fromEntries(await inBatches(Object.entries(endpoints), 2, async ([name, url]) => [name, (await api(base + url, { token })).body]));
}
