import express from "express";
import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { Webhooks, createNodeMiddleware } from "@octokit/webhooks";
import type { CheckSuiteEvent, PullRequestEvent } from "@octokit/webhooks-types";
import { loadConfig } from "./config.js";
import {
  createCheckRun,
  completeCheckRun,
  type CheckRunName,
} from "./github/checks.js";
import {
  extractPullRequestContext,
  listPullRequestFiles,
  containsPythonChanges,
} from "./github/pullRequests.js";
import { runAutofix } from "./autofix/runner.js";
import { postPullRequestComment } from "./github/comments.js";
import { getPlanForInstallation, type InstallationPlan } from "./utils/plan.js";

const config = loadConfig();
const app = new App({
  appId: config.appId,
  privateKey: config.privateKey,
});

const webhooks = new Webhooks({
  secret: config.webhookSecret,
});

const supportedActions = new Set([
  "opened",
  "synchronize",
  "reopened",
  "ready_for_review",
]);

const supportedCheckSuiteActions = new Set(["requested", "rerequested"]);
const lastCommentedShaByPull = new Map<string, string>();

const getPullKey = (owner: string, repo: string, pullNumber: number): string => {
  return `${owner}/${repo}#${pullNumber}`;
};

const logCheckCreateError = (error: unknown, context: {
  owner: string;
  repo: string;
  headSha: string;
  installationId: number;
  action: string;
  checkName: string;
}): void => {
  const err = error as {
    status?: number;
    message?: string;
    response?: { data?: unknown };
  };
  console.error("checks.create failed.", {
    ...context,
    status: err?.status,
    message: err?.message,
    response: err?.response?.data,
  });
};

const safePostPullRequestComment = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  body: string,
  context: { action: string; installationId: number; headSha: string },
): Promise<void> => {
  const pullKey = getPullKey(owner, repo, pullNumber);
  const lastCommentedSha = lastCommentedShaByPull.get(pullKey);
  if (lastCommentedSha === context.headSha) {
    return;
  }

  try {
    await postPullRequestComment(octokit, owner, repo, pullNumber, body);
    lastCommentedShaByPull.set(pullKey, context.headSha);
  } catch (error) {
    console.error("postPullRequestComment failed.", {
      owner,
      repo,
      pullNumber,
      headSha: context.headSha,
      installationId: context.installationId,
      action: context.action,
      error,
    });
  }
};

const createInstallationOctokit = async (
  installationId: number,
): Promise<{ octokit: Octokit; token: string }> => {
  const tokenResponse = await app.octokit.request(
    "POST /app/installations/{installation_id}/access_tokens",
    { installation_id: installationId },
  );
  const token = tokenResponse.data.token;
  return { octokit: new Octokit({ auth: token }), token };
};

const logUsage = (params: {
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
  action: string;
  plan: InstallationPlan;
  result: string;
}): void => {
  console.info("usage.pr_event", {
    owner: params.owner,
    repo: params.repo,
    pullNumber: params.pullNumber,
    headSha: params.headSha,
    action: params.action,
    plan: params.plan,
    result: params.result,
  });
};

const handlePullRequestEvent = async (payload: PullRequestEvent): Promise<void> => {
  const action = payload.action;
  if (!action || !supportedActions.has(action)) {
    return;
  }

  if (!payload.pull_request) {
    console.warn("pull_request payload missing pull_request field.", { action });
    return;
  }

  const context = extractPullRequestContext(payload);
  if (!context) {
    console.warn("pull_request payload missing required fields.", { action });
    return;
  }

  const installationId = payload.installation?.id;
  if (!installationId) {
    console.warn("Missing installation id for pull_request event.", { action });
    return;
  }

  const plan = getPlanForInstallation(installationId);
  let octokit: Octokit | null = null;
  let installationToken: string | null = null;

  const inProgressOutput = {
    title: "Python Autofix Pro",
    summary: "Autofix started.",
  };

  const checkRunIds = new Map<CheckRunName, number>();
  const checkRuns: CheckRunName[] = ["CI/check", "CI/autofix"];
  let result = "started";
  const finalizeCheckRuns = async (
    conclusion: "success" | "failure" | "neutral",
    output: { title: string; summary: string; text?: string },
    override?: Partial<Record<CheckRunName, "success" | "failure" | "neutral">>,
  ): Promise<void> => {
    if (!octokit) {
      return;
    }
    const authedOctokit = octokit;
    await Promise.all(
      checkRuns.map((name) => {
        const checkRunId = checkRunIds.get(name);
        if (!checkRunId) {
          return Promise.resolve();
        }
        return completeCheckRun(authedOctokit, {
          owner: context.owner,
          repo: context.repo,
          checkRunId,
          headSha: context.headSha,
          installationId,
          action,
          conclusion: override?.[name] ?? conclusion,
          output,
        });
      }),
    );
  };

  try {
    const installationOctokit = await createInstallationOctokit(installationId);
    octokit = installationOctokit.octokit;
    installationToken = installationOctokit.token;
    if (!octokit) {
      throw new Error("Missing Octokit instance.");
    }
    const authedOctokit = octokit;

    for (const name of checkRuns) {
      try {
        const checkRunId = await createCheckRun(authedOctokit, {
          owner: context.owner,
          repo: context.repo,
          name,
          headSha: context.headSha,
          installationId,
          action,
          status: "in_progress",
          output: inProgressOutput,
        });
        checkRunIds.set(name, checkRunId);
      } catch (error) {
        logCheckCreateError(error, {
          owner: context.owner,
          repo: context.repo,
          headSha: context.headSha,
          installationId,
          action,
          checkName: name,
        });
        result = "check_create_failed";
        return;
      }
    }

    const files = await listPullRequestFiles(
      authedOctokit,
      context.owner,
      context.repo,
      context.pullNumber,
    );

    if (!containsPythonChanges(files)) {
      const summary = "Skipped: no Python changes.";
      await finalizeCheckRuns("success", {
        title: "Python Autofix Pro",
        summary,
        text: summary,
      });
      result = "skipped_no_python";
      return;
    }

    if (!installationToken) {
      throw new Error("Missing installation access token.");
    }

    const autofixResult = await runAutofix({
      token: installationToken,
      headRepoFullName: context.headRepoFullName,
      headRef: context.headRef,
      headSha: context.headSha,
      commitMessage: "chore(autofix): python formatting",
    });

    const checkRunId = checkRunIds.get("CI/check");
    if (checkRunId) {
      await completeCheckRun(authedOctokit, {
        owner: context.owner,
        repo: context.repo,
        checkRunId,
        headSha: context.headSha,
        installationId,
        action,
        conclusion: autofixResult.checkConclusion,
        output: {
          title: "Python Autofix Pro",
          summary: autofixResult.summary,
          text: autofixResult.details,
        },
      });
    } else {
      console.warn("Missing check_run_id for CI/check; skipping update.", {
        owner: context.owner,
        repo: context.repo,
        headSha: context.headSha,
        installationId,
        action,
      });
    }

    const autofixCheckRunId = checkRunIds.get("CI/autofix");
    if (autofixCheckRunId) {
      await completeCheckRun(authedOctokit, {
        owner: context.owner,
        repo: context.repo,
        checkRunId: autofixCheckRunId,
        headSha: context.headSha,
        installationId,
        action,
        conclusion: autofixResult.autofixConclusion,
        output: {
          title: "Python Autofix Pro",
          summary: autofixResult.summary,
          text: autofixResult.details,
        },
      });
    } else {
      console.warn("Missing check_run_id for CI/autofix; skipping update.", {
        owner: context.owner,
        repo: context.repo,
        headSha: context.headSha,
        installationId,
        action,
      });
    }

    if (autofixResult.appliedFixes || autofixResult.checkConclusion === "failure") {
      const docsLine = config.docsUrl
        ? `\n\nDocs: ${config.docsUrl}`
        : "";
      const commentBody = `### Python Autofix Pro\n\n${autofixResult.summary}\n\nPR: ${context.htmlUrl}${docsLine}`;
      await safePostPullRequestComment(
        authedOctokit,
        context.owner,
        context.repo,
        context.pullNumber,
        commentBody,
        { action, installationId, headSha: context.headSha },
      );
    }
    result = autofixResult.checkConclusion === "failure" ? "completed_failure" : "completed_success";
  } catch (error) {
    console.error("pull_request handler failed.", { action, error });
    const summary = "Autofix failed unexpectedly. See logs for details.";
    const details = (error as Error).message;
    await finalizeCheckRuns(
      "neutral",
      {
        title: "Python Autofix Pro",
        summary,
        text: details,
      },
      { "CI/check": "failure" },
    );
    const docsLine = config.docsUrl
      ? `\n\nDocs: ${config.docsUrl}`
      : "";
    if (octokit) {
      await safePostPullRequestComment(
        octokit,
        context.owner,
        context.repo,
        context.pullNumber,
        `### Python Autofix Pro\n\n${summary}${docsLine}`,
        { action, installationId, headSha: context.headSha },
      );
    }
    result = "error";
  } finally {
    logUsage({
      owner: context.owner,
      repo: context.repo,
      pullNumber: context.pullNumber,
      headSha: context.headSha,
      action,
      plan,
      result,
    });
  }
};

const handleCheckSuiteEvent = async (payload: CheckSuiteEvent): Promise<void> => {
  const action = payload.action;
  if (!action || !supportedCheckSuiteActions.has(action)) {
    console.warn("check_suite action not supported; skipping.", { action });
    return;
  }

  if (!payload.check_suite) {
    console.warn("check_suite payload missing check_suite field.", { action });
    return;
  }

  const pullRequests = payload.check_suite.pull_requests;
  if (action === "requested" && (!Array.isArray(pullRequests) || pullRequests.length === 0)) {
    console.warn("check_suite requested without pull requests; skipping.", { action });
    return;
  }

  console.info("check_suite event received; deferring to pull_request events.", {
    action,
    pullRequestCount: Array.isArray(pullRequests) ? pullRequests.length : 0,
  });
};

webhooks.on("pull_request", ({ payload }) => {
  void handlePullRequestEvent(payload).catch((error) => {
    console.error("pull_request handler crashed.", {
      action: payload?.action,
      error,
    });
  });
});

webhooks.on("check_suite", ({ payload }) => {
  void handleCheckSuiteEvent(payload).catch((error) => {
    console.error("check_suite handler crashed.", {
      action: payload?.action,
      error,
    });
  });
});

const server = express();
server.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
const webhookPath = process.env.WEBHOOK_PATH || "/api/webhook";

// Primary (Render/GitHub Appで設定しているパス)
server.use(createNodeMiddleware(webhooks, { path: webhookPath }));

// 互換用（ローカルや過去設定で /webhooks を叩いても動くように残す）
if (webhookPath !== "/webhooks") {
  server.use(createNodeMiddleware(webhooks, { path: "/webhooks" }));
}


server.listen(config.port, () => {
  console.log(`Python Autofix Pro listening on :${config.port}`);
});
