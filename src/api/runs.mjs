// Runs: starting the CLI, streaming what it prints to the page, remembering the last few so a finished deployment can be looked at again.
// Only one run is active at a time. Runs are kept in memory only, newest first.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { PATHS, LIMITS, ROOT_DIR } from './config.mjs';
import { getAuthStatus } from './auth.mjs';
import { PROBLEM_NOTES, runProblemIn, serverResponds } from './problems.mjs';
import { stopProcess } from './process.mjs';
import { hostOf } from './util.mjs';
import { classifyPublish, recordPublish } from './history.mjs';
import { getComponentList } from './components.mjs';

let activeProcess = null;
const runs = [];

/** A run as the page gets it: everything except the output, which is fetched separately. */
const runSummary = ({ log, ...rest }) => rest;

export const isRunning = () => activeProcess !== null;
export const listRuns = () => runs.map(runSummary);
export const findRun = id => runs.find(entry => entry.id === id);

/**
 * Ends the active run. It is marked first, so its end is reported as "stopped" and not as a failure. The process stays the active one
 * until it has really ended, so another run cannot start on top of it. Returns false when nothing is running.
 */
export function abortActiveRun() {
  if (!activeProcess) return false;
  const running = runs.find(entry => entry.endedAt === null);
  if (running) running.aborted = true;
  stopProcess(activeProcess);
  return true;
}

function rememberRun(run) {
  runs.unshift(run);
  if (runs.length > LIMITS.runs) runs.length = LIMITS.runs;
}

function newRun({ action, component, environment, cliArgs }) {
  // Only a publish has a kind. It is worked out before the run starts, from what has already gone to this server.
  const publishing = ['publish', 'publishAll'].includes(action) && environment;
  const { kind, lastAt } = publishing
    ? classifyPublish({
        server: hostOf(environment.serverUrl),
        ruleset: environment.rulesetName,
        version: environment.rulesetVersion,
        component: action === 'publish' ? component : null
      })
    : { kind: null, lastAt: null };
  return {
    id: `run-${Date.now()}`,
    action,
    component: component || null,
    environmentId: environment?.id ?? null,
    environmentName: (environment?.serverName || environment?.name) ?? null,
    server: environment ? hostOf(environment.serverUrl) : null,
    ruleset: environment?.rulesetName ?? null,
    version: environment?.rulesetVersion ?? null,
    devBuild: environment ? environment.devBuild : null,
    // 'publish', 'republish' or 'newVersion' for a publish, null for anything else (see history.mjs).
    kind,
    // When this component last went to exactly this ruleset and version; null unless this is a republish.
    lastPublishedAt: lastAt,
    // Shown as the command line of the run's block in the page's terminal.
    command: 'custom-dx-components ' + cliArgs.slice(1).join(' '),
    startedAt: new Date().toISOString(),
    endedAt: null,
    exitCode: null,
    aborted: false,
    // 'auth', 'invalid' or 'locked' when the output said so (see problems.mjs).
    issue: null,
    // After a failed sign-in: true when the Pega server answers, false when it does not, null when not checked.
    serverUp: null,
    log: ''
  };
}

/**
 * Starts the CLI and streams its output to the response as Server-Sent Events:
 *   start (the run), stdout / stderr (text), issue (a recognised problem), error (could not start), complete (the run, how it ended).
 */
export function startRun({ req, res, action, component, environment, cliArgs }) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });
  const sendEvent = (event, data) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const run = newRun({ action, component, environment, cliArgs });
  rememberRun(run);
  const append = text => {
    if (run.log.length < LIMITS.logChars) run.log += text;
  };
  const say = (text, ansi) => {
    append(`\n${text}\n`);
    sendEvent('stdout', { text: `\n\u001b[${ansi}m${text}\u001b[39m\n` });
  };

  sendEvent('start', runSummary(run));

  const child = spawn(process.execPath, cliArgs, {
    // No input is given: a question the CLI asks fails at once with its error, instead of waiting for an answer that never comes.
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: ROOT_DIR,
    env: { ...process.env, FORCE_COLOR: '1', CI: 'true' }
  });
  activeProcess = child;

  // The last part of the output is checked, so a message split between two chunks is still seen.
  const noteProblem = () => {
    if (run.issue || !['publish', 'publishAll', 'authenticate'].includes(action)) return;
    const kind = runProblemIn(run.log.slice(-600));
    if (!kind) return;
    run.issue = kind;
    sendEvent('issue', { kind, message: PROBLEM_NOTES[kind] });
    // Magenta for a sign-in problem, yellow for a ruleset one: the same split as the colours of the status badges.
    say(PROBLEM_NOTES[kind], kind === 'auth' ? 35 : 33);
  };
  const onOutput = event => chunk => {
    const text = chunk.toString('utf8');
    append(text);
    sendEvent(event, { text });
    noteProblem();
  };
  child.stdout.on('data', onOutput('stdout'));
  child.stderr.on('data', onOutput('stderr'));

  child.on('error', err => {
    activeProcess = null;
    run.endedAt = new Date().toISOString();
    run.exitCode = 1;
    append(`${err.message}\n`);
    sendEvent('error', { message: err.message });
    res.end();
  });

  child.on('close', async exitCode => {
    activeProcess = null;
    // The CLI ends a failed sign-in with exit code 0 and says so only in its words ("Authentication failed"), so that output decides.
    // Any other problem seen on the way does not count if the run went through.
    const code = run.issue === 'auth' && exitCode === 0 ? 1 : exitCode;
    run.exitCode = code;
    if (code === 0) run.issue = null;
    if (run.issue === 'auth' && environment) {
      // "Token endpoint error" is most often a Pega server that is not running, so that is checked and said.
      run.serverUp = await serverResponds(environment.serverUrl);
      if (!run.serverUp) say(PROBLEM_NOTES.serverDown, 35);
    }
    run.endedAt = new Date().toISOString();
    if (run.aborted) {
      append('\nStopped.\n');
      sendEvent('stdout', { text: '\n\u001b[33mStopped.\u001b[39m\n' });
    }
    if (['publish', 'publishAll'].includes(action) && code === 0 && !run.aborted && environment) {
      recordPublish({
        server: hostOf(environment.serverUrl),
        ruleset: environment.rulesetName,
        version: environment.rulesetVersion,
        components: action === 'publish' ? [component] : await getComponentList()
      });
    }
    if (action === 'authenticate' && code === 0 && environment) {
      writeFileSync(
        PATHS.authState,
        JSON.stringify({ server: hostOf(environment.serverUrl) }, null, 2),
        'utf8'
      );
    }
    sendEvent('complete', {
      run: runSummary(run),
      exitCode: code,
      success: code === 0,
      auth: getAuthStatus()
    });
    res.end();
  });

  // The page went away mid-run: the run goes with it.
  req.on('close', () => {
    if (activeProcess === child) {
      try {
        child.kill('SIGTERM');
      } catch {
        /* already gone */
      }
      activeProcess = null;
    }
  });
}
