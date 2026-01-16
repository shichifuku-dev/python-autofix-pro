import type { Octokit } from "@octokit/rest";

export const getRepoVariable = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  name: string,
): Promise<string | null> => {
  try {
    const response = await octokit.rest.actions.getRepoVariable({
      owner,
      repo,
      name,
    });
    return response.data?.value ?? null;
  } catch (error) {
    const err = error as { status?: number };
    if (err?.status === 404) {
      return null;
    }
    throw error;
  }
};
