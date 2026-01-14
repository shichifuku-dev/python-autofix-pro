import express from "express";
import { App } from "@octokit/app";
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
  octokit: import("@octokit/rest").Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  body: string,
  context: { action: string; installationId: number; headSha: string },
): Promise<void> => {
  try {
    await postPullRequestComment(octokit, owner, repo, pullNumber, body);
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

  const octokit =
    (await app.getInstallationOctokit(installationId)) as unknown as import("@octokit/rest").Octokit;

  const inProgressOutput = {
    title: "Python Autofix Pro",
    summary: "Autofix started.",
  };

  const checkRunIds = new Map<CheckRunName, number>();
  const checkRuns: CheckRunName[] = ["CI/check", "CI/autofix"];
  const finalizeCheckRuns = async (
    conclusion: "success" | "failure" | "neutral",
    output: { title: string; summary: string; text?: string },
    override?: Partial<Record<CheckRunName, "success" | "failure" | "neutral">>,
  ): Promise<void> => {
    await Promise.all(
      checkRuns.map((name) => {
        const checkRunId = checkRunIds.get(name);
        if (!checkRunId) {
          return Promise.resolve();
        }
        return completeCheckRun(octokit, {
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
    for (const name of checkRuns) {
      try {
        const checkRunId = await createCheckRun(octokit, {
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
        return;
      }
    }

    const files = await listPullRequestFiles(
      octokit,
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
      return;
    }

    const installationTokenResponse =
      await octokit.rest.apps.createInstallationAccessToken({
        installation_id: installationId,
      });
    const installationToken = installationTokenResponse.data.token;

    const autofixResult = await runAutofix({
      token: installationToken,
      headRepoFullName: context.headRepoFullName,
      headRef: context.headRef,
      headSha: context.headSha,
      commitMessage: "chore(autofix): python formatting",
    });

    const checkRunId = checkRunIds.get("CI/check");
    if (checkRunId) {
      await completeCheckRun(octokit, {
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
      await completeCheckRun(octokit, {
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
        octokit,
        context.owner,
        context.repo,
        context.pullNumber,
        commentBody,
        { action, installationId, headSha: context.headSha },
      );
    }
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
    await safePostPullRequestComment(
      octokit,
      context.owner,
      context.repo,
      context.pullNumber,
      `### Python Autofix Pro\n\n${summary}${docsLine}`,
      { action, installationId, headSha: context.headSha },
    );
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
