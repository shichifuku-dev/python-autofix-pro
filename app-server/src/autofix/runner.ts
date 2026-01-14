import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCommand, runRequiredCommand } from "../utils/exec.js";

export type AutofixInput = {
  token: string;
  headRepoFullName: string;
  headRef: string;
  headSha: string;
  commitMessage: string;
};

export type AutofixResult = {
  checkConclusion: "success" | "failure";
  autofixConclusion: "success" | "neutral";
  summary: string;
  details: string;
  appliedFixes: boolean;
};

export class AutofixError extends Error {
  readonly logs: string[];

  constructor(message: string, logs: string[], cause?: unknown) {
    super(message);
    this.name = "AutofixError";
    this.logs = logs;
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

const isBlackConfigured = (repoPath: string): boolean => {
  const pyprojectPath = path.join(repoPath, "pyproject.toml");
  if (fs.existsSync(pyprojectPath)) {
    const content = fs.readFileSync(pyprojectPath, "utf8");
    if (content.includes("[tool.black]")) {
      return true;
    }
  }

  const setupCfgPath = path.join(repoPath, "setup.cfg");
  if (fs.existsSync(setupCfgPath)) {
    const content = fs.readFileSync(setupCfgPath, "utf8");
    if (content.includes("[black]")) {
      return true;
    }
  }

  const requirementsPath = path.join(repoPath, "requirements.txt");
  if (fs.existsSync(requirementsPath)) {
    const content = fs.readFileSync(requirementsPath, "utf8");
    if (content.match(/\bblack\b/i)) {
      return true;
    }
  }

  return false;
};

const ensureRuff = async (cwd: string, logs: string[]): Promise<void> => {
  const versionResult = await runCommand("ruff", ["--version"], { cwd });
  if (versionResult.code === 0) {
    logs.push(`ruff detected: ${versionResult.stdout.trim()}`);
    return;
  }

  if (versionResult.stderr.trim()) {
    logs.push(versionResult.stderr.trim());
  }
  logs.push("ruff not found in PATH. Ensure the server image includes ruff.");
  throw new Error("ruff is required but missing.");
};

const ensureBlack = async (cwd: string, logs: string[]): Promise<void> => {
  const versionResult = await runCommand("python", ["-m", "black", "--version"], {
    cwd,
  });
  if (versionResult.code === 0) {
    logs.push(`black detected: ${versionResult.stdout.trim()}`);
    return;
  }

  logs.push("black not found. Installing black via pip.");
  await runRequiredCommand("python", ["-m", "pip", "install", "black"], { cwd });
};

const runRuffFormatting = async (cwd: string, logs: string[]) => {
  const formatResult = await runCommand("ruff", ["format", "."], {
    cwd,
  });
  logs.push(formatResult.stdout.trim());
  if (formatResult.code !== 0) {
    logs.push(formatResult.stderr.trim());
    throw new Error("ruff format failed.");
  }

  const checkFixResult = await runCommand(
    "ruff",
    ["check", ".", "--fix"],
    { cwd },
  );
  logs.push(checkFixResult.stdout.trim());
  if (checkFixResult.code !== 0) {
    logs.push(checkFixResult.stderr.trim());
  }
};

const runRuffVerification = async (cwd: string, logs: string[]) => {
  const formatCheck = await runCommand("ruff", ["format", "--check", "."], {
    cwd,
  });
  logs.push(formatCheck.stdout.trim());

  const lintCheck = await runCommand("ruff", ["check", "."], {
    cwd,
  });
  logs.push(lintCheck.stdout.trim());

  if (formatCheck.code !== 0 || lintCheck.code !== 0) {
    logs.push(formatCheck.stderr.trim());
    logs.push(lintCheck.stderr.trim());
    return false;
  }

  return true;
};

export const runAutofix = async (input: AutofixInput): Promise<AutofixResult> => {
  const logs: string[] = [];
  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "python-autofix-"),
  );

  const repoUrl = `https://x-access-token:${input.token}@github.com/${input.headRepoFullName}.git`;

  try {
    await runRequiredCommand("git", ["clone", repoUrl, tempDir]);
    await runRequiredCommand("git", ["fetch", "origin", input.headRef], {
      cwd: tempDir,
    });
    await runRequiredCommand(
      "git",
      ["checkout", "-B", input.headRef, `origin/${input.headRef}`],
      { cwd: tempDir },
    );

    await runRequiredCommand(
      "git",
      ["config", "user.name", "python-autofix-pro[bot]"],
      { cwd: tempDir },
    );
    await runRequiredCommand(
      "git",
      ["config", "user.email", "python-autofix-pro@users.noreply.github.com"],
      { cwd: tempDir },
    );

    logs.push(`Checked out ${input.headRef} at ${input.headSha}.`);

    await ensureRuff(tempDir, logs);
    await runRuffFormatting(tempDir, logs);

    if (isBlackConfigured(tempDir)) {
      logs.push("black configuration detected; running black.");
      await ensureBlack(tempDir, logs);
      const blackResult = await runCommand("python", ["-m", "black", "."], {
        cwd: tempDir,
      });
      logs.push(blackResult.stdout.trim());
      if (blackResult.code !== 0) {
        logs.push(blackResult.stderr.trim());
      }
    }

    const statusResult = await runCommand("git", ["status", "--porcelain"], {
      cwd: tempDir,
    });
    const hasChanges = statusResult.stdout.trim().length > 0;

    let appliedFixes = false;
    if (hasChanges) {
      await runRequiredCommand("git", ["add", "-A"], { cwd: tempDir });
      await runRequiredCommand("git", ["commit", "-m", input.commitMessage], {
        cwd: tempDir,
      });
      await runRequiredCommand("git", ["push", "origin", `HEAD:${input.headRef}`], {
        cwd: tempDir,
      });
      appliedFixes = true;
      logs.push("Applied fixes and pushed to the PR head branch.");
    }

    const verificationPass = await runRuffVerification(tempDir, logs);

    return {
      checkConclusion: verificationPass ? "success" : "failure",
      autofixConclusion: "success",
      summary: verificationPass
        ? appliedFixes
          ? "Applied Python formatting fixes."
          : "No formatting changes needed."
        : "Formatting completed, but lint checks still report issues.",
      details: logs.filter(Boolean).join("\n"),
      appliedFixes,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error.");
    logs.push(`Autofix failed: ${err.message}`);
    throw new AutofixError(err.message, logs.filter(Boolean), err);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
};
