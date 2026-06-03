import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// On Linux/Docker (production), execFile spawns pac directly without a shell,
// eliminating shell-injection risk entirely.
// On Windows (local dev), .NET global tool wrappers are .cmd files and require
// a shell to execute, so we fall back to shell mode only on that platform.
const PAC_BINARY = process.platform === 'win32' ? 'pac.cmd' : 'pac';
const SHELL_REQUIRED = process.platform === 'win32';

export interface PacResult {
  stdout: string;
  stderr: string;
  /** Numeric process exit code; 0 = success. 127 = binary not found (ENOENT). */
  exitCode: number;
  success: boolean;
}

/**
 * Runs a PAC CLI command and returns its output.
 *
 * PAC CLI must be installed on the server and authenticated via service
 * principal *before* calling this function. See docker-entrypoint.sh for the
 * `pac auth create` invocation used in the container.
 *
 * Arguments are passed as an array directly to execFile, bypassing the shell
 * on Linux/Docker so no metacharacter escaping is required. CR/LF characters
 * are rejected because they can act as command separators in shells and
 * produce unexpected log output.
 *
 * @param args - CLI arguments, e.g. ["pipeline", "deploy", "--solutionName", "MySolution"]
 * @param timeoutMs - Maximum execution time in milliseconds (default: 2 minutes)
 */
export async function runPacCommand(
  args: string[],
  timeoutMs = 120_000
): Promise<PacResult> {
  for (const arg of args) {
    if (/[\r\n]/.test(arg)) {
      throw new Error(`Argument contains CR/LF and was rejected: "${arg}"`);
    }
  }

  try {
    const { stdout, stderr } = await execFileAsync(PAC_BINARY, args, {
      timeout: timeoutMs,
      shell: SHELL_REQUIRED,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0, success: true };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; code?: string | number; message?: string };
    // err.code is numeric (exit code) when the process exits non-zero,
    // or a string error code (e.g. "ENOENT") when the binary couldn't be found.
    const raw = err.code;
    const exitCode = typeof raw === 'number' ? raw : raw === 'ENOENT' ? 127 : 1;
    return {
      stdout: (err.stdout ?? '').trim(),
      stderr: (err.stderr ?? err.message ?? '').trim(),
      exitCode,
      success: false,
    };
  }
}
