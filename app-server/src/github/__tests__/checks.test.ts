import { describe, expect, it, vi } from "vitest";
import { buildCheckOutput, createCheckRun } from "../checks.js";
import type { Octokit } from "@octokit/rest";

describe("buildCheckOutput", () => {
  it("fills in default text", () => {
    const output = buildCheckOutput({
      title: "Python Autofix Pro",
      summary: "Started",
    });

    expect(output).toEqual({
      title: "Python Autofix Pro",
      summary: "Started",
      text: "",
    });
  });
});

describe("createCheckRun", () => {
  it("creates a check run with expected payload", async () => {
    const createMock = vi.fn().mockResolvedValue({ data: { id: 99 } });
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const octokit = {
      rest: {
        checks: {
          create: createMock,
        },
      },
    } as unknown as Octokit;

    const id = await createCheckRun(octokit, {
      owner: "octo-org",
      repo: "demo",
      name: "CI/check",
      headSha: "abc123",
      installationId: 12345,
      action: "opened",
      status: "in_progress",
      output: {
        title: "Python Autofix Pro",
        summary: "Running",
      },
    });

    expect(id).toBe(99);
    expect(createMock).toHaveBeenCalledWith({
      owner: "octo-org",
      repo: "demo",
      name: "CI/check",
      head_sha: "abc123",
      status: "in_progress",
      conclusion: undefined,
      output: {
        title: "Python Autofix Pro",
        summary: "Running",
        text: "",
      },
    });
    expect(infoSpy).toHaveBeenCalled();
    infoSpy.mockRestore();
  });
});
