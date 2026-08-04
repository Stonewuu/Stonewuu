import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const GITHUB_API_ROOT = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const MAX_REPOSITORIES = 20;
const REPOSITORY_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]+$/;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

function requiredValue(value, name) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function validateRepository(repository) {
  const normalized = repository.trim();
  if (!REPOSITORY_PATTERN.test(normalized)) {
    throw new Error(`Invalid repository '${repository}'; expected owner/repository`);
  }
  const [owner, name] = normalized.split("/");
  if (name === "." || name === "..") {
    throw new Error(`Invalid repository name '${name}'`);
  }
  return { fullName: `${owner}/${name}`, owner, name };
}

export function parseRepositories(value, defaultRepository) {
  const configured = value?.split(/[\s,]+/).filter(Boolean) ?? [];
  const items = configured.length
    ? configured
    : [requiredValue(defaultRepository, "STAR_HISTORY_DEFAULT_REPOSITORY")];
  const repositories = [];
  const seen = new Set();

  for (const item of items) {
    const repository = validateRepository(item);
    const key = repository.fullName.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      repositories.push(repository);
    }
  }
  if (repositories.length > MAX_REPOSITORIES) {
    throw new Error(`At most ${MAX_REPOSITORIES} repositories can be generated per run`);
  }
  return repositories;
}

async function githubRequest(url, token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "stonewuu-profile-star-history",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
  if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub API request failed for ${url} (${response.status} ${response.statusText}): ${body}`,
    );
  }
  return response;
}

export async function fetchRepositorySnapshot(repository, token, now = new Date()) {
  const encodedRepository = repository.fullName
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const response = await githubRequest(
    `${GITHUB_API_ROOT}/repos/${encodedRepository}`,
    token,
  );
  const metadata = await response.json();
  if (!Number.isInteger(metadata.stargazers_count) || metadata.stargazers_count < 0) {
    throw new Error(`${repository.fullName} did not return a valid stargazers_count`);
  }
  return {
    date: formatDate(utcDay(now, "now")),
    count: metadata.stargazers_count,
  };
}

function utcDay(value, name) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${name} must be a valid date`);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function parseDate(value, name) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must use YYYY-MM-DD`);
  }
  return utcDay(`${value}T00:00:00Z`, name);
}

function formatDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function validateObservation(value, name) {
  const date = formatDate(parseDate(value?.date, `${name}.date`));
  if (!Number.isInteger(value?.count) || value.count < 0) {
    throw new Error(`${name}.count must be a non-negative integer`);
  }
  return { date, count: value.count };
}

export function normalizeHistory(history, repository) {
  if (!history || typeof history !== "object") {
    throw new Error(`${repository.fullName} history must be an object`);
  }
  if (history.repository?.toLowerCase() !== repository.fullName.toLowerCase()) {
    throw new Error(`${repository.fullName} history belongs to another repository`);
  }
  if (!Array.isArray(history.observations)) {
    throw new Error(`${repository.fullName} history observations must be an array`);
  }
  const observationsByDate = new Map();
  history.observations.forEach((value, index) => {
    const observation = validateObservation(value, `observations[${index}]`);
    observationsByDate.set(observation.date, observation);
  });
  return {
    repository: repository.fullName,
    observations: [...observationsByDate.values()].sort((left, right) =>
      left.date.localeCompare(right.date),
    ),
  };
}

export function mergeObservation(history, repository, observation) {
  const normalized = normalizeHistory(history, repository);
  const current = validateObservation(observation, "observation");
  const observationsByDate = new Map(
    normalized.observations.map((item) => [item.date, item]),
  );
  observationsByDate.set(current.date, current);
  return {
    repository: repository.fullName,
    observations: [...observationsByDate.values()].sort((left, right) =>
      left.date.localeCompare(right.date),
    ),
  };
}

async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function fetchPublishedHistory(baseUrl, repository) {
  const normalizedBaseUrl = requiredValue(
    baseUrl,
    "STAR_HISTORY_PAGES_BASE_URL",
  ).replace(/\/+$/, "");
  const stateUrl =
    `${normalizedBaseUrl}/star-history/${repository.owner}/${repository.name}.json` +
    `?refresh=${Date.now()}`;
  const response = await fetch(stateUrl, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Published history request failed for ${repository.fullName} ` +
        `(${response.status} ${response.statusText})`,
    );
  }
  return response.json();
}

async function loadHistory({ baseUrl, repository, seedDirectory }) {
  const published = await fetchPublishedHistory(baseUrl, repository);
  if (published) return normalizeHistory(published, repository);
  const seedPath = resolve(seedDirectory, repository.owner, `${repository.name}.json`);
  const seed = await readJsonFile(seedPath);
  if (seed) return normalizeHistory(seed, repository);
  return { repository: repository.fullName, observations: [] };
}

export function historyToSeries(history) {
  if (!Array.isArray(history?.observations) || history.observations.length === 0) {
    throw new Error("history must contain at least one observation");
  }
  return history.observations.map((observation, index) => ({
    timestamp: parseDate(observation.date, `observations[${index}].date`),
    count: observation.count,
  }));
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatMonth(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 7);
}

function niceStep(maxValue, desiredTicks = 5) {
  if (maxValue <= 0) return 1;
  const roughStep = maxValue / desiredTicks;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * magnitude;
}

export function renderStarHistorySvg({ repository, series, updatedAt = new Date() }) {
  if (!Array.isArray(series) || series.length === 0) {
    throw new Error("series must contain at least one point");
  }
  const displaySeries = series.length === 1
    ? [{ timestamp: series[0].timestamp - DAY_MILLISECONDS, count: series[0].count }, ...series]
    : series;
  const width = 1000;
  const height = 560;
  const plot = { left: 78, right: 34, top: 118, bottom: 76 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const start = displaySeries[0].timestamp;
  const end = displaySeries.at(-1).timestamp;
  const totalStars = displaySeries.at(-1).count;
  const maximumStars = Math.max(...displaySeries.map((point) => point.count));
  const step = niceStep(maximumStars);
  const yMaximum = Math.max(step, Math.ceil(maximumStars / step) * step);
  const x = (timestamp) => plot.left + ((timestamp - start) / (end - start)) * plotWidth;
  const y = (count) => plot.top + plotHeight - (count / yMaximum) * plotHeight;
  const coordinates = displaySeries.map(
    (point) => `${x(point.timestamp).toFixed(2)} ${y(point.count).toFixed(2)}`,
  );
  const linePath = coordinates
    .map((coordinate, index) => `${index === 0 ? "M" : "L"} ${coordinate}`)
    .join(" ");
  const areaPath =
    `${linePath} L ${x(displaySeries.at(-1).timestamp).toFixed(2)} ` +
    `${(plot.top + plotHeight).toFixed(2)} L ${x(start).toFixed(2)} ` +
    `${(plot.top + plotHeight).toFixed(2)} Z`;
  const yGrid = [];

  for (let value = 0; value <= yMaximum; value += step) {
    const coordinate = y(value).toFixed(2);
    yGrid.push(
      `<line x1="${plot.left}" y1="${coordinate}" x2="${width - plot.right}" y2="${coordinate}" class="grid"/>`,
      `<text x="${plot.left - 14}" y="${coordinate}" class="axis y-axis">${value.toLocaleString("en-US")}</text>`,
    );
  }

  const xLabels = [];
  for (let index = 0; index <= 5; index += 1) {
    const timestamp = start + ((end - start) * index) / 5;
    const coordinate = x(timestamp).toFixed(2);
    xLabels.push(
      `<line x1="${coordinate}" y1="${plot.top}" x2="${coordinate}" y2="${plot.top + plotHeight}" class="grid vertical"/>`,
      `<text x="${coordinate}" y="${height - 42}" class="axis x-axis">${formatMonth(timestamp)}</text>`,
    );
  }

  const lastX = x(displaySeries.at(-1).timestamp).toFixed(2);
  const lastY = y(totalStars).toFixed(2);
  const safeRepository = escapeXml(repository);
  const safeUpdatedAt = escapeXml(formatDate(utcDay(updatedAt, "updatedAt")));
  const safeTotalStars = totalStars.toLocaleString("en-US");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">GitHub Star History for ${safeRepository}</title>
  <desc id="description">${safeRepository} has ${safeTotalStars} stars as of ${safeUpdatedAt}.</desc>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0d1117"/><stop offset="100%" stop-color="#161b22"/></linearGradient>
    <linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#58a6ff" stop-opacity="0.42"/><stop offset="100%" stop-color="#58a6ff" stop-opacity="0.03"/></linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <style>
    .title { fill: #f0f6fc; font: 700 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .subtitle { fill: #8b949e; font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .count { fill: #f0f6fc; font: 700 30px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; text-anchor: end; }
    .count-label { fill: #8b949e; font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; text-anchor: end; }
    .grid { stroke: #30363d; stroke-width: 1; }
    .grid.vertical { stroke-opacity: 0.35; }
    .axis { fill: #8b949e; font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .y-axis { text-anchor: end; dominant-baseline: middle; }
    .x-axis { text-anchor: middle; }
  </style>
  <rect width="${width}" height="${height}" rx="18" fill="url(#background)"/>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="17.5" fill="none" stroke="#30363d"/>
  <text x="${plot.left}" y="52" class="title">GitHub Star History</text>
  <text x="${plot.left}" y="80" class="subtitle">${safeRepository} · Updated ${safeUpdatedAt} UTC</text>
  <text x="${width - plot.right}" y="50" class="count">★ ${safeTotalStars}</text>
  <text x="${width - plot.right}" y="77" class="count-label">current stars</text>
  ${yGrid.join("\n  ")}
  ${xLabels.join("\n  ")}
  <path d="${areaPath}" fill="url(#area)"/>
  <path d="${linePath}" fill="none" stroke="#58a6ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${lastX}" cy="${lastY}" r="7" fill="#58a6ff" filter="url(#glow)"/>
</svg>
`;
}

function renderIndex(generated) {
  const cards = generated
    .map(({ repository, relativePath }) => `
      <article><h2>${escapeXml(repository)}</h2><a href="./${escapeXml(relativePath)}"><img src="./${escapeXml(relativePath)}" alt="${escapeXml(repository)} Star History"></a></article>`)
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Repository Star History</title><style>body{max-width:1100px;margin:40px auto;padding:0 20px;font-family:system-ui,sans-serif;color:#24292f}h1{text-align:center}article{margin:32px 0}h2{font-size:18px}img{display:block;width:100%;height:auto;border-radius:18px}</style></head><body><h1>Repository Star History</h1>${cards}</body></html>\n`;
}

async function main() {
  const repositories = parseRepositories(
    process.env.STAR_HISTORY_REPOSITORIES,
    process.env.STAR_HISTORY_DEFAULT_REPOSITORY,
  );
  const siteDirectory = resolve(process.env.STAR_HISTORY_SITE_DIR?.trim() || "_site");
  const seedDirectory = resolve(process.env.STAR_HISTORY_SEED_DIR?.trim() || "star-history-seeds");
  const pagesBaseUrl = requiredValue(
    process.env.STAR_HISTORY_PAGES_BASE_URL,
    "STAR_HISTORY_PAGES_BASE_URL",
  );
  const updatedAt = new Date();
  const generated = [];

  for (const repository of repositories) {
    const [history, snapshot] = await Promise.all([
      loadHistory({ baseUrl: pagesBaseUrl, repository, seedDirectory }),
      fetchRepositorySnapshot(repository, process.env.GITHUB_TOKEN, updatedAt),
    ]);
    const updatedHistory = mergeObservation(history, repository, snapshot);
    const relativeBase = `star-history/${repository.owner}/${repository.name}`;
    const svgPath = resolve(siteDirectory, ...`${relativeBase}.svg`.split("/"));
    const jsonPath = resolve(siteDirectory, ...`${relativeBase}.json`.split("/"));
    await mkdir(dirname(svgPath), { recursive: true });
    await writeFile(
      svgPath,
      renderStarHistorySvg({
        repository: repository.fullName,
        series: historyToSeries(updatedHistory),
        updatedAt,
      }),
      "utf8",
    );
    await writeFile(jsonPath, `${JSON.stringify(updatedHistory, null, 2)}\n`, "utf8");
    generated.push({
      repository: repository.fullName,
      relativePath: `${relativeBase}.svg`,
    });
    console.log(
      `Generated ${repository.fullName} with ${snapshot.count.toLocaleString("en-US")} current stars and ${updatedHistory.observations.length} observations`,
    );
  }

  await mkdir(siteDirectory, { recursive: true });
  await writeFile(resolve(siteDirectory, "index.html"), renderIndex(generated), "utf8");
}

const entryPoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entryPoint === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
