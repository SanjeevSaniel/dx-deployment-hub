// The terminal: every run is a block (an accordion) in it, with its output. As in a deployment list, the newest is at the top, so the run just
// started is in view without scrolling. The view follows the top while it is there, and scrolling down to read an earlier run stops the
// following (so what is being read stays put) until the view is back at the top or Latest is used.
import { ISSUE_WORDS, ACTION_NAMES, outcomeOf, runName } from './actions.js';
import { api } from './api.js';
import { setPanel } from './chrome.js';
import { restoreSteps } from './pipeline.js';
import { runNumber, state } from './state.js';
import { $, ansiToHtml, duration, formatSeconds, h, shortName, toast } from './util.js';

/** The blocks by run id. */
export const blocks = new Map();
let stick = true;

/** Scrolls to the newest run, which is at the top, if the view is following it (always, with `force`). */
export function toLatest(force) {
  if (force) stick = true;
  const term = $('term');
  if (stick) term.scrollTop = 0;
  $('jump').hidden = stick;
}

// Each block carries its run's number, the same one Recent runs shows (see runNumber), so #7 is the same run in both. A block that is not a run
// the server knows (a failed start, shown only here) is numbered by its place in the terminal. The heading counts the blocks.
export function renumber() {
  const term = $('term');
  const total = term.children.length;
  [...term.children].forEach((el, index) => {
    const num = el.querySelector('.b-num');
    if (num) num.textContent = '#' + (runNumber(el.dataset.run) || total - index);
  });
  $('termCount').textContent = total;
}

// The server, ruleset and version columns are as wide as the longest value in the terminal (up to a limit), so there is no spare
// width after a short value and every heading still lines up: each heading is its own grid, so the one width is shared through custom
// properties on the terminal. The widths are measured from the text itself (scrollWidth is its full width, even when it is cut short).
// The status chip has the run's time in it ("Republished · 1m 12s"), so it is the widest of them; it has a floor so the column does not
// move each second while a run counts up.
const FIT = [
  ['status', 'b-chip', 300, 200],
  ['server', 'b-server', 240],
  ['ruleset', 'b-ruleset', 260],
  ['version', 'b-version', 100]
];
export function fitColumns() {
  const term = $('term');
  FIT.forEach(([name, cls, limit, floor = 0]) => {
    let widest = floor;
    term.querySelectorAll('.' + cls).forEach(cell => {
      const text = cell.querySelector('.b-cell-text') || (cls === 'b-chip' ? cell : null);
      if (!text) return;
      const icon = cell.querySelector('svg') ? 17 : 0;
      widest = Math.max(widest, Math.ceil(text.scrollWidth) + 6 + icon);
    });
    if (widest > 0) term.style.setProperty('--c-' + name, Math.min(widest, limit) + 'px');
  });
}

// Put in front, so the newest is first. The history is added oldest first (see syncHistory), which ends with the newest on top as well.
export function addBlock(entry) {
  $('term').prepend(entry.el);
  fitColumns();
  renumber();
  refreshFoldButton();
  if (query) applyFilter();
}

/** A new run takes the screen: every earlier block folds up, so the one running is the only one open and the rest stay a tidy list. */
export function foldOthers(except) {
  blocks.forEach(other => {
    if (other !== except) setFolded(other, true);
  });
}

/**
 * While a block opens or closes (its height animates), the heading that was clicked is kept where it is on screen by moving the terminal's
 * scroll as the height changes. Without it the blocks below, or the output being hidden, would pull the page under the pointer. A terminal
 * that is following the newest run stays at the top instead.
 */
function holdHeading(entry) {
  if (stick) return;
  const term = $('term');
  const top = entry.head.getBoundingClientRect().top;
  const until = performance.now() + 280;
  const follow = () => {
    term.scrollTop += entry.head.getBoundingClientRect().top - top;
    if (performance.now() < until) requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);
}

/**
 * The fold button collapses every run when any is open, and opens them all again when every one is closed, so one button does both. Its icon
 * (chevrons pointing in, or out) and its tooltip say which it will do next, and it is off while there is nothing in the terminal.
 */
function refreshFoldButton() {
  const button = $('btnFold');
  if (!button) return;
  const anyOpen = [...blocks.values()].some(entry => !entry.el.classList.contains('collapsed'));
  button.dataset.state = anyOpen ? 'open' : 'closed';
  button.title = anyOpen ? 'Collapse all runs' : 'Expand all runs';
  button.querySelector('.lbl').textContent = anyOpen ? 'Collapse all' : 'Expand all';
  button.disabled = blocks.size === 0;
}

export function setFolded(entry, folded) {
  clearTimeout(entry.foldTimer);
  if (entry.el.classList.contains('collapsed') !== folded) holdHeading(entry);
  entry.el.classList.toggle('collapsed', folded);
  entry.head.setAttribute('aria-expanded', String(!folded));
  refreshFoldButton();
  // Folding or opening changes the height, so a terminal that is following the newest run stays at the top.
  setTimeout(() => toLatest(), 240);
}

// ── Search ───────────────────────────────────────────────────────────────

let query = '';

/** Takes the highlight marks out again, putting the text back as it was. */
function clearMarks(root) {
  root
    .querySelectorAll('mark.hit')
    .forEach(mark => mark.replaceWith(document.createTextNode(mark.textContent)));
  root.normalize();
}

/** Wraps each match in the text below `root` in a <mark>, walking the text nodes so the colours of the output (its spans) are left alone. */
function markMatches(root, needle) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => {
    const text = node.nodeValue;
    const lower = text.toLowerCase();
    let at = lower.indexOf(needle);
    if (at < 0) return;
    const parts = document.createDocumentFragment();
    let from = 0;
    while (at >= 0) {
      parts.append(text.slice(from, at));
      parts.append(h('mark', { class: 'hit' }, text.slice(at, at + needle.length)));
      from = at + needle.length;
      at = lower.indexOf(needle, from);
    }
    parts.append(text.slice(from));
    node.replaceWith(parts);
  });
}

/**
 * Shows only the runs whose heading or output has the words searched for, marks them, and opens those runs so the match is in view. Cleared, every
 * run is back. A run still going stays shown, so the one being watched never disappears. Called as the person types, when a run is added and
 * when one ends, so a new run is held to the same search.
 */
export function applyFilter() {
  const needle = query.trim().toLowerCase();
  let shown = 0;
  blocks.forEach(entry => {
    clearMarks(entry.el);
    const running = entry.el.classList.contains('run');
    // The title and the output only: the heading also holds the Copy button, the time and the chip, which a search should not match.
    const title = entry.el.querySelector('.b-main');
    const hit =
      !needle ||
      running ||
      (title.textContent + ' ' + entry.out.textContent).toLowerCase().includes(needle);
    entry.el.classList.toggle('no-match', !hit);
    if (!hit) return;
    shown += 1;
    if (needle) {
      markMatches(title, needle);
      markMatches(entry.out, needle);
      if (entry.el.classList.contains('collapsed') && !running) setFolded(entry, false);
    }
  });
  $('term').classList.toggle('no-hits', Boolean(needle) && blocks.size > 0 && shown === 0);
  const count = $('termSearchN');
  count.hidden = !needle;
  count.textContent = shown + ' of ' + blocks.size;
}

// ── One block ────────────────────────────────────────────────────────────

const shortCommand = run =>
  (run.command || runName(run) + (run.component ? ' ' + run.component : '')).replace(
    /^custom-dx-components\s+/,
    'dx '
  );

const blockTitle = run => {
  const action = runName(run) || 'Run';
  const comp = run.component
    ? shortName(run.component)
    : run.action && run.action.includes('All')
      ? 'All components'
      : '';
  if (comp) return `${action} · ${comp}`;
  // The server it signs in to is in the server column, like any other run's, so the title is only the action.
  if (run.action === 'authenticate') return 'Sign in';
  return shortCommand(run) || action;
};

// The small outline icons of the columns, drawn like the terminal's other icons (stroke, round ends). A cell with no value is left
// empty, with no icon, so the columns stay aligned without a lone icon standing for nothing.
const ICONS = {
  server:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/></svg>',
  ruleset:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 12.5l9 5 9-5M3 17l9 5 9-5"/></svg>',
  version:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8z"/><circle cx="7.5" cy="7.5" r="1"/></svg>'
};

function iconCell(className, icon, value, what) {
  const cell = h('span', { class: className + ' b-cell', title: value ? what + ': ' + value : '' });
  if (value) {
    cell.innerHTML = icon;
    cell.append(h('span', { class: 'b-cell-text' }, value));
  }
  return cell;
}

export function makeBlock(run) {
  // Only the icon, always shown at the very right of the heading: it is the way to copy a run's output, so it is not hidden until hover.
  const copy = h('button', {
    class: 'b-copy',
    type: 'button',
    title: 'Copy this output',
    'aria-label': 'Copy this output'
  });
  copy.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/></svg>';
  const chip = h('span', { class: 'b-chip' }, outcomeOf(run).doing);
  const out = h('pre', { class: 'b-out' });
  // When the run started, to the second, so a long terminal can be read as a log. It is shown in the computer's own time zone; the tooltip has
  // the date and the zone name.
  const started = new Date(run.startedAt);
  const time = h(
    'time',
    {
      class: 'b-time',
      datetime: started.toISOString(),
      title:
        started.toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' }) +
        ' (' +
        Intl.DateTimeFormat().resolvedOptions().timeZone +
        ')'
    },
    started.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  );
  // The server (its address, not its name as well) and the ruleset it went to are separate columns, so each lines up from run to run. A
  // sign-in has no ruleset, so those two cells are empty for it; its server is shown like any other run's.
  const signIn = run.action === 'authenticate';
  const server = run.server || '';
  const ruleset = signIn ? '' : run.ruleset || '';
  const version = signIn ? '' : run.version || '';
  const caret = h('span', { class: 'b-caret', 'aria-hidden': 'true' });
  caret.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
  const fullCmd = run.command || shortCommand(run);
  const head = h(
    'div',
    {
      class: 'b-head',
      role: 'button',
      tabindex: '0',
      'aria-expanded': 'true',
      title: 'Show or hide the output'
    },
    caret,
    h('span', { class: 'b-status', 'aria-hidden': 'true' }),
    h('span', { class: 'b-num', title: 'Run number in this terminal' }),
    h(
      'div',
      { class: 'b-main' },
      h(
        'span',
        { class: 'b-cmd', title: fullCmd + (run.component ? ' (' + run.component + ')' : '') },
        blockTitle(run)
      ),
      iconCell('b-server', ICONS.server, server, 'Server'),
      iconCell('b-ruleset', ICONS.ruleset, ruleset, 'Ruleset'),
      iconCell('b-version', ICONS.version, version, 'Version')
    ),
    copy,
    time,
    chip
  );
  const el = h(
    'div',
    { class: 'block run', 'data-run': run.id },
    head,
    h('div', { class: 'b-body' }, h('div', { class: 'b-inner' }, out))
  );
  const entry = {
    el,
    out,
    chip,
    head,
    startedAt: new Date(run.startedAt).getTime(),
    timer: null,
    foldTimer: null
  };
  const toggle = () => setFolded(entry, !el.classList.contains('collapsed'));
  head.addEventListener('click', toggle);
  head.addEventListener('keydown', e => {
    if (e.target === head && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      toggle();
    }
  });
  // The Copy button is part of the head, so it must not also fold the block.
  copy.addEventListener('click', e => {
    e.stopPropagation();
    navigator.clipboard.writeText(out.innerText).then(() => toast('Output copied'));
  });
  blocks.set(run.id, entry);
  return entry;
}

/**
 * Shows a run's state: its colour, its badge ("Published · 32s") and, with fold 'now', folds it straight away (for the history shown when the
 * page opens). A run that has just ended stays open, whether it went through or not, so its result can be read.
 */
export function finishBlock(entry, run, fold) {
  clearInterval(entry.timer);
  const done = run.endedAt !== null && run.endedAt !== undefined;
  const ok = done && run.exitCode === 0;
  const stopped = done && Boolean(run.aborted);
  const issue = done && !ok && !stopped ? run.issue : null;
  entry.el.classList.remove('run', 'ok', 'bad', 'stopped', 'locked', 'invalid', 'auth');
  entry.el.classList.add(!done ? 'run' : stopped ? 'stopped' : issue || (ok ? 'ok' : 'bad'));
  const outcome = outcomeOf(run);
  const word = stopped
    ? 'Stopped'
    : issue
      ? ISSUE_WORDS[issue] || outcome.failed
      : ok
        ? outcome.done
        : outcome.failed;
  entry.chip.textContent = !done ? outcome.doing : word + ' · ' + duration(run);
  entry.outcome = outcome;
  fitColumns();
  if (!done) return;
  // A run that has only just finished keeps a ring for a minute and a half; one replayed from history does not.
  if (fold !== 'now') {
    entry.el.classList.add('fresh');
    setTimeout(() => entry.el.classList.remove('fresh'), 90000);
  }
  if (fold === 'now') setFolded(entry, true);
  // A run that has ended is held to the search like the others (it was always shown while it ran).
  if (query) applyFilter();
}

/** The badge counts the seconds while the run is going. */
export function tickBlock(entry) {
  entry.timer = setInterval(() => {
    const seconds = Math.round((Date.now() - entry.startedAt) / 1000);
    entry.chip.textContent =
      (entry.outcome ? entry.outcome.doing : 'Running') + ' · ' + formatSeconds(seconds);
    fitColumns();
  }, 1000);
}

// ── The history ──────────────────────────────────────────────────────────

// The runs the hub remembers are put in the terminal when the page opens, oldest first, so it reads as one history.
// Not called history: that would hide the browser's own window.history, which the tabs use to keep the address in step.
let historyLoad = null;
export function syncHistory() {
  if (historyLoad) return historyLoad;
  historyLoad = (async () => {
    let latest = null;
    for (const summary of [...state.runs].reverse()) {
      if (blocks.has(summary.id) || state.running) continue;
      try {
        const run = await api('/api/runs/' + summary.id);
        // A sign-in after a publish must not hide the publish's stepper, so only runs that have a pipeline count.
        if (run.action !== 'authenticate') latest = run;
        const entry = makeBlock(run);
        addBlock(entry);
        entry.out.innerHTML = ansiToHtml(run.log || '');
        finishBlock(entry, run, 'now');
      } catch {
        /* a run that is no longer kept is simply not shown */
      }
    }
    // Newest last, so `latest` is the run the stepper should show. Not while a run is going: the live output is moving it.
    if (!state.running) restoreSteps(latest);
    toLatest(true);
  })();
  return historyLoad;
}

// ── The terminal card ────────────────────────────────────────────────────

/** The scrolling that follows the output, Latest, and the Copy, Clear and Hide tools in the heading. */
export function initTerminal() {
  $('term').addEventListener('scroll', () => {
    const term = $('term');
    stick = term.scrollTop < 24;
    $('jump').hidden = stick;
  });
  $('jump').addEventListener('click', () => toLatest(true));
  const search = $('termSearch');
  search.addEventListener('input', () => {
    query = search.value;
    applyFilter();
  });
  search.addEventListener('keydown', event => {
    // Escape first empties the box, as in the other search boxes on the page.
    if (event.key === 'Escape' && search.value !== '') {
      event.stopPropagation();
      search.value = '';
      query = '';
      applyFilter();
    }
  });
  $('btnFold').addEventListener('click', () => {
    const open = $('btnFold').dataset.state === 'open';
    blocks.forEach(entry => setFolded(entry, open));
  });
  refreshFoldButton();
  // Hide is the panel's own close, as in VS Code; the Terminal button in the header brings it back.
  $('btnCollapse').addEventListener('click', () => setPanel('terminal', false));
  $('btnClear').addEventListener('click', () => {
    blocks.forEach(entry => clearInterval(entry.timer));
    blocks.clear();
    refreshFoldButton();
    if (query) applyFilter();
    $('term').replaceChildren();
    renumber();
    stick = true;
    $('jump').hidden = true;
  });
  $('btnCopy').addEventListener('click', () =>
    navigator.clipboard.writeText($('term').innerText).then(() => toast('Terminal copied'))
  );
}
