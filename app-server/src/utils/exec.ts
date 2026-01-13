import { spawn } from "node:child_process";

export type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export const runCommand = (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<CommandResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      resolve({
        code: code ?? 0,
        stdout,
        stderr,
      });
    });
  });

export const runRequiredCommand = async (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<CommandResult> => {
  const result = await runCommand(command, args, options);
  if (result.code !== 0) {
    const error = new Error(
      `Command failed: ${command} ${args.join(" ")}.`,
    ) as Error & { result?: CommandResult };
    error.result = result;
    throw error;
  }
  return result;
};
