// Running an action: Publish, Publish all, Build, Validate, Sign in. The server answers with a stream of events; each one moves a part of the
// page: the block in the terminal, the stepper, the sign-in status, the run list.
import { ACTION_NAMES, PUBLISHING } from './actions.js';
import { api, streamRun } from './api.js';
import { confirmDialog } from './confirm-dialog.js';
import { renderEnvironments } from './environments.js';
import { setPanel } from './chrome.js';
import { finishSteps, markIssueStep, resetSteps, stepsFromOutput } from './pipeline.js';
import { flashResult, launch } from './motion.js';
import { reload } from './reload.js';
import { renderRuns } from './runs.js';
import { currentEnv, state } from './state.js';
import { renderAuthPill, renderTarget, updateButtons } from './target.js';
import { addBlock, finishBlock, foldOthers, makeBlock, tickBlock, toLatest } from './terminal.js';
import { $, ansiToHtml, cleanEnvLabel, toast } from './util.js';

// Actions that act on everything, or on no component at all, are sent without the chosen one.
const WITHOUT_COMPONENT = ['publishAll', 'buildAllComponents', 'authenticate'];

const ISSUE_TOASTS = {
  auth: 'Sign-in failed: check the connection',
  invalid: 'Pega does not accept this ruleset version',
  locked: 'This ruleset version is locked in Pega'
};

/** The message when a run ends: what was done, or what went wrong. */
function endMessage(action, { ok, stopped, issue }) {
  if (issue === 'auth') return 'Sign-in failed';
  const name = ACTION_NAMES[action] || action;
  if (stopped) return name + ' stopped';
  if (issue === 'locked') return name + ': the ruleset version is locked';
  if (issue === 'invalid') return name + ': the ruleset version is not accepted';
  return name + (ok ? ' finished' : ' failed');
}

/** Sets the page up for a run: nothing about the target can change under it, and a sign-in clears the last failure. */
function beginRun(action) {
  state.running = true;
  state.currentAction = action;
  state.signingIn = action === 'authenticate';
  if (state.signingIn) {
    state.signInFailed = false;
    state.serverDown = false;
  } else {
    resetSteps();
  }
  renderAuthPill();
  renderTarget();
  renderEnvironments();
  updateButtons();
}

/**
 * Runs one action and answers how it ended: { ok, stopped, issue }.
 *   component  the component to act on, when it is not the one chosen on the page (Publish several names each in turn)
 *   quiet      no message at the end for one that went through or was stopped; the caller says it once for the whole list
 */
export async function runAction(action, { component, quiet = false } = {}) {
  if (state.running) return { ok: false, stopped: false, issue: null };
  const env = currentEnv();
  const body = {
    action,
    environmentId: env?.id,
    // Where it goes is the environment; which version is the one typed on the page.
    rulesetVersion: env?.rulesetVersion,
    component: WITHOUT_COMPONENT.includes(action) ? undefined : component || state.component
  };
  beginRun(action);
  if (action === 'publish') launch();
  let entry = null;
  let finishedWith = null;

  const onEvent = (name, data) => {
    if (name === 'start') {
      state.selectedRun = data.id;
      state.runs.unshift({ ...data });
      renderRuns();
      entry = makeBlock(data);
      addBlock(entry);
      foldOthers(entry);
      tickBlock(entry);
      toLatest(true);
    }
    if (data.text && entry) {
      entry.out.insertAdjacentHTML('beforeend', ansiToHtml(data.text));
      toLatest();
      stepsFromOutput(data.text);
    }
    if (name === 'error' && data.message && entry) {
      entry.out.insertAdjacentHTML(
        'beforeend',
        '<span class="ansi-red">' + ansiToHtml(data.message) + '</span>\n'
      );
    }
    if (name === 'issue') {
      if (data.kind === 'auth') {
        state.signInFailed = true;
        renderTarget();
      }
      if (action !== 'authenticate') markIssueStep(data.kind);
      toast(ISSUE_TOASTS[data.kind] || 'The run reported a problem', 'error');
    }
    if (name === 'complete') {
      finishedWith = data;
      if (data.run && data.run.serverUp === false) {
        state.serverDown = true;
        renderTarget();
      }
      if (entry) finishBlock(entry, data.run);
    }
  };

  try {
    await streamRun(body, onEvent);
  } catch (err) {
    // The run never started (or the connection dropped): show why, as a block of its own.
    if (!entry) {
      entry = makeBlock({
        id: 'local-' + Date.now(),
        action,
        component: body.component,
        startedAt: new Date().toISOString(),
        environmentName: env?.serverName || env?.name
      });
      addBlock(entry);
      foldOthers(entry);
    }
    entry.out.insertAdjacentHTML(
      'beforeend',
      '<span class="ansi-red">' + ansiToHtml(err.message) + '</span>\n'
    );
    finishBlock(entry, {
      endedAt: new Date().toISOString(),
      startedAt: new Date(entry.startedAt).toISOString(),
      exitCode: 1
    });
    toLatest(true);
  }

  state.running = false;
  state.currentAction = '';
  state.signingIn = false;
  const ok = finishedWith?.exitCode === 0;
  const stopped = Boolean(finishedWith?.run?.aborted);
  const issue = !ok && !stopped ? finishedWith?.run?.issue : null;
  finishSteps({ action, ok, stopped, issue });
  if (finishedWith?.auth) state.auth = finishedWith.auth;
  if (!(quiet && (ok || stopped))) {
    toast(endMessage(action, { ok, stopped, issue }), ok || stopped ? undefined : 'error');
  }
  // The terminal starts closed to keep the screen simple; when a run fails it opens so the reason is in front of the user.
  if (!ok && !stopped) setPanel('terminal', true, { remember: false });
  await reload();
  // After the reload, so the button is back on screen (Publish takes Stop's place again) when it pulses. Not for each step of Publish several.
  if (!quiet) flashResult(action, { ok, stopped });
  return { ok, stopped, issue };
}

/** The buttons that start an action, and Stop. */
export function initActions() {
  $('btnPublish').addEventListener('click', () => runAction('publish'));
  // Every component goes to the server, so it asks first.
  $('btnPublishAll').addEventListener('click', async () => {
    const env = currentEnv();
    if (!env) return;
    const where = env.serverName || cleanEnvLabel(env.name, env.rulesetName);
    const sure = await confirmDialog({
      title: 'Publish all ' + state.components.length + ' components?',
      lead: 'To ' + where + ' (' + env.rulesetName + ' ' + env.rulesetVersion + ').',
      note: 'Every component goes to the server in one run.',
      confirm: 'Publish all'
    });
    if (sure) runAction('publishAll');
  });
  $('btnBuild').addEventListener('click', () => runAction('buildComponent'));
  $('btnValidate').addEventListener('click', () => runAction('validateSchema'));
  $('signInBtn').addEventListener('click', () => runAction('authenticate'));
  // Reauth lets the user refresh the token at any time — same action as Sign In, but triggered from an already-signed-in state.
  $('reauthBtn').addEventListener('click', () => runAction('authenticate'));
  $('btnAbort').addEventListener('click', async () => {
    if (PUBLISHING[state.currentAction] || state.queue) {
      const sure = await confirmDialog({
        title: 'Stop publishing?',
        lead: state.queue
          ? 'Anything already published to the server stays there, and the components still waiting are not published.'
          : 'Anything already published to the server stays there.',
        confirm: 'Stop publishing',
        danger: true
      });
      if (!sure) return;
    }
    // The rest of the list is cancelled first, so the next component does not start when this one ends.
    if (state.queue) state.queue.cancelled = true;
    api('/api/abort', {}).catch(err => toast(err.message, 'error'));
  });
}
