const { mock, test } = require("node:test");
const assert = require("node:assert/strict");
const { publishPages } = require("../publish-pages.cjs");

const artifact = { id: 14883444348, expired: false, workflow_run: { id: 207 } };
const deployment = { id: "abc123", page_url: "https://example.org/" };
const context = { repo: { owner: "example", repo: "site" }, runId: 207, sha: "abc123" };

function httpError(status, message = "Not Found") {
  return Object.assign(new Error(message), { status, response: { data: { message } } });
}

function replies(...values) {
  return mock.fn(async () => {
    assert.ok(values.length, "接口调用次数超出预期");
    const value = values.shift();
    if (value instanceof Error) throw value;
    return { data: value };
  });
}

function setup({
  read = replies(artifact), create = replies(deployment), poll = replies({ status: "succeed" })
} = {}) {
  const github = { rest: {
    actions: { getArtifact: read },
    repos: { createPagesDeployment: create, getPagesDeployment: poll }
  } };
  const outputs = new Map();
  const delays = [];
  const core = { getIDToken: async () => "test", info() {}, setOutput: (key, value) => outputs.set(key, value) };
  const run = () => publishPages({
    github, context, core, artifactId: String(artifact.id), pause: async ms => { delays.push(ms); }
  });
  return { run, create, outputs, delays };
}

test("上传记录延迟出现时按编号重试，状态查询短暂失败时继续等待同一次发布", async () => {
  const read = replies(httpError(404), httpError(404), artifact);
  const poll = replies(httpError(503), { status: "syncing_files" }, { status: "succeed" });
  const { run, create, outputs, delays } = setup({ read, poll });
  await run();
  assert.deepEqual(delays.slice(0, 2), [2000, 4000]);
  for (const call of read.mock.calls) assert.equal(call.arguments[0].artifact_id, artifact.id);
  assert.equal(create.mock.callCount(), 1);
  assert.deepEqual(create.mock.calls[0].arguments[0], {
    ...context.repo, pages_build_version: context.sha, artifact_id: artifact.id, oidc_token: "test"
  });
  assert.equal(poll.mock.callCount(), 3);
  assert.equal(outputs.get("page_url"), deployment.page_url);
  assert.equal(outputs.get("finished"), "true");
});

test("文件包持续不可见时在一分钟后结束，权限错误立即返回", async () => {
  const error = httpError(404);
  const missing = setup({ read: replies(...Array(6).fill(error)) });
  await assert.rejects(missing.run, error);
  assert.deepEqual(missing.delays, [2000, 4000, 8000, 16000, 30000]);
  assert.equal(missing.create.mock.callCount(), 0);

  const denied = setup({ read: replies(httpError(403, "Forbidden")) });
  await assert.rejects(denied.run, /Forbidden/);
  assert.deepEqual(denied.delays, []);
});

test("过期文件包和其他运行上传的文件包均不能发布", async () => {
  for (const [record, message] of [
    [{ ...artifact, expired: true }, /已过期/],
    [{ ...artifact, workflow_run: { id: 208 } }, /与本次运行不匹配/]
  ]) {
    const { run, create } = setup({ read: replies(record) });
    await assert.rejects(run, message);
    assert.equal(create.mock.callCount(), 0);
  }
});

test("Pages 明确拒绝尚不可见的文件包时再次提交相同编号", async () => {
  const create = replies(httpError(422, "Artifact not found"), deployment);
  const { run, delays } = setup({ create });
  await run();
  assert.equal(delays[0], 2000);
  assert.equal(create.mock.callCount(), 2);
  assert.deepEqual(create.mock.calls[0].arguments, create.mock.calls[1].arguments);
});

test("无法确认发布请求是否已被接收时保留错误，避免重复提交", async () => {
  const error = httpError(502, "Bad Gateway");
  const { run, create, delays } = setup({ create: replies(error) });
  await assert.rejects(run, error);
  assert.equal(create.mock.callCount(), 1);
  assert.deepEqual(delays, []);
});

test("Pages 报告内容错误时直接标记本次发布失败", async () => {
  const { run, outputs } = setup({ poll: replies({ status: "deployment_content_failed" }) });
  await assert.rejects(run, /deployment_content_failed/);
  assert.equal(outputs.get("deployment_id"), deployment.id);
  assert.equal(outputs.get("finished"), "true");
});
