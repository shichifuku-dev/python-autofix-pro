import { Octokit } from "@octokit/rest";

const settingsIssueTitle = "Python Autofix Pro Settings";

type UnsafeFixesEnabledBy = { login: string; id: number };

export type RepoSettings = {
  enableUnsafeFixes: boolean;
  unsafeFixesEnabledBy: UnsafeFixesEnabledBy | null;
  unsafeFixesEnabledAt: string | null;
};

type ParsedSettings = {
  settings: RepoSettings;
  raw: Record<string, unknown> | null;
};

const defaultSettings: RepoSettings = {
  enableUnsafeFixes: false,
  unsafeFixesEnabledBy: null,
  unsafeFixesEnabledAt: null,
};

const parseSettingsIssueBody = (body: string | null | undefined): ParsedSettings => {
  if (!body) {
    return { settings: defaultSettings, raw: null };
  }
  const trimmed = body.trim();
  if (!trimmed) {
    return { settings: defaultSettings, raw: null };
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return { settings: defaultSettings, raw: null };
    }
    const enableUnsafeFixes =
      typeof parsed.enableUnsafeFixes === "boolean" ? parsed.enableUnsafeFixes : false;
    const enabledBy =
      parsed.unsafeFixesEnabledBy &&
      typeof parsed.unsafeFixesEnabledBy === "object" &&
      typeof (parsed.unsafeFixesEnabledBy as { login?: unknown }).login === "string" &&
      typeof (parsed.unsafeFixesEnabledBy as { id?: unknown }).id === "number"
        ? {
            login: (parsed.unsafeFixesEnabledBy as { login: string }).login,
            id: (parsed.unsafeFixesEnabledBy as { id: number }).id,
          }
        : null;
    const enabledAt =
      typeof parsed.unsafeFixesEnabledAt === "string" ? parsed.unsafeFixesEnabledAt : null;
    return {
      settings: {
        enableUnsafeFixes,
        unsafeFixesEnabledBy: enabledBy,
        unsafeFixesEnabledAt: enabledAt,
      },
      raw: parsed,
    };
  } catch (error) {
    console.warn("Failed to parse settings issue JSON; defaulting to false.", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { settings: defaultSettings, raw: null };
  }
};

const serializeSettingsBody = (
  raw: Record<string, unknown>,
  settings: RepoSettings,
): string => {
  const body = {
    ...raw,
    enableUnsafeFixes: settings.enableUnsafeFixes,
    unsafeFixesEnabledBy: settings.unsafeFixesEnabledBy,
    unsafeFixesEnabledAt: settings.unsafeFixesEnabledAt,
  };
  return `${JSON.stringify(body, null, 2)}\n`;
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
      return defaultSettings;
    }
    const { settings, raw } = parseSettingsIssueBody(settingsIssue.body);
    if (settings.enableUnsafeFixes) {
      const fallbackUser = settingsIssue.user ?? null;
      const enabledBy =
        settings.unsafeFixesEnabledBy ??
        (fallbackUser
          ? {
              login: fallbackUser.login,
              id: fallbackUser.id,
            }
          : null);
      const enabledAt =
        settings.unsafeFixesEnabledAt ??
        settingsIssue.updated_at ??
        settingsIssue.created_at ??
        null;
      const needsUpdate =
        settings.unsafeFixesEnabledBy === null || settings.unsafeFixesEnabledAt === null;
      if (needsUpdate && raw && enabledBy && enabledAt) {
        const updatedSettings: RepoSettings = {
          ...settings,
          unsafeFixesEnabledBy: enabledBy,
          unsafeFixesEnabledAt: enabledAt,
        };
        try {
          await octokit.rest.issues.update({
            owner,
            repo,
            issue_number: settingsIssue.number,
            body: serializeSettingsBody(raw, updatedSettings),
          });
        } catch (error) {
          console.warn("Failed to update settings issue metadata.", {
            owner,
            repo,
            issueNumber: settingsIssue.number,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return updatedSettings;
      }
      return {
        ...settings,
        unsafeFixesEnabledBy: enabledBy,
        unsafeFixesEnabledAt: enabledAt,
      };
    }
    return settings;
  } catch (error) {
    console.warn("Failed to read settings issue; defaulting to false.", {
      owner,
      repo,
      error: error instanceof Error ? error.message : String(error),
    });
    return defaultSettings;
  }
};
