import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const GITHUB_API_ROOT = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const MAX_REPOSITORIES = 20;
const STARGAZERS_PER_PAGE = 100;
const REPOSITORY_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]+$/;

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
  const source = value?.trim() || requiredValue(
    defaultRepository,
    "STAR_HISTORY_DEFAULT_REPOSITORY",
  );
  const repositories = [];
  const seen = new Set();

  for (const item of source.split(/[\s,]+/).filter(Boolean)) {
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
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.star+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "stonewuu-profile-star-history",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub API request failed for ${url} (${response.status} ${response.statusText}): ${body}`,
    );
  }
  return response;
}

function nextPageUrl(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match?.[2] === "next") return match[1];
  }
  return null;
}

export async function fetchRepositoryStarHistory(repository, token) {
  const normalizedToken = requiredValue(token, "GITHUB_TOKEN");
  const encodedRepository = repository.fullName
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const repositoryResponse = await githubRequest(
    `${GITHUB_API_ROOT}/repos/${encodedRepository}`,
    normalizedToken,
  );
  const repositoryMetadata = await repositoryResponse.json();
  const stargazers = [];
  let url =
    `${GITHUB_API_ROOT}/repos/${encodedRepository}/stargazers` +
    `?per_page=${STARGAZERS_PER_PAGE}&page=1`;

  while (url) {
    const response = await githubRequest(url, normalizedToken);
    const page = await response.json();
    if (!Array.isArray(page)) {
      throw new Error(`${repository.fullName} stargazers response must be an array`);
    }
    for (const entry of page) {
      if (typeof entry?.starred_at !== "string") {
        throw new Error(`${repository.fullName} response did not include starred_at`);
      }
      stargazers.push(entry);
    }
    url = nextPageUrl(response.headers.get("link"));
  }

  return { createdAt: repositoryMetadata.created_at, stargazers };
}

function utcDay(value, name) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${name} must be a valid date`);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function buildStarSeries(stargazers, createdAt, updatedAt = new Date()) {
  if (!Array.isArray(stargazers)) throw new Error("stargazers must be an array");
  const start = utcDay(createdAt, "createdAt");
  const end = Math.max(start, utcDay(updatedAt, "updatedAt"));
  const sorted = stargazers
    .map((entry, index) => ({
      day: utcDay(entry?.starred_at, `stargazers[${index}].starred_at`),
    }))
    .sort((left, right) => left.day - right.day);
  const dailyCounts = new Map();
  let count = 0;

  for (const entry of sorted) {
    count += 1;
    dailyCounts.set(entry.day, count);
  }

  const points = [{ timestamp: start, count: dailyCounts.get(start) ?? 0 }];
  for (const [timestamp, dailyCount] of dailyCounts) {
    if (timestamp > start && timestamp <= end) {
      points.push({ timestamp, count: dailyCount });
    }
  }
  const lastPoint = points.at(-1);
  if (lastPoint.timestamp === end) lastPoint.count = count;
  else points.push({ timestamp: end, count });
  return points;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
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
  const width = 1000;
  const height = 560;
  const plot = { left: 78, right: 34, top: 118, bottom: 76 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const start = series[0].timestamp;
  const end = Math.max(start + 1, series.at(-1).timestamp);
  const totalStars = series.at(-1).count;
  const step = niceStep(totalStars);
  const yMaximum = Math.max(step, Math.ceil(totalStars / step) * step);
  const x = (timestamp) => plot.left + ((timestamp - start) / (end - start)) * plotWidth;
  const y = (count) => plot.top + plotHeight - (count / yMaximum) * plotHeight;
  const coordinates = series.map(
    (point) => `${x(point.timestamp).toFixed(2)} ${y(point.count).toFixed(2)}`,
  );
  const linePath = coordinates
    .map((coordinate, index) => `${index === 0 ? "M" : "L"} ${coordinate}`)
    .join(" ");
  const areaPath =
    `${linePath} L ${x(series.at(-1).timestamp).toFixed(2)} ` +
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

  const lastX = x(series.at(-1).timestamp).toFixed(2);
  const lastY = y(totalStars).toFixed(2);
  const safeRepository = escapeXml(repository);
  const safeUpdatedAt = escapeXml(formatDate(utcDay(updatedAt, "updatedAt")));
  const safeTotalStars = totalStars.toLocaleString("en-US");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">GitHub Star History for ${safeRepository}</title>
  <desc id="description">${safeRepository} has ${safeTotalStars} current stargazers as of ${safeUpdatedAt}.</desc>
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
      <article>
        <h2>${escapeXml(repository)}</h2>
        <a href="./${escapeXml(relativePath)}"><img src="./${escapeXml(relativePath)}" alt="${escapeXml(repository)} Star History"></a>
      </article>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Repository Star History</title>
  <style>body{max-width:1100px;margin:40px auto;padding:0 20px;font-family:system-ui,sans-serif;color:#24292f}h1{text-align:center}article{margin:32px 0}h2{font-size:18px}img{display:block;width:100%;height:auto;border-radius:18px}</style>
</head>
<body><h1>Repository Star History</h1>${cards}</body>
</html>
`;
}

async function main() {
  const token = requiredValue(process.env.GITHUB_TOKEN, "GITHUB_TOKEN");
  const repositories = parseRepositories(
    process.env.STAR_HISTORY_REPOSITORIES,
    process.env.STAR_HISTORY_DEFAULT_REPOSITORY,
  );
  const siteDirectory = resolve(process.env.STAR_HISTORY_SITE_DIR?.trim() || "_site");
  const updatedAt = new Date();
  const generated = [];

  for (const repository of repositories) {
    const history = await fetchRepositoryStarHistory(repository, token);
    const series = buildStarSeries(history.stargazers, history.createdAt, updatedAt);
    const svg = renderStarHistorySvg({
      repository: repository.fullName,
      series,
      updatedAt,
    });
    const relativePath = `star-history/${repository.owner}/${repository.name}.svg`;
    const outputPath = resolve(siteDirectory, ...relativePath.split("/"));
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, svg, "utf8");
    generated.push({ repository: repository.fullName, relativePath });
    console.log(
      `Generated ${repository.fullName} with ${history.stargazers.length.toLocaleString("en-US")} stargazers`,
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
