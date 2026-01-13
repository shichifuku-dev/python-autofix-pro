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

webhooks.on("pull_request", async ({ payload }) => {
  if (!supportedActions.has(payload.action)) {
    return;
  }

  const context = extractPullRequestContext(payload);
  const installationId = payload.installation?.id;
  if (!installationId) {
    console.warn("Missing installation id for pull_request event.");
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

  try {
    const files = await listPullRequestFiles(
      octokit,
      context.owner,
      context.repo,
      context.pullNumber,
    );

    if (!containsPythonChanges(files)) {
      const summary = "Skipped: no Python changes.";
      await Promise.all(
        checkRuns.map((name) =>
          completeCheckRun(octokit, {
            owner: context.owner,
            repo: context.repo,
            checkRunId: checkRunIds.get(name) ?? 0,
            conclusion: "success",
            output: {
              title: "Python Autofix Pro",
              summary,
              text: summary,
            },
          }),
        ),
      );
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
    const summary = "Autofix failed unexpectedly. See logs for details.";
    const details = (error as Error).message;
    await Promise.all(
      checkRuns.map((name) =>
        completeCheckRun(octokit, {
          owner: context.owner,
          repo: context.repo,
          checkRunId: checkRunIds.get(name) ?? 0,
          conclusion: name === "CI/check" ? "failure" : "neutral",
          output: {
            title: "Python Autofix Pro",
            summary,
            text: details,
          },
        }),
      ),
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
});

const server = express();
server.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
server.use(createNodeMiddleware(webhooks, { path: "/webhooks" }));

server.listen(config.port, () => {
  console.log(`Python Autofix Pro listening on :${config.port}`);
});
