// The list of recent runs, and opening one in the terminal.
import { ISSUE_WORDS, kindTag, runName } from './actions.js';
import { api } from './api.js';
import { runNumber, state } from './state.js';
import { addBlock, blocks, finishBlock, foldOthers, makeBlock, renumber, setFolded } from './terminal.js';
import { $, ago, ansiToHtml, cleanEnvLabel, duration, h, shortName, toast } from './util.js';

/** What a kind tag means, for its tooltip. */
function kindTitle(run) {
  if (run.kind === 'republish')
    return (
      'The same ruleset and version again, so Pega replaced what was there' +
      (run.lastPublishedAt ? ' (last published ' + ago(run.lastPublishedAt) + ' ago)' : '')
    );
  if (run.kind === 'newVersion')
    return 'Already on this server under another ruleset or version; this one went to ' + run.ruleset + ' ' + run.version;
  return 'The first time this went to this server';
}

export function renderRuns() {
  $('runsList').replaceChildren(
    ...state.runs.map(run => {
      const issue = run.endedAt !== null && !run.aborted && run.exitCode !== 0 ? run.issue : null;
      const status =
        run.endedAt === null
          ? 'running'
          : run.aborted
            ? 'stopped'
            : issue || (run.exitCode === 0 ? 'ok' : 'bad');
      // How it went, in a word of its own. The title already says what was done (Publish, Republish), so this does not say it a second time
      // ("Republish" over "Republished"); the colour of the number says the same thing at a glance.
      const word = {
        running: 'Running',
        stopped: 'Stopped',
        ok: 'Done',
        bad: 'Failed',
        ...ISSUE_WORDS
      }[status];
      // The same number the run has in the terminal.
      const number = runNumber(run.id);
      const what = run.component
        ? shortName(run.component)
        : run.action.includes('All')
          ? 'all components'
          : '';
      const envLabel = cleanEnvLabel(run.environmentName, run.ruleset);
      const where = [envLabel, run.ruleset ? run.ruleset + ' ' + run.version : '']
        .filter(Boolean)
        .join(' · ');
      const took = status === 'running' ? '' : duration(run);
      return h(
        'li',
        {
          class: 'run-card is-' + status + (run.id === state.selectedRun ? ' sel' : ''),
          tabindex: '0',
          role: 'button',
          'aria-label': runName(run) + ' ' + what + ', ' + word,
          onclick: () => openRun(run.id),
          onkeydown: e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openRun(run.id);
            }
          }
        },
        h('span', { class: 'run-n', title: word + ' · run ' + number }, '#' + number),
        h(
          'div',
          { style: 'min-width:0' },
          h(
            'div',
            { class: 'title' },
            runName(run),
            what ? h('em', {}, ' · ' + what) : '',
            // A republish is already named Republish in the title, so its tag would only repeat it; the other kinds say something the title does not.
            kindTag(run) && run.kind !== 'republish'
              ? h('span', { class: 'kind-tag ' + run.kind, title: kindTitle(run) }, kindTag(run))
              : ''
          ),
          h(
            'div',
            // The title carries the whole line for a card whose "where" is hidden (see .where in hub.css).
            { class: 'sub', title: [word, took, where].filter(Boolean).join(' · ') },
            h('b', {}, word),
            took ? ' · ' + took : '',
            // Its own element so it can be hidden while the terminal is open: each block there already shows the same server and ruleset.
            where ? h('span', { class: 'where' }, ' · ' + where) : ''
          )
        ),
        h('span', { class: 'when' }, ago(run.startedAt))
      );
    })
  );
  // The list changed, so the numbers in the terminal are read again.
  renumber();
  $('runsEmpty').hidden = state.runs.length > 0;
  $('runsCount').textContent = state.runs.length;
}

/**
 * A past run is shown as its block: the one already in the terminal is brought into view, one from before the page was opened is fetched and
 * added at the end.
 */
async function openRun(id) {
  try {
    state.selectedRun = id;
    let found = blocks.get(id);
    if (!found) {
      const run = await api('/api/runs/' + id);
      found = makeBlock(run);
      addBlock(found);
      found.out.innerHTML = ansiToHtml(run.log || '(no output)');
      finishBlock(found, run);
    }
    // The run that was clicked is the one on show: it opens, and every other block folds up.
    foldOthers(found);
    setFolded(found, false);
    found.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    found.el.classList.add('flash');
    setTimeout(() => found.el.classList.remove('flash'), 900);
    renderRuns();
  } catch (err) {
    toast(err.message, 'error');
  }
}
