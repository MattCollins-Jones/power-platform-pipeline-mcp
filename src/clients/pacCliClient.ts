import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface PacResult {
  stdout: string;
  stderr: string;
  /** Process exit code; 0 = success */
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
 * @param args - CLI arguments, e.g. ["pipeline", "deploy", "--solutionName", "MySolution"]
 * @param timeoutMs - Maximum execution time in milliseconds (default: 2 minutes)
 */
export async function runPacCommand(
  args: string[],
  timeoutMs = 120_000
): Promise<PacResult> {
  // Sanitise: disallow shell metacharacters in individual arguments
  for (const arg of args) {
    if (/[;&|`$<>]/.test(arg)) {
      throw new Error(`Potentially unsafe argument rejected: "${arg}"`);
    }
  }

  const command = `pac ${args.join(' ')}`;

  try {
    const { stdout, stderr } = await execAsync(command, { timeout: timeoutMs });
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0, success: true };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; code?: number; message?: string };
    return {
      stdout: (err.stdout ?? '').trim(),
      stderr: (err.stderr ?? err.message ?? '').trim(),
      exitCode: err.code ?? 1,
      success: false,
    };
  }
}
