// Publish several: tick the components in a slide-over and press Publish, and they go to the server one after another, each as an ordinary
// Publish run (its own block in the terminal, its own row in Recent runs, its own place in the history), so nothing about a single publish
// changes. The order of the work is queue.js; this file is the page's side of it: the list to tick, the question before it starts, and what
// the buttons show while it goes.
import { confirmDialog } from './confirm-dialog.js';
import { closeDrawer, openDrawer, setCanSave, setSaveLabel } from './drawer.js';
import { queueSummary, runQueue } from './queue.js';
import { runAction } from './run-action.js';
import { currentEnv, state } from './state.js';
import { updateButtons } from './target.js';
import { $, cleanEnvLabel, h, shortName, toast } from './util.js';

// The two drawings in the search box; they are fixed text, never anything from a server.
const MAGNIFIER =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>';
const CROSS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

const TICK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 12.5l4.2 4.2 8.8-9.4"/></svg>';

// What was ticked last time, kept while the page stays open so the same few components can be published again without ticking them again.
let chosen = new Set();

/** Where it goes, in words, for the question and the slide-over. */
function targetText(env) {
  const where = env.serverName || cleanEnvLabel(env.name, env.rulesetName) || env.name;
  return where + ' (' + env.rulesetName + ' ' + env.rulesetVersion + ')';
}

/** Publishes the components one after another; the page shows which one it is on, and Stop ends the rest of the list as well. */
async function publishInTurn(picked, keepGoing) {
  const env = currentEnv();
  if (!env) return;
  const sure = await confirmDialog({
    title: 'Publish ' + picked.length + (picked.length === 1 ? ' component?' : ' components?'),
    lead: 'One by one to ' + targetText(env) + '.',
    items: picked.map(shortName),
    note: keepGoing
      ? 'It carries on if one fails.'
      : 'It stops at the first one that fails. A sign-in or ruleset problem always stops it.',
    confirm: 'Publish ' + picked.length
  });
  if (!sure) return;

  // While the queue is set, the buttons act as if a run were going, also in the moment between two components.
  state.queue = { total: picked.length, index: 0, component: picked[0], cancelled: false };
  updateButtons();
  toast('Publishing ' + picked.length + ' components, one by one');
  let result;
  try {
    result = await runQueue(
      picked,
      name => runAction('publish', { component: name, quiet: true }),
      {
        keepGoing,
        isCancelled: () => state.queue?.cancelled,
        onProgress: ({ index, item }) => {
          state.queue.index = index;
          state.queue.component = item;
          updateButtons();
        }
      }
    );
  } finally {
    state.queue = null;
    updateButtons();
  }
  toast(
    queueSummary(result, shortName),
    ['done', 'stopped'].includes(result.ended) ? undefined : 'error'
  );
}

/** The slide-over: a searchable list of the components with a box to tick for each, and a Publish button that says how many. */
export function openSelection() {
  const env = currentEnv();
  if (!env || state.running || state.queue) return;
  const names = state.components;
  // A component that has gone from the list is no longer ticked.
  chosen = new Set([...chosen].filter(name => names.includes(name)));
  let query = '';
  let keepGoing = false;

  const count = h('span', { class: 'sel-count', 'aria-live': 'polite' });
  const list = h('div', {
    class: 'sel-list',
    role: 'group',
    'aria-label': 'Components to publish'
  });

  // The box that ticks everything the search shows: ticked when all of them are, half-ticked when only some are.
  const allBox = h('input', { type: 'checkbox', 'aria-label': 'Select all shown' });
  const meter = h('span', { class: 'sel-meter-fill' });

  const update = () => {
    count.textContent = chosen.size + ' of ' + names.length + ' selected';
    meter.style.width = names.length ? (chosen.size / names.length) * 100 + '%' : '0';
    const rows = shown();
    const ticked = rows.filter(name => chosen.has(name)).length;
    allBox.checked = rows.length > 0 && ticked === rows.length;
    allBox.indeterminate = ticked > 0 && ticked < rows.length;
    allBox.disabled = rows.length === 0;
    setSaveLabel(chosen.size ? 'Publish ' + chosen.size : 'Publish');
    setCanSave(chosen.size > 0);
  };

  const row = name => {
    const box = h('input', {
      type: 'checkbox',
      value: name,
      checked: chosen.has(name),
      onchange: event => {
        if (event.target.checked) chosen.add(name);
        else chosen.delete(name);
        event.target.closest('.sel-row').classList.toggle('is-on', event.target.checked);
        update();
      }
    });
    // The real checkbox stays (keyboard, screen readers) and is drawn as a round tick that fills in when it is on.
    const tick = h('span', { class: 'sel-check', 'aria-hidden': 'true' });
    tick.innerHTML = TICK;
    return h(
      'label',
      { class: 'sel-row' + (chosen.has(name) ? ' is-on' : ''), title: name },
      box,
      tick,
      h('span', { class: 'sel-name' }, shortName(name))
    );
  };

  const shown = () =>
    names.filter(name => (shortName(name) + ' ' + name).toLowerCase().includes(query));
  const draw = () => {
    const rows = shown();
    list.replaceChildren(
      ...(rows.length ? rows.map(row) : [h('div', { class: 'sel-none' }, 'Nothing matches')])
    );
  };

  // The search box: a rounded field with a magnifier inside, and a button to clear it that shows once there is something to clear.
  const icon = h('span', { class: 'sel-search-icon', 'aria-hidden': 'true' });
  icon.innerHTML = MAGNIFIER;
  const field = h('input', {
    class: 'sel-search-input',
    type: 'search',
    placeholder: 'Search ' + names.length + ' components',
    'aria-label': 'Search components',
    autocomplete: 'off',
    spellcheck: 'false'
  });
  const clear = h('button', {
    class: 'sel-search-clear',
    type: 'button',
    hidden: true,
    title: 'Clear search',
    'aria-label': 'Clear search'
  });
  clear.innerHTML = CROSS;
  const find = text => {
    field.value = text;
    query = text.trim().toLowerCase();
    clear.hidden = text === '';
    draw();
    // What "select all" means follows the search, so its box is redrawn too.
    update();
  };
  field.addEventListener('input', () => find(field.value));
  clear.addEventListener('click', () => {
    find('');
    field.focus();
  });
  field.addEventListener('keydown', event => {
    // Escape first empties the box; with the box empty it closes the slide-over as it does anywhere else.
    if (event.key === 'Escape' && field.value !== '') {
      event.stopPropagation();
      find('');
    }
  });
  const search = h('div', { class: 'sel-search' }, icon, field, clear);

  // Select all ticks what the search shows, so a search narrows what "all" means.
  allBox.addEventListener('change', () => {
    // A tick adds everything shown; an un-tick takes only those off, so other components ticked before a search stay ticked.
    shown().forEach(name => (allBox.checked ? chosen.add(name) : chosen.delete(name)));
    draw();
    update();
  });
  const clearAll = h(
    'button',
    {
      class: 'sel-clear',
      type: 'button',
      onclick: () => {
        chosen.clear();
        draw();
        update();
      }
    },
    'Clear'
  );
  const bar = h(
    'div',
    { class: 'sel-bar' },
    h('label', { class: 'sel-all' }, allBox, count),
    clearAll
  );
  const meterTrack = h('div', { class: 'sel-meter', 'aria-hidden': 'true' }, meter);

  // A switch rather than a bare checkbox: it is a setting for this run, and the switch reads as on or off at a glance.
  const option = h(
    'label',
    { class: 'sel-opt' },
    h(
      'span',
      { class: 'sel-opt-text' },
      h('b', {}, 'Keep going if one fails'),
      h(
        'small',
        {},
        'Off: it stops at the first one that fails. A sign-in or ruleset problem always stops it.'
      )
    ),
    h('input', {
      type: 'checkbox',
      role: 'switch',
      class: 'sel-switch',
      onchange: event => {
        keepGoing = event.target.checked;
      }
    })
  );

  // Where it goes is the first thing said, as a card, so it is clear before anything is ticked.
  const target = h(
    'div',
    { class: 'sel-target' },
    h('span', { class: 'sel-target-label' }, 'Publishing to'),
    h('b', {}, env.serverName || cleanEnvLabel(env.name, env.rulesetName) || env.name),
    h('span', { class: 'sel-target-chip mono' }, env.rulesetName + ' ' + env.rulesetVersion)
  );

  openDrawer(
    'Publish several',
    [target, search, bar, meterTrack, list, option],
    () => {
      // The list's own order, so the order of the publishing does not depend on the order of the ticking.
      const picked = names.filter(name => chosen.has(name));
      if (!picked.length) return;
      closeDrawer();
      // Not awaited: the slide-over is closed and the page itself shows the progress.
      publishInTurn(picked, keepGoing);
    }
  );
  draw();
  update();
}

export function initPublishSelected() {
  $('btnPublishSelected').addEventListener('click', openSelection);
}
