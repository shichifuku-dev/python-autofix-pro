import { Octokit } from "@octokit/rest";

const settingsIssueTitle = "Python Autofix Pro Settings";

type RepoSettings = { enableUnsafeFixes: boolean };

const parseSettingsIssueBody = (body: string | null | undefined): RepoSettings => {
  if (!body) {
    return { enableUnsafeFixes: false };
  }
  const trimmed = body.trim();
  if (!trimmed) {
    return { enableUnsafeFixes: false };
  }
  try {
    const parsed = JSON.parse(trimmed) as { enableUnsafeFixes?: unknown };
    if (typeof parsed.enableUnsafeFixes === "boolean") {
      return { enableUnsafeFixes: parsed.enableUnsafeFixes };
    }
    return { enableUnsafeFixes: false };
  } catch (error) {
    console.warn("Failed to parse settings issue JSON; defaulting to false.", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { enableUnsafeFixes: false };
  }
};

export const getRepoSettingsFromIssue = async (
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<RepoSettings> => {
  try {
    // Requires GitHub App permission: Issues (read).
    const response = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: "open",
      per_page: 100,
    });
    const settingsIssue = response.data.find(
      (issue) => issue.title === settingsIssueTitle,
    );
    if (!settingsIssue) {
      return { enableUnsafeFixes: false };
    }
    return parseSettingsIssueBody(settingsIssue.body);
  } catch (error) {
    console.warn("Failed to read settings issue; defaulting to false.", {
      owner,
      repo,
      error: error instanceof Error ? error.message : String(error),
    });
    return { enableUnsafeFixes: false };
  }
};
