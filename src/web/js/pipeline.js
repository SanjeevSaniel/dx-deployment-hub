// The pipeline stepper: Validate, Lint, Bundle, Package, Publish. The CLI prints a line as it starts each step, so the steps are moved along by
// reading its output. Each step is a class on its element (active, done, failed, locked, invalid, auth) and the styles do the rest.
import { state } from './state.js';
import { $ } from './util.js';

const STEPS = ['step-validate', 'step-lint', 'step-bundle', 'step-zip', 'step-publish'];

// How many of the steps each action goes through: validating stops after the first, a build after the fourth.
const STEPS_DONE = {
  validateSchema: 1,
  buildComponent: 4,
  buildAllComponents: 4,
  publish: 5,
  publishAll: 5
};

// What each step is called while it is going, for the line under the terminal.
const STEP_WORDS = {
  'step-validate': 'Validating',
  'step-lint': 'Linting',
  'step-bundle': 'Bundling',
  'step-zip': 'Packaging',
  'step-publish': 'Publishing to the server'
};

const setStep = (id, cls) => {
  const el = $(id);
  if (el) el.className = 'step ' + cls;
};

export function resetSteps() {
  STEPS.forEach(id => setStep(id, ''));
  state.step = null;
}

/** Moves the stepper along. A chunk of output can hold several lines, so each is looked at in turn and the steps go as far as the last one says. */
export function stepsFromOutput(text) {
  const move = (done, active) => {
    if (done) setStep(done, 'done');
    setStep(active, 'active');
    // How many steps this run goes through (validating stops after the first, a build after the fourth) so "2 of 5" is true for it.
    state.step = {
      label: STEP_WORDS[active],
      n: STEPS.indexOf(active) + 1,
      total: STEPS_DONE[state.currentAction] || STEPS.length
    };
  };
  String(text)
    .split(/\r?\n/)
    .forEach(line => {
      const l = line.toLowerCase();
      if (l.includes('validate config schema') || l.includes('validating'))
        move(null, 'step-validate');
      else if (l.includes('lint component') || l.includes('linting'))
        move('step-validate', 'step-lint');
      else if (l.includes('bundle component') || l.includes('bundling'))
        move('step-lint', 'step-bundle');
      else if (l.includes('zip component') || l.includes('zipping'))
        move('step-bundle', 'step-zip');
      else if (l.includes('publish component') || l.includes('publishing to server'))
        move('step-zip', 'step-publish');
    });
  // Tells the line under the terminal, which cannot see the output itself.
  document.dispatchEvent(new CustomEvent('dx-step'));
}

/** The step that was running is the one Pega refused, so it takes that problem's colour (amber locked, violet invalid, rose sign-in). */
export function markIssueStep(kind) {
  (document.querySelector('.step.active') || $('step-publish')).className = 'step ' + kind;
}

/**
 * Puts the stepper back as the last run left it after the page is reloaded. The stepper is only moved by live output, so without this a
 * reload would blank it. The saved log is replayed through the same reading the live run uses, so both always agree. A run the reload itself
 * cut short ends unfinished, and shows as failed at the step it was on.
 */
export function restoreSteps(run) {
  // A sign-in has no pipeline, so it never changes the stepper.
  if (!run || run.action === 'authenticate') return;
  resetSteps();
  stepsFromOutput(run.log || '');
  if (!run.endedAt) return;
  const ok = run.exitCode === 0;
  const stopped = Boolean(run.aborted);
  finishSteps({ action: run.action, ok, stopped, issue: !ok && !stopped ? run.issue : null });
}

/** The final state of the stepper once a run has ended. A sign-in has no pipeline, so it is left alone. */
export function finishSteps({ action, ok, stopped, issue }) {
  state.step = null;
  if (ok) {
    STEPS.forEach((id, index) => setStep(id, index < (STEPS_DONE[action] || 0) ? 'done' : ''));
  } else if (stopped) {
    document.querySelector('.step.active')?.setAttribute('class', 'step');
  } else if (issue && action !== 'authenticate') {
    (
      document.querySelector('.step.' + issue) || document.querySelector('.step.active')
    )?.setAttribute('class', 'step ' + issue);
  } else {
    document.querySelector('.step.active')?.setAttribute('class', 'step failed');
  }
}
