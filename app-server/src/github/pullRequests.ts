import type { Octokit } from "@octokit/rest";

export type PullRequestContext = {
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
  headRef: string;
  headRepoFullName: string;
  htmlUrl: string;
};

type PullRequestPayload = {
  repository?: {
    owner?: { login?: string };
    name?: string;
  };
  pull_request?: {
    number?: number;
    head?: {
      sha?: string;
      ref?: string;
      repo?: { full_name?: string } | null;
    };
    html_url?: string;
  };
};

export const extractPullRequestContext = (
  payload: PullRequestPayload,
): PullRequestContext | null => {
  const owner = payload.repository?.owner?.login;
  const repo = payload.repository?.name;
  const pullNumber = payload.pull_request?.number;
  const headSha = payload.pull_request?.head?.sha;
  const headRef = payload.pull_request?.head?.ref;
  const headRepoFullName = payload.pull_request?.head?.repo?.full_name;
  const htmlUrl = payload.pull_request?.html_url;

  if (
    !owner ||
    !repo ||
    !pullNumber ||
    !headSha ||
    !headRef ||
    !headRepoFullName ||
    !htmlUrl
  ) {
    return null;
  }

  return {
    owner,
    repo,
    pullNumber,
    headSha,
    headRef,
    headRepoFullName,
    htmlUrl,
  };
};

export const listPullRequestFiles = async (
  octokit: Octokit & { paginate: Octokit["paginate"] },
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<string[]> => {
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });

  return files.map((file) => file.filename);
};

export const getTargetPythonFiles = (files: string[]): string[] =>
  files.filter((file) => file.endsWith(".py"));
