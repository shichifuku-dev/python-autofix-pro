import type { Octokit } from "@octokit/rest";

export type CheckRunName = "CI/check" | "CI/autofix";

export type CheckOutput = {
  title: string;
  summary: string;
  text?: string;
};

export const buildCheckOutput = (output: CheckOutput) => ({
  title: output.title,
  summary: output.summary,
  text: output.text ?? "",
});

export type CreateCheckRunInput = {
  owner: string;
  repo: string;
  name: CheckRunName;
  headSha: string;
  status: "in_progress" | "completed";
  conclusion?: "success" | "failure" | "neutral";
  output: CheckOutput;
};

export const createCheckRun = async (
  octokit: Octokit,
  input: CreateCheckRunInput,
): Promise<number> => {
  const response = await octokit.rest.checks.create({
    owner: input.owner,
    repo: input.repo,
    name: input.name,
    head_sha: input.headSha,
    status: input.status,
    conclusion: input.conclusion,
    output: buildCheckOutput(input.output),
  });

  return response.data.id;
};

export type CompleteCheckRunInput = {
  owner: string;
  repo: string;
  checkRunId: number;
  conclusion: "success" | "failure" | "neutral";
  output: CheckOutput;
};

export const completeCheckRun = async (
  octokit: Octokit,
  input: CompleteCheckRunInput,
): Promise<void> => {
  await octokit.rest.checks.update({
    owner: input.owner,
    repo: input.repo,
    check_run_id: input.checkRunId,
    status: "completed",
    conclusion: input.conclusion,
    output: buildCheckOutput(input.output),
  });
};
