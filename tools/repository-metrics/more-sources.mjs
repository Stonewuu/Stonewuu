import { api, allPages, SourceError } from "./api.mjs";

const reactions = ["+1", "-1", "laugh", "hooray", "confused", "heart", "rocket", "eyes"];

async function graphql(repository, query, after) {
  const [owner, name] = repository.split("/");
  const fields = { query, owner, name };
  if (after) {
    fields.after = after;
  }
  const { body } = await api("graphql", { fields });
  if (body.errors?.length) {
    const denied = body.errors.some(e => ["FORBIDDEN", "INSUFFICIENT_SCOPES"].includes(e.type));
    throw new SourceError(denied ? "forbidden" : "unavailable");
  }
  if (!body.data?.repository) {
    throw new SourceError("unavailable");
  }
  return body.data.repository;
}

async function nodes(repository, field, selection) {
  const query = "query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){" +
    field + "(first:50, after:$after){nodes{" + selection + "} pageInfo{hasNextPage endCursor}}}}";
  const result = [];
  let after;
  do {
    const page = (await graphql(repository, query, after))[field];
    result.push(...page.nodes);
    const next = page.pageInfo;
    if (next.hasNextPage && (!next.endCursor || next.endCursor === after)) {
      throw new SourceError("invalid");
    }
    after = next.hasNextPage ? next.endCursor : null;
  } while (after);
  return result;
}

function add(group, key, amount = 1) {
  group[key] = (group[key] ?? 0) + amount;
}

export function participationSummary(items) {
  const values = { issueComments: 0, prComments: 0, issueReactions: 0, prReactions: 0, assignedIssues: 0,
    labeledIssues: 0, milestoneIssues: 0, lockedIssues: 0, completedIssues: 0, declinedIssues: 0, duplicateIssues: 0 };
  const byReaction = Object.fromEntries(reactions.map(k => [k, { issue: 0, pr: 0 }]));
  const labels = new Map();
  for (const item of items) {
    const kind = item.pull_request ? "pr" : "issue";
    values[kind + "Comments"] += item.comments;
    values[kind + "Reactions"] += item.reactions.total_count;
    for (const emoji of reactions) {
      byReaction[emoji][kind] += item.reactions[emoji];
    }
    if (kind === "issue") {
      if (item.locked) {
        values.lockedIssues++;
      }
      if (item.state === "open") {
        values.assignedIssues += Number(item.assignees.length > 0);
        values.labeledIssues += Number(item.labels.length > 0);
        values.milestoneIssues += Number(Boolean(item.milestone));
      } else {
        const reason = { completed: "completedIssues", not_planned: "declinedIssues", duplicate: "duplicateIssues" }[item.state_reason];
        if (reason) {
          values[reason]++;
        }
      }
    }
    for (const label of item.labels) {
      const name = label.name;
      const row = labels.get(name) ?? { name, issue: 0, pr: 0 };
      row[kind]++;
      labels.set(name, row);
    }
  }
  return { values, byReaction, labels: [...labels.values()].sort((a,b) => b.issue+b.pr-a.issue-a.pr || a.name.localeCompare(b.name)) };
}

async function reviews(repository) {
  const rows = await nodes(repository, "pullRequests", [
    "state isDraft createdAt mergedAt additions deletions changedFiles",
    "commits{totalCount} reviewThreads{totalCount} reviews{totalCount} reviewRequests{totalCount}",
    "approved:reviews(states:APPROVED){totalCount} changes:reviews(states:CHANGES_REQUESTED){totalCount}",
    "commented:reviews(states:COMMENTED){totalCount} dismissed:reviews(states:DISMISSED){totalCount}"
  ].join(" "));
  const values = { prLinesAdded: 0, prLinesDeleted: 0, prChangedFiles: 0, prCommitCount: 0, draftOpenPR: 0,
    reviewThreads: 0, submittedReviews: 0, approvalReviews: 0, changeReviews: 0, commentReviews: 0, dismissedReviews: 0, reviewRequests: 0 };
  const days = {};
  for (const row of rows) {
    values.prLinesAdded += row.additions;
    values.prLinesDeleted += row.deletions;
    values.prChangedFiles += row.changedFiles;
    values.prCommitCount += row.commits.totalCount;
    values.draftOpenPR += Number(row.state === "OPEN" && row.isDraft);
    values.reviewThreads += row.reviewThreads.totalCount;
    values.submittedReviews += row.reviews.totalCount;
    values.approvalReviews += row.approved.totalCount;
    values.changeReviews += row.changes.totalCount;
    values.commentReviews += row.commented.totalCount;
    values.dismissedReviews += row.dismissed.totalCount;
    if (row.state === "OPEN") {
      values.reviewRequests += row.reviewRequests.totalCount;
    }
    if (row.mergedAt) {
      const date = row.mergedAt.slice(0,10);
      const bucket = days[date] ??= { mergeSeconds: 0, mergedSamples: 0 };
      bucket.mergeSeconds += (Date.parse(row.mergedAt)-Date.parse(row.createdAt))/1000;
      bucket.mergedSamples++;
    }
  }
  return { values, days };
}

async function discussionMetrics(repository, enabled) {
  if (!enabled) {
    throw new SourceError("disabled");
  }
  const discussions = await nodes(repository, "discussions", "isAnswered closed upvoteCount comments{totalCount} reactions{totalCount}");
  const counts = await graphql(repository, "query($owner:String!,$name:String!){repository(owner:$owner,name:$name){discussionCategories{totalCount} pinnedDiscussions{totalCount}}}");
  const values = { answeredDiscussions: 0, closedDiscussions: 0, discussionVotes: 0, discussionComments: 0, discussionReactions: 0,
    discussionCategories: counts.discussionCategories.totalCount, pinnedDiscussions: counts.pinnedDiscussions.totalCount };
  for (const d of discussions) {
    values.answeredDiscussions += Number(d.isAnswered);
    values.closedDiscussions += Number(d.closed);
    values.discussionVotes += d.upvoteCount;
    values.discussionComments += d.comments.totalCount;
    values.discussionReactions += d.reactions.totalCount;
  }
  return {values};
}

async function manifests(repository) {
  const list = await nodes(repository, "dependencyGraphManifests", "dependenciesCount parseable exceedsMaxSize");
  return {values:{
    manifests: list.length, parseableManifests: list.filter(m=>m.parseable).length,
    oversizedManifests: list.filter(m=>m.exceedsMaxSize).length,
    manifestEntries: list.every(m=>Number.isInteger(m.dependenciesCount)) ? list.reduce((s,m)=>s+m.dependenciesCount,0) : null
  }};
}

export function summarizeBill(document) {
  if (!Array.isArray(document?.packages) || !Array.isArray(document.relationships)) {
    throw new SourceError("invalid");
  }
  const roots = new Set(document.documentDescribes ?? []);
  for (const r of document.relationships) {
    if (r.relationshipType === "DESCRIBES" && r.spdxElementId === document.SPDXID) {
      roots.add(r.relatedSpdxElement);
    }
  }
  const dependencies = document.packages.filter(p=>!roots.has(p.SPDXID));
  const ecosystems = new Map(), licenses = new Map();
  let licensed = 0;
  for (const p of dependencies) {
    const purl = p.externalRefs?.find(r=>r.referenceType === "purl")?.referenceLocator;
    const ecosystem = purl?.match(/^pkg:([^/]+)\//)?.[1] ?? "未标注";
    ecosystems.set(ecosystem,(ecosystems.get(ecosystem)??0)+1);
    const license = [p.licenseConcluded,p.licenseDeclared].find(l=>l && !["NONE","NOASSERTION"].includes(l));
    if (license) {
      licensed++;
      licenses.set(license,(licenses.get(license)??0)+1);
    }
  }
  return {values:{dependencyPackages:dependencies.length,dependencyEcosystems:ecosystems.size,licensedDependencies:licensed,
    dependencyEdges:document.relationships.filter(r=>r.relationshipType==="DEPENDS_ON").length},
    ecosystems:Object.fromEntries(ecosystems),licenses:Object.fromEntries(licenses)};
}

async function dependencyBill(base) {
  const { body } = await api(base + "/dependency-graph/sbom/generate-report");
  const url = new URL(body.sbom_url);
  const prefix = "/" + base.toLowerCase() + "/dependency-graph/sbom/fetch-report/";
  if (url.origin !== "https://api.github.com" || !url.pathname.toLowerCase().startsWith(prefix)) {
    throw new SourceError("invalid");
  }
  const report = (await api(url.pathname.slice(1),{statistics:true})).body;
  return summarizeBill(report.sbom ?? report);
}

const activityFields = { push:"pushes",force_push:"forcePushes",branch_creation:"branchCreates",branch_deletion:"branchDeletes",
  pr_merge:"prMergeActivity",merge_queue_merge:"queueMerges" };
async function activities(base) {
  const rows = await allPages(base + "/activity?per_page=100&time_period=year");
  const days = {}, types = {};
  for (const row of rows) {
    const day = days[row.timestamp.slice(0,10)] ??= {};
    add(day,"gitEvents");
    add(types,row.activity_type);
    if (activityFields[row.activity_type]) {
      add(day,activityFields[row.activity_type]);
    }
  }
  return { days, types };
}
async function reviewComments(base) {
  const comments = await allPages(base+"/pulls/comments?per_page=100");
  const days = {};
  let interactions = 0;
  for (const comment of comments) {
    add(days,comment.created_at.slice(0,10));
    interactions += comment.reactions.total_count;
  }
  return {values:{inlineComments:comments.length,inlineReactions:interactions},days};
}

const manifestsByName = {
  "package.json":"npm", "pom.xml":"Maven", "build.gradle":"Gradle", "build.gradle.kts":"Gradle",
  "pyproject.toml":"Python", "requirements.txt":"Python", "Pipfile":"Python", "go.mod":"Go",
  "Cargo.toml":"Cargo", "Gemfile":"Ruby", "composer.json":"Composer", "Package.swift":"Swift",
  "pubspec.yaml":"Dart", "mix.exs":"Elixir", "packages.config":".NET", "deno.json":"Deno"
};
const lockFiles = new Set(["package-lock.json","npm-shrinkwrap.json","pnpm-lock.yaml","yarn.lock","bun.lock","bun.lockb",
  "Cargo.lock","go.sum","poetry.lock","uv.lock","Pipfile.lock","Gemfile.lock","composer.lock","pubspec.lock","mix.lock","packages.lock.json","Package.resolved"]);

async function fileInventory(base, branch) {
  const { body } = await api(base+"/git/trees/"+encodeURIComponent(branch)+"?recursive=1");
  if (body.truncated) {
    throw new SourceError("partial");
  }
  const values = { trackedFiles:0, trackedFolders:0, trackedBytes:0, largestFile:0, symlinks:0, executableFiles:0,
    trackedManifests:0, lockFiles:0, fileTypes:0 };
  const types = new Map(), ecosystems = new Map();
  for (const entry of body.tree) {
    if (entry.type==="tree") {
      values.trackedFolders++;
    }
    if (entry.type!=="blob") {
      continue;
    }
    values.trackedFiles++;
    values.trackedBytes += entry.size;
    values.largestFile = Math.max(values.largestFile,entry.size);
    values.symlinks += Number(entry.mode==="120000");
    values.executableFiles += Number(entry.mode==="100755");
    const name=entry.path.split("/").at(-1);
    const suffix=name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "无扩展名";
    const type=types.get(suffix)??{name:suffix,files:0,bytes:0};
    type.files++;
    type.bytes+=entry.size;
    types.set(suffix,type);
    const family=Object.hasOwn(manifestsByName,name) ? manifestsByName[name] : /\.(cs|vb|fs)proj$/i.test(name) ? ".NET" : null;
    if (family) {
      values.trackedManifests++;
      ecosystems.set(family,(ecosystems.get(family)??0)+1);
    }
    values.lockFiles+=Number(lockFiles.has(name));
  }
  values.fileTypes=types.size;
  return {values,types:[...types.values()].sort((a,b)=>b.bytes-a.bytes),ecosystems:Object.fromEntries(ecosystems)};
}

export function extraSources(repository, metadata, issueRows) {
  const base = "repos/"+repository;
  return {
    planning: async ()=>{
      const q="query($owner:String!,$name:String!){repository(owner:$owner,name:$name){issues{totalCount} pullRequests{totalCount} pinnedIssues{totalCount} openMilestones:milestones(states:OPEN){totalCount} closedMilestones:milestones(states:CLOSED){totalCount} repositoryTopics{totalCount} submodules{totalCount} commitComments{totalCount}}}";
      const r=await graphql(repository,q);
      return {values:{totalIssues:r.issues.totalCount,totalPR:r.pullRequests.totalCount,pinnedIssues:r.pinnedIssues.totalCount,
        openMilestones:r.openMilestones.totalCount,closedMilestones:r.closedMilestones.totalCount,topicCount:r.repositoryTopics.totalCount,
        submodules:r.submodules.totalCount,commitComments:r.commitComments.totalCount},topics:metadata.topics};
    },
    environments: async ()=>({values:{environments:(await api(base+"/environments?per_page=1")).body.total_count}}),
    files: ()=>fileInventory(base,metadata.default_branch),
    projects: async ()=>{
      const r=await graphql(repository,"query($owner:String!,$name:String!){repository(owner:$owner,name:$name){projectsV2{totalCount}}}");
      return {values:{projectBoards:r.projectsV2.totalCount}};
    },
    branchRules: async ()=>{
      const [branches,rulesets]=await Promise.all([allPages(base+"/branches?protected=true&per_page=100"),allPages(base+"/rulesets?per_page=100")]);
      return {values:{protectedBranches:branches.length,ruleSets:rulesets.length,activeRuleSets:rulesets.filter(r=>r.enforcement==="active").length}};
    },
    engagement: async ()=>participationSummary(await issueRows()),
    reviewMetrics: ()=>reviews(repository),
    reviewComments: ()=>reviewComments(base),
    activity: ()=>activities(base),
    discussionDetail: ()=>discussionMetrics(repository,metadata.has_discussions),
    manifests: ()=>manifests(repository),
    dependencies: ()=>dependencyBill(base),
    packages: async ()=>{
      const r=await graphql(repository,"query($owner:String!,$name:String!){repository(owner:$owner,name:$name){packages{totalCount}}}");
      if (r.packages.totalCount===0) {
        return {values:{registryPackages:0,packageVersions:0},types:{}};
      }
      const items=await nodes(repository,"packages","packageType versions{totalCount}");
      const types={};
      for (const item of items) {
        add(types,item.packageType);
      }
      return {values:{registryPackages:items.length,packageVersions:items.reduce((s,p)=>s+p.versions.totalCount,0)},types};
    },
    publishedAdvisories: async ()=>{
      const items=await allPages(base+"/security-advisories?state=published&per_page=100");
      const severities={};
      for (const item of items) {
        add(severities,item.severity??"unknown");
      }
      return {values:{publishedAdvisories:items.length,criticalAdvisories:severities.critical??0,highAdvisories:severities.high??0,
        moderateAdvisories:severities.medium??0,lowAdvisories:severities.low??0},severities};
    }
  };
}
