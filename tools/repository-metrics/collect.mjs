import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { mergeTraffic, newArchive } from "./archive.mjs";
import { publicSources, trafficSources } from "./sources.mjs";
import { publicSourceName } from "./referrers.mjs";

const [scope, output, sourceDir] = process.argv.slice(2);
if (!["public", "traffic", "import-traffic"].includes(scope) || !output || (scope === "import-traffic" && !sourceDir)) {
  throw new Error("用法：node collect.mjs public|traffic 归档目录，或 import-traffic 归档目录 接口数据目录");
}
const repositories = JSON.parse(await readFile(new URL("./repositories.json", import.meta.url), "utf8"));
const observedOn = new Date().toISOString().slice(0, 10);

async function readOptional(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function save(file, data) {
  const temp = file + "." + randomUUID() + ".tmp";
  await writeFile(temp, JSON.stringify(data) + "\n");
  await rename(temp, file);
}

async function imported(repository) {
  const folder = path.join(sourceDir, repository.split("/")[1]);
  const keys = ["clones", "views", "referrers", "paths"];
  const values = await Promise.all(keys.map(async k => JSON.parse(await readFile(path.join(folder, k + ".json"), "utf8"))));
  return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
}

function ranks(rows, label) {
  if (!Array.isArray(rows) || rows.some(row => typeof row[label] !== "string" ||
      !Number.isSafeInteger(row.count) || !Number.isSafeInteger(row.uniques) || row.uniques < 0 || row.uniques > row.count)) {
    throw new Error("GitHub 流量排行数据无效。");
  }
  return rows.map(row => ({
    name: label === "referrer" ? publicSourceName(row[label]) : row[label],
    ...(label === "path" ? { title: row.title ?? "" } : {}), count: row.count, uniques: row.uniques
  }));
}

async function collect(repository) {
  const root = path.join(output, ...repository.split("/"));
  const folder = path.join(root, "observations");
  await mkdir(folder, { recursive: true });
  const file = path.join(folder, observedOn + ".json");
  const prior = await readOptional(file);
  const observation = prior ?? { date: observedOn, repository, sources: {} };
  if (observation.date !== observedOn || observation.repository !== repository) {
    throw new Error("已有快照与采集日期或仓库不匹配。");
  }
  if (scope === "public") {
    let pastJobs=observation.sources.jobPerformance?.data;
    if (!pastJobs) {
      const earlier=(await readdir(folder)).filter(name=>/^\d{4}-\d{2}-\d{2}\.json$/.test(name) && name<observedOn+".json").sort().at(-1);
      if (earlier) {
        const last=await readOptional(path.join(folder,earlier));
        pastJobs=last?.sources.jobPerformance?.data;
      }
    }
    const sources = await publicSources(repository, pastJobs);
    for (const [name, value] of Object.entries(sources)) {
      const old = observation.sources[name];
      observation.sources[name] = old?.status === "ready" && value.status !== "ready" ? { ...old, lastAttempt: value.status } : value;
    }
    console.log(repository, Object.entries(sources).map(([name, state]) => name + "=" + state.status).join(" "));
    await save(file, observation);
    if (Object.values(sources).some(source => ["network", "error", "limited", "invalid"].includes(source.status))) {
      throw new Error("部分 GitHub 统计未能读取，已保留本次取得的数据。");
    }
    return;
  }
  if (scope === "traffic" && process.env.GITHUB_ACTIONS && !process.env.TRAFFIC_READ_TOKEN) {
    throw new Error("请在个人资料仓库的 Actions Secrets 中设置 TRAFFIC_READ_TOKEN。");
  }
  const raw = scope === "import-traffic" ? await imported(repository) : await trafficSources(repository, process.env.TRAFFIC_READ_TOKEN);
  const historyFile = path.join(root, "history.json");
  const previous = await readOptional(historyFile);
  const history = mergeTraffic(previous ?? newArchive(repository), repository, observedOn, raw);
  observation.sources.referrers = { status: "ready", data: ranks(raw.referrers, "referrer") };
  observation.sources.paths = { status: "ready", data: ranks(raw.paths, "path") };
  await save(historyFile, history);
  await save(file, observation);
  console.log(repository, history.days.length + " 个有流量记录的日期");
}

for (const repository of repositories) {
  try {
    await collect(repository);
  } catch (error) {
    console.error(repository + " · " + error.message);
    process.exitCode = 1;
  }
}
