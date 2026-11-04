// Ending a run.
import { spawn } from 'node:child_process';

/**
 * Ends a run and everything it started. The CLI starts other processes of its own (the bundler, for one), and on Windows
 * killing only the CLI leaves those running, so the whole tree is ended there. A process that has not gone after three
 * seconds is killed outright.
 */
export function stopProcess(child) {
  try {
    if (process.platform === 'win32')
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  } catch {
    /* it has already gone */
  }
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill('SIGKILL');
      } catch {
        /* gone */
      }
    }
  }, 3000).unref();
}
