// The target: what a run will act on. A server, then a ruleset on it, then a version of that ruleset, and a component. Also the sign-in status
// in the header, and which buttons may be pressed.
import { ACTION_NAMES, STOP_LABELS } from './actions.js';
import { enhanceSelect, refreshPickers } from './picker.js';
import { currentEnv, connectionOf, runNumber, signInState, state } from './state.js';
import { $, h, hostOf, shortName, unique } from './util.js';

// ── The sign-in status in the header ─────────────────────────────────────

/** The clock beside the server name: how long the sign-in has left, coloured by how soon it runs out. Hidden when there is no sign-in to time. */
function showTimeLeft(minutes) {
  const badge = $('authTime');
  const known = typeof minutes === 'number' && minutes >= 0;
  badge.hidden = !known;
  if (!known) return;
  $('authMinutes').textContent = minutes < 1 ? '<1 min' : minutes + ' min';
  badge.classList.toggle('is-low', minutes < 15 && minutes >= 5);
  badge.classList.toggle('is-soon', minutes < 5);
}

/**
 * The server the sign-in is for, as the person knows it: its name from the file (Dev, Staging), with its full address for the tooltip. The
 * sign-in only records a host, so the name is found from the environments that use that host; the chosen one is preferred when
 * several do. A host the hub does not list shows as it is.
 */
function signedInServer(host) {
  const uses = env => hostOf(env.serverUrl) === host;
  // One that has a name is preferred: an environment typed into the page may have none.
  const named = state.environments.filter(env => uses(env) && env.serverName);
  const env =
    uses(currentEnv() ?? {}) && currentEnv().serverName
      ? currentEnv()
      : (named[0] ?? state.environments.find(uses));
  return { name: env?.serverName || host, url: env?.serverUrl || host };
}

/** The header's pill says how things stand, and why in its tooltip. It informs; the button beside it is the one place to sign in. */
export function renderAuthPill() {
  const auth = state.auth;
  showTimeLeft(undefined);
  const dot = $('authDot');
  let title = '';
  if (state.signingIn) {
    // The earlier sign-in is not shown as active while a new one is being made.
    dot.className = 'dot run';
    $('authText').textContent = 'Signing in...';
  } else if (auth?.authenticated) {
    dot.className = 'dot ok';
    const server = auth.server ? signedInServer(auth.server) : null;
    $('authText').textContent = server?.name || 'Signed in';
    showTimeLeft(auth.expiresInMinutes);
    // The name is what is shown; the address is there on hover.
    if (server)
      title =
        server.url +
        (auth.expiresInMinutes ? ' (signed in, ' + auth.expiresInMinutes + ' min left)' : '');
  } else if (state.signInFailed) {
    dot.className = 'dot rose';
    $('authText').textContent = 'Sign-in failed';
    title = state.serverDown
      ? 'The Pega server did not answer. It may be stopped or not reachable. Start it, then try again.'
      : 'Check the client ID, secret and server address under Connections, then try again.';
  } else {
    dot.className = 'dot warn';
    $('authText').textContent = auth?.expired ? 'Sign-in expired' : 'Not signed in';
  }
  // On a very narrow screen only the dot is shown, so the words are kept in the tooltip.
  $('authPill').title = title || $('authText').textContent;
}

// ── Server, ruleset, version ─────────────────────────────────────────────

// The server and the ruleset are picked from what the file lists. The version is typed: versions change often, and the person
// knows which one this publish is, so it is not limited to the ones the file happens to list. Three two-digit parts, as Pega writes them.
const VERSION = /^\d{2}-\d{2}-\d{2}$/;
const isVersion = text => VERSION.test(text);

const versionKey = env => 'dx-hub-version:' + env.serverUrl + '|' + env.rulesetName;

function lastVersion(env) {
  try {
    return localStorage.getItem(versionKey(env)) || '';
  } catch {
    return '';
  }
}

/** What the Version box starts with for a server and ruleset: the last version typed for them, or else the highest one the file lists. */
function startingVersion(env) {
  const remembered = lastVersion(env);
  if (isVersion(remembered)) return remembered;
  const listed = state.environments
    .filter(entry => entry.serverUrl === env.serverUrl && entry.rulesetName === env.rulesetName)
    .map(entry => entry.rulesetVersion)
    .filter(isVersion)
    .sort();
  return listed[listed.length - 1] || env.rulesetVersion || '';
}

// The Version is three individual boxes, major - minor - patch. Each has its own input with proper up and down arrows positioned
// above and below the number (the arrow keys do the same). A part is two digits, 00 to 99; stepping does not carry into the next part.
const PART_NAMES = ['Major', 'Minor', 'Patch'];
const ARROW_UP =
  '<svg viewBox="0 0 14 10" aria-hidden="true"><path d="M2.5 7.5 7 3l4.5 4.5"/></svg>';
const ARROW_DOWN =
  '<svg viewBox="0 0 14 10" aria-hidden="true"><path d="M2.5 2.5 7 7l4.5-4.5"/></svg>';

const partInputs = () => [...$('versionBox').querySelectorAll('.ver-in')];
const partsOf = text => [0, 1, 2].map(index => text.split('-')[index] ?? '');
const twoDigits = number => String(number).padStart(2, '0');

/** Puts the version in the three boxes. */
function writeParts() {
  const parts = partsOf(state.version);
  partInputs().forEach((input, index) => {
    input.value = parts[index];
  });
}

/** The version is whatever the three boxes hold, and a blank version is none at all. */
function changed() {
  const parts = partInputs().map(input => input.value);
  state.version = parts.every(part => part === '') ? '' : parts.join('-');
  state.versionTouched = true;
  if (isVersion(state.version)) {
    try {
      localStorage.setItem(versionKey(currentEnv()), state.version);
    } catch {
      /* not remembered */
    }
  }
  showVersionState();
  renderTarget();
}

function stepPart(index, by) {
  const input = partInputs()[index];
  input.value = twoDigits(Math.min(99, Math.max(0, (parseInt(input.value, 10) || 0) + by)));
  changed();
}

function goTo(index) {
  const input = partInputs()[index];
  if (!input) return;
  input.focus();
  input.select();
}

/** Green or red on the control and a short sentence once the person has typed in it; nothing while it is untouched. The arrows stop at 00 and 99. */
function showVersionState() {
  const box = $('versionBox');
  const wrong = state.versionTouched && !isVersion(state.version);
  box.classList.toggle('is-ok', state.versionTouched && isVersion(state.version));
  box.classList.toggle('is-bad', wrong);
  box.setAttribute('aria-invalid', String(wrong));
  const message = $('versionMsg');
  message.hidden = !wrong;
  message.textContent = wrong ? 'Three two-digit parts, like 01-01-01.' : '';
  const stopped = box.classList.contains('is-disabled');
  partInputs().forEach((input, index) => {
    const value = parseInt(input.value, 10) || 0;
    box.querySelector(`.ver-up[data-part="${index}"]`).disabled = stopped || value >= 99;
    box.querySelector(`.ver-down[data-part="${index}"]`).disabled = stopped || value <= 0;
  });
}

function setVersionDisabled(off) {
  $('versionBox').classList.toggle('is-disabled', off);
  $('versionBox')
    .querySelectorAll('input, button')
    .forEach(control => {
      control.disabled = off;
    });
  if (!off) showVersionState();
}

function buildVersionBox() {
  const box = $('versionBox');
  PART_NAMES.forEach((name, index) => {
    const input = h('input', {
      class: 'ver-in',
      type: 'text',
      inputmode: 'numeric',
      maxlength: '2',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: '00',
      'aria-label': 'Version ' + name.toLowerCase(),
      title: name
    });
    const arrow = (cls, label, icon, by) => {
      const button = h('button', {
        type: 'button',
        class: 'ver-btn ' + cls,
        'data-part': String(index),
        tabindex: '-1',
        'aria-label': label + ' ' + name.toLowerCase(),
        title: label + ' ' + name.toLowerCase()
      });
      button.innerHTML = icon;
      // The arrows must not take the focus from the box being edited, or a second click would start from nowhere.
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => stepPart(index, by));
      return button;
    };
    // Tabbing in or clicking in selects the part, so whatever is typed next replaces it. The click is needed as well as the focus: the browser
    // drops a selection made on focus when the mouse button is released.
    input.addEventListener('focus', () => input.select());
    input.addEventListener('click', () => input.select());
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 2);
      changed();
      // Two digits fill a part, so typing 010203 runs straight through all three.
      if (input.value.length === 2) goTo(index + 1);
    });
    input.addEventListener('blur', () => {
      if (input.value.length === 1) {
        input.value = twoDigits(input.value);
        changed();
      }
    });
    input.addEventListener('keydown', event => {
      const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
      const atEnd =
        input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        stepPart(index, event.key === 'ArrowUp' ? 1 : -1);
      } else if (['-', '.', '/', ' '].includes(event.key)) {
        // Typing the dash (or a dot or slash) moves on, so a version can be typed the way it is written.
        event.preventDefault();
        goTo(index + 1);
      } else if (event.key === 'Backspace' && input.value === '' && index > 0) {
        event.preventDefault();
        goTo(index - 1);
      } else if (event.key === 'ArrowLeft' && atStart && index > 0) {
        event.preventDefault();
        goTo(index - 1);
      } else if (event.key === 'ArrowRight' && atEnd && index < 2) {
        event.preventDefault();
        goTo(index + 1);
      }
    });
    // A whole version pasted into any box (01-02-03 or 010203) is shared out across the three.
    input.addEventListener('paste', event => {
      const digits = (event.clipboardData?.getData('text') || '').replace(/\D/g, '');
      if (digits.length <= 2) return;
      event.preventDefault();
      const from = digits.length >= 6 ? 0 : index;
      partInputs().forEach((box2, at) => {
        if (at >= from) box2.value = digits.slice((at - from) * 2, (at - from) * 2 + 2);
      });
      changed();
    });
    const upBtn = arrow('ver-up', 'Increase', ARROW_UP, 1);
    const downBtn = arrow('ver-down', 'Decrease', ARROW_DOWN, -1);
    const partWrap = h(
      'div',
      { class: 'ver-part', 'data-part': String(index), title: name },
      upBtn,
      input,
      downBtn,
      // A tiny caption says which part this is; the input already carries the name for a screen reader.
      h('span', { class: 'ver-cap', 'aria-hidden': 'true' }, name)
    );
    partWrap.addEventListener('click', event => {
      if (event.target === partWrap) input.focus();
    });
    box.append(partWrap);
    if (index < 2) box.append(h('span', { class: 'ver-dash', 'aria-hidden': 'true' }, '-'));
  });
}

// The target is a server and a ruleset, chosen from what the file lists, and a version, typed.
const serverLabel = env => env.serverName || hostOf(env.serverUrl) || env.name;

function fillSelect(select, values, keyOf, textOf, selected) {
  select.replaceChildren(
    ...(values.length
      ? values.map(value => h('option', { value: keyOf(value) }, textOf(value)))
      : [h('option', { value: '' }, 'None')])
  );
  select.value = selected;
  select.disabled = values.length === 0;
}

export function renderEnvSelect() {
  const all = state.environments;
  let chosen = all.find(env => env.id === state.envId);
  if (!chosen) {
    let last = '';
    try {
      last = localStorage.getItem('dx-hub-env') || '';
    } catch {
      /* nothing remembered */
    }
    chosen = all.find(env => env.id === last) || all[0];
  }
  state.envId = chosen ? chosen.id : '';
  fillSelect(
    $('serverSelect'),
    unique(all, env => env.serverUrl),
    env => env.serverUrl,
    env => serverLabel(env) + (env.serverName ? '  ·  ' + hostOf(env.serverUrl) : ''),
    chosen?.serverUrl
  );
  const onServer = chosen ? all.filter(env => env.serverUrl === chosen.serverUrl) : [];
  fillSelect(
    $('rulesetSelect'),
    unique(onServer, env => env.rulesetName),
    env => env.rulesetName,
    env => env.rulesetName,
    chosen?.rulesetName
  );
  // A new server or ruleset starts the Version box again (the last one typed for it, or the highest listed); a refresh of the lists, or
  // the file changing, leaves what is typed alone.
  const key = chosen ? versionKey(chosen) : '';
  if (key !== state.versionKey) {
    state.versionKey = key;
    state.version = chosen ? startingVersion(chosen) : '';
    state.versionTouched = false;
  }
  if (!$('versionBox').contains(document.activeElement)) writeParts();
  showVersionState();
  refreshPickers();
}

function remember(envId) {
  try {
    localStorage.setItem('dx-hub-env', envId);
  } catch {
    /* not remembered */
  }
}

/**
 * Choosing a server keeps the same ruleset where the new server has it; if not, the first ruleset there is used. The version box starts again
 * for whatever is chosen (see renderEnvSelect).
 */
function chooseEnvironment(serverUrl, rulesetName) {
  const onServer = state.environments.filter(env => env.serverUrl === serverUrl);
  const ofRuleset = rulesetName ? onServer.filter(env => env.rulesetName === rulesetName) : [];
  const pool = ofRuleset.length ? ofRuleset : onServer;
  const next = pool[0];
  if (!next) return;
  state.envId = next.id;
  remember(next.id);
  renderEnvSelect();
  renderTarget();
}

export function renderComponents() {
  if (!state.components.includes(state.component)) state.component = state.components[0] || '';
  const select = $('componentSelect');
  select.replaceChildren(
    ...state.components.map(name => h('option', { value: name }, shortName(name)))
  );
  select.value = state.component;
  // Publish all says how many components it would publish.
  $('allCount').textContent = state.components.length || '';
  // The same total sits beside the Component label so the size of the list is visible before opening it.
  $('componentCount').textContent = state.components.length || '';
  refreshPickers();
}

// ── The chosen target at a glance ────────────────────────────────────────

/** Where it goes, which ruleset, how it is built, how it signs in, and whether it is; and the header's sign-in button. */
export function renderTarget() {
  const env = currentEnv();
  const sign = signInState(env);
  const strip = $('strip');
  strip.replaceChildren();
  const fact = (label, value, mono) => [
    h('dt', {}, label),
    h('dd', { class: mono ? 'mono' : '', title: value }, value)
  ];
  if (!env) {
    strip.append(...fact('Environment', 'None yet. Add one in the Environments tab.'));
  } else {
    const conn = connectionOf(env);
    strip.append(
      ...fact('Server', hostOf(env.serverUrl) || 'not set', true),
      ...fact('Ruleset', env.rulesetName + ' ' + env.rulesetVersion, true),
      ...fact('Build', env.devBuild ? 'Development' : 'Production'),
      ...fact('Sign-in', sign.ok ? 'Signed in' : sign.text),
      ...fact('Connection', conn ? conn.name : 'none')
    );
  }
  // Sign In shows when a sign-in is needed; Reauth shows when already signed in so the token can be refreshed at any time without waiting for expiry.
  const signInBtn = $('signInBtn');
  signInBtn.hidden = sign.ok || sign.pending;
  signInBtn.textContent = state.signInFailed ? 'Try again' : 'Sign in';
  signInBtn.classList.toggle('is-failed', state.signInFailed);
  $('reauthBtn').hidden = !sign.ok || sign.pending;
  renderAuthPill();
  updateButtons();
}

/** Which buttons can be pressed now, and what they say. While something runs, nothing about the target can change under it; only Stop works. */
/**
 * What the main button says, from how the last publish of this component to this target ended (the runs the hub remembers this session):
 * Republish after one that went through, Retry after one that failed, Publish otherwise. A stopped run says nothing about the component, so it
 * is passed over, and so is one still running.
 */
function publishLabel(env) {
  if (!env || !state.component) return { text: 'Publish', hint: '' };
  const last = state.runs.find(
    run =>
      run.action === 'publish' &&
      run.component === state.component &&
      run.ruleset === env.rulesetName &&
      run.version === env.rulesetVersion &&
      run.server === hostOf(env.serverUrl) &&
      run.endedAt !== null &&
      !run.aborted
  );
  if (!last) return { text: 'Publish', hint: '' };
  return last.exitCode === 0
    ? {
        text: 'Republish',
        hint: 'Already published to this target in this session; publish it again'
      }
    : {
        text: 'Retry',
        hint: 'The last publish of this component to this target failed; try again'
      };
}

/** Runs that act on every component, or on none, so the line does not name the chosen one. */
const NO_COMPONENT = ['publishAll', 'buildAllComponents', 'authenticate'];

/** The step the run is on, said after the name: " · Linting… step 2 of 5" (a step, not a component, so it says so); empty before the first step shows. */
function stageOf() {
  const step = state.step;
  return step ? ' · ' + step.label + '… step ' + step.n + ' of ' + step.total : '';
}

/**
 * The line under the terminal says the next useful thing, in the order of what is in the way: a run going, no environment, no sign-in, no
 * component, a version Pega would refuse, a last run that failed, and otherwise that all is ready and what Publish will do. `tone` colours it:
 * busy (blue) while something runs, warn (amber) when the person has to do something, bad (red) after a failure, ok (green) when it is ready.
 */
function termHint(env, signedIn, versionOk, label) {
  if (state.queue) {
    const { index, total, component } = state.queue;
    return { text: 'Publishing component ' + (index + 1) + ' of ' + total + ' · ' + shortName(component) + (stageOf() || '…'), tone: 'busy' };
  }
  if (state.running) {
    const action = state.currentAction;
    if (action === 'authenticate') return { text: 'Signing in…', tone: 'busy' };
    const name = ACTION_NAMES[action] || 'Running';
    const what = NO_COMPONENT.includes(action) || !state.component ? '' : ' · ' + shortName(state.component);
    return { text: name + what + (stageOf() || '…'), tone: 'busy' };
  }
  if (!env) return { text: 'Add an environment in the Environments tab', tone: 'warn' };
  if (!signedIn) return { text: 'Sign in to ' + (env.serverName || hostOf(env.serverUrl) || 'the server') + ' to publish', tone: 'warn' };
  if (!state.component) return { text: 'Choose a component to publish', tone: 'warn' };
  if (!versionOk) return { text: 'Type the version as three two-digit parts, like 01-01-01', tone: 'warn' };
  const last = state.runs[0];
  if (last && last.endedAt !== null && !last.aborted && last.exitCode !== 0) {
    return { text: 'Last run failed · see #' + runNumber(last.id) + ' at the top · press ' + label.text, tone: 'bad' };
  }
  return {
    text:
      'Ready · ' + shortName(state.component) + ' → ' + env.rulesetName + ' ' + env.rulesetVersion + ' · press ' + label.text,
    tone: 'ok'
  };
}

/** Draws the line under the terminal. Also called as the stepper moves, since that is when the step it names changes. */
export function renderTermHint() {
  const env = currentEnv();
  const line = termHint(
    env,
    signInState(env).ok,
    !env || isVersion(env.rulesetVersion),
    publishLabel(env)
  );
  $('termHint').textContent = line.text;
  $('termHint').title = line.text;
  $('termHint').parentElement.dataset.tone = line.tone;
}

export function updateButtons() {
  const env = currentEnv();
  // A queue is running from the first component to the last, also between two of them.
  const running = state.running || state.queue !== null;
  const signedIn = signInState(env).ok;
  const ready = signedIn && !running;
  // Publishing needs a real version; a build or a validation does not use one.
  const versionOk = !env || isVersion(env.rulesetVersion);
  $('btnPublish').disabled = !ready || !state.component || !versionOk;
  const label = publishLabel(env);
  // The label is in its own span, so the icon in front of it stays.
  $('btnPublish').querySelector('.lbl').textContent = label.text;
  if (!signedIn) $('btnPublish').title = 'Sign in first, with the button at the top right';
  else
    $('btnPublish').title = versionOk
      ? label.hint
      : 'Type the version as three two-digit parts, like 01-01-01';
  $('btnPublishAll').disabled = !ready || !versionOk;
  $('btnPublishSelected').disabled = !ready || !versionOk || !state.components.length;
  $('btnPublishSelected').title = !signedIn
    ? 'Sign in first, with the button at the top right'
    : 'Tick several components and publish them one after another';
  renderTermHint();
  setVersionDisabled(running || !env);
  $('btnBuild').disabled = running || !state.component;
  $('btnValidate').disabled = running;
  $('signInBtn').disabled = running || !env;
  $('reauthBtn').disabled = running || !env;
  ['serverSelect', 'rulesetSelect', 'componentSelect'].forEach(id => {
    const select = $(id);
    const empty = !select.options.length || select.options[0].value === '';
    select.disabled = running || empty;
  });
  $('actionsStack').classList.toggle('running', running);
  // Publish turns into Stop while something runs (the two swap in one place), and the Stop button says what it stops.
  const stop = $('btnAbort');
  stop.disabled = !running;
  stop.setAttribute('aria-hidden', String(!running));
  stop.tabIndex = running ? 0 : -1;
  stop.textContent = state.queue
    ? 'Stop publishing (' + (state.queue.index + 1) + ' of ' + state.queue.total + ')'
    : running
      ? STOP_LABELS[state.currentAction] || 'Stop'
      : 'Stop';
  // The pickers follow the selects, which are disabled while a run goes.
  refreshPickers();
}

/** The three pickers and the Version box. */
export function initTarget() {
  // The server, ruleset and component are pickers; the selects beside them stay the source of truth. On the button the server shows by its name
  // only (its address is in the list, the tooltip and the header), so they fit on the lines they have.
  const nameOnly = text => text.split('  ·  ')[0];
  enhanceSelect($('serverSelect'), { label: 'Application', short: nameOnly });
  enhanceSelect($('rulesetSelect'), { label: 'Ruleset' });
  enhanceSelect($('componentSelect'), { label: 'Component', search: true });
  buildVersionBox();
  $('serverSelect').addEventListener('change', event => {
    chooseEnvironment(event.target.value, currentEnv()?.rulesetName);
  });
  $('rulesetSelect').addEventListener('change', event => {
    chooseEnvironment(currentEnv().serverUrl, event.target.value);
  });
  document.addEventListener('dx-step', renderTermHint);
  $('componentSelect').addEventListener('change', event => {
    state.component = event.target.value;
    renderTarget();
  });
}
