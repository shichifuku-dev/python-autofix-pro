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

export const extractPullRequestContext = (
  payload: any,
): PullRequestContext => {
  const owner = payload.repository.owner.login as string;
  const repo = payload.repository.name as string;
  const pullNumber = payload.pull_request.number as number;
  const headSha = payload.pull_request.head.sha as string;
  const headRef = payload.pull_request.head.ref as string;
  const headRepoFullName = payload.pull_request.head.repo.full_name as string;
  const htmlUrl = payload.pull_request.html_url as string;

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

export const containsPythonChanges = (files: string[]): boolean =>
  files.some((file) => file.endsWith(".py"));
