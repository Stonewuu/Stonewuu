const { setTimeout: sleep } = require("node:timers/promises");

const retryDelays = [2, 4, 8, 16, 30];
const failedStatuses = new Set([
  "deployment_failed", "deployment_content_failed", "deployment_cancelled", "deployment_lost"
]);

function canRetryRead(error) {
  return error.status === 404 || (error.status >= 500 && error.status < 600);
}

function pagesRejectedArtifact(error) {
  if (![400, 404, 422].includes(error.status)) return false;
  const response = error.response?.data;
  const detail = [response?.message, JSON.stringify(response?.errors)].join(" ");
  return /artifact/i.test(detail) && /not[ _-]found|could not (?:be found|find)|does not exist/i.test(detail);
}

async function waitForArtifact(request, retryable, core, pause) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await request();
    } catch (error) {
      const delay = retryDelays[attempt];
      if (!delay || !retryable(error)) throw error;
      core.info(`GitHub 暂时无法读取网站文件包（HTTP ${error.status}），${delay} 秒后重试。`);
      await pause(delay * 1000);
    }
  }
}

async function publishPages({ github, context, core, artifactId, pause = sleep }) {
  const id = Number(artifactId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("构建任务未返回有效的网站文件包编号。");

  const { data: artifact } = await waitForArtifact(
    () => github.rest.actions.getArtifact({ ...context.repo, artifact_id: id }),
    canRetryRead, core, pause
  );
  if (artifact.expired) throw new Error(`网站文件包 ${id} 已过期，请重新构建网站。`);
  if (artifact.workflow_run?.id !== context.runId) throw new Error(`网站文件包 ${id} 与本次运行不匹配。`);
  core.info(`已找到本次运行上传的网站文件包 ${id}。`);

  const oidcToken = await core.getIDToken();
  // 只有 Pages 明确拒绝文件包时才再次创建发布。网络中断时，请求可能已被接收。
  const { data: deployment } = await waitForArtifact(
    () => github.rest.repos.createPagesDeployment({
      ...context.repo, artifact_id: id, pages_build_version: context.sha, oidc_token: oidcToken
    }),
    pagesRejectedArtifact, core, pause
  );
  const deploymentId = deployment.id ?? deployment.status_url?.split("/").pop() ?? context.sha;
  core.setOutput("deployment_id", deploymentId);
  core.setOutput("page_url", deployment.page_url);

  const deadline = Date.now() + 10 * 60 * 1000;
  let previousStatus;
  do {
    await pause(5000);
    let status;
    try {
      const result = await github.rest.repos.getPagesDeployment({
        ...context.repo, pages_deployment_id: deploymentId
      });
      status = result.data.status;
    } catch (error) {
      if (!canRetryRead(error)) throw error;
      core.info(`GitHub 暂时无法返回发布状态（HTTP ${error.status}）。`);
      continue;
    }
    if (status !== previousStatus) core.info(`GitHub Pages 发布状态为 ${status}。`);
    previousStatus = status;
    if (status === "succeed" || failedStatuses.has(status)) {
      core.setOutput("finished", "true");
      if (status === "succeed") return;
      throw new Error(`GitHub Pages 发布失败（${status}）。`);
    }
  } while (Date.now() < deadline);
  throw new Error("等待 GitHub Pages 发布超过 10 分钟。");
}

module.exports = { publishPages };
