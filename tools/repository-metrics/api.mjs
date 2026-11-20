import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as wait } from "node:timers/promises";

const execute = promisify(execFile);

export class SourceError extends Error {
  constructor(status, httpStatus = null) {
    super(status + (httpStatus ? " · HTTP " + httpStatus : ""));
    this.status = status;
    this.httpStatus = httpStatus;
  }
}

function parseResponse(output) {
  const match = /^HTTP\/[\d.]+ (\d+)[^\n]*\r?\n([\s\S]*?)\r?\n\r?\n([\s\S]*)$/.exec(output);
  if (!match) {
    throw new SourceError("network");
  }
  const status = Number(match[1]);
  const raw = match[3].trim();
  const headers = match[2];
  if (status < 200 || status >= 300) {
    const limited = status === 429 || (status === 403 && /rate limit/i.test(raw));
    throw new SourceError(limited ? "limited" : status === 403 ? "forbidden" : status === 404 ? "unavailable" : status === 422 ? "unsupported" : "error", status);
  }
  if (status === 202) {
    throw new SourceError("pending", status);
  }
  return { body: raw ? JSON.parse(raw) : null, next: /^link:.*?<([^>]+)>;\s*rel="next"/im.exec(headers)?.[1] };
}

export async function api(endpoint, { token, fields, statistics = false } = {}) {
  const args = ["api", "--include", endpoint];
  for (const [name, value] of Object.entries(fields ?? {})) {
    args.push("-f", name + "=" + value);
  }
  const env = token ? { ...process.env, GH_TOKEN: token } : process.env;
  for (let attempt = 0; ; attempt++) {
    let output;
    try {
      const result = await execute("gh", args, { env, windowsHide: true, timeout: 45000, maxBuffer: 24 * 1024 * 1024 });
      output = result.stdout;
    } catch (error) {
      output = error.stdout ?? "";
      if (!output.startsWith("HTTP/")) {
        if (attempt < 2) {
          await wait(1000 * (attempt + 1));
          continue;
        }
        throw new SourceError("network");
      }
    }
    try {
      return parseResponse(output);
    } catch (error) {
      if (statistics && error.status === "pending" && attempt < 2) {
        await wait(2200 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
}

export async function allPages(endpoint, prop) {
  const all = [];
  let next = endpoint;
  while (next) {
    const page = await api(next);
    const rows = prop ? page.body[prop] : page.body;
    if (!Array.isArray(rows)) {
      throw new SourceError("invalid");
    }
    all.push(...rows);
    next = page.next;
  }
  return all;
}

export async function inBatches(entries, concurrency, run) {
  const result = [];
  for (let index = 0; index < entries.length; index += concurrency) {
    const items = entries.slice(index, index + concurrency);
    result.push(...await Promise.all(items.map(run)));
  }
  return result;
}
