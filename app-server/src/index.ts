import express from "express";
import { App } from "@octokit/app";
import { Webhooks, createNodeMiddleware } from "@octokit/webhooks";
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

type PullRequestPayload = Parameters<typeof extractPullRequestContext>[0] & {
  action?: string;
  installation?: { id?: number };
};

const handlePullRequestEvent = async (
  payload: PullRequestPayload,
): Promise<void> => {
  const action = payload.action;
  if (!action || !supportedActions.has(action)) {
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
          conclusion: override?.[name] ?? conclusion,
          output,
        });
      }),
    );
  };

  try {
    for (const name of checkRuns) {
      const checkRunId = await createCheckRun(octokit, {
        owner: context.owner,
        repo: context.repo,
        name,
        headSha: context.headSha,
        status: "in_progress",
        output: inProgressOutput,
      });
      checkRunIds.set(name, checkRunId);
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

    await completeCheckRun(octokit, {
      owner: context.owner,
      repo: context.repo,
      checkRunId: checkRunIds.get("CI/check") ?? 0,
      conclusion: autofixResult.checkConclusion,
      output: {
        title: "Python Autofix Pro",
        summary: autofixResult.summary,
        text: autofixResult.details,
      },
    });

    await completeCheckRun(octokit, {
      owner: context.owner,
      repo: context.repo,
      checkRunId: checkRunIds.get("CI/autofix") ?? 0,
      conclusion: autofixResult.autofixConclusion,
      output: {
        title: "Python Autofix Pro",
        summary: autofixResult.summary,
        text: autofixResult.details,
      },
    });

    if (autofixResult.appliedFixes || autofixResult.checkConclusion === "failure") {
      const docsLine = config.docsUrl
        ? `\n\nDocs: ${config.docsUrl}`
        : "";
      const commentBody = `### Python Autofix Pro\n\n${autofixResult.summary}\n\nPR: ${context.htmlUrl}${docsLine}`;
      await postPullRequestComment(
        octokit,
        context.owner,
        context.repo,
        context.pullNumber,
        commentBody,
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
    await postPullRequestComment(
      octokit,
      context.owner,
      context.repo,
      context.pullNumber,
      `### Python Autofix Pro\n\n${summary}${docsLine}`,
    );
  }
};

webhooks.on("pull_request", ({ payload }) => {
  void handlePullRequestEvent(payload).catch((error) => {
    console.error("pull_request handler crashed.", {
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
