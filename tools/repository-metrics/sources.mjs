import { api, allPages, SourceError, inBatches } from "./api.mjs";

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

async function actionsStats(base) {
  const runs = await allPages(base + "/actions/runs?per_page=100", "workflow_runs");
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

async function lifecycle(base) {
  const [issues, pulls] = await Promise.all([
    allPages(base + "/issues?state=all&per_page=100"),
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

export async function publicSources(repository) {
  const base = "repos/" + repository;
  const { body: repo } = await api(base);
  if (repo.private || repo.full_name.toLowerCase() !== repository.toLowerCase()) {
    throw new Error("公开统计页只能发布配置中指定的公开仓库。");
  }
  const get = async endpoint => (await api(base + "/" + endpoint)).body;
  const statistic = async name => (await api(base + "/stats/" + name, { statistics: true })).body;
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
    community: async () => {
      const profile = await get("community/profile");
      return { health: profile.health_percentage, files: Object.fromEntries(Object.entries(profile.files).map(([k, v]) => [k, v !== null])) };
    },
    releases: () => releaseStats(base),
    actions: () => actionsStats(base),
    lifecycle: () => lifecycle(base),
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
    }))
  };
  return Object.fromEntries(await inBatches(Object.entries(jobs), 4, async ([key, run]) => [key, await withStatus(run)]));
}

export async function trafficSources(repository, token) {
  const base = "repos/" + repository + "/traffic/";
  const endpoints = { views: "views?per=day", clones: "clones?per=day", referrers: "popular/referrers", paths: "popular/paths" };
  return Object.fromEntries(await inBatches(Object.entries(endpoints), 2, async ([name, url]) => [name, (await api(base + url, { token })).body]));
}
