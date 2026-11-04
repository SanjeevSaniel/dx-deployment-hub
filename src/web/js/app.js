// Loading from the server and drawing everything: the whole page, or just the lists when the file changed.
import { api } from './api.js';
import { renderConnections } from './connections.js';
import { renderEnvironments } from './environments.js';
import { renderRuns } from './runs.js';
import { state } from './state.js';
import { renderAuthPill, renderComponents, renderEnvSelect, renderTarget } from './target.js';
import { syncHistory } from './terminal.js';
import { $, setNamePrefix, toast } from './util.js';

/** The skeleton stays up at least this long on the first load, so a fast answer does not make it flash. */
const SKELETON_MIN_MS = 350;

/** The page is ready: the placeholders go and the real content fades in. */
function finishLoading() {
  // Only the first time: later loads must not touch the terminal's blocks.
  if (!document.body.classList.contains('is-loading')) return;
  document.querySelectorAll('.skel-row').forEach(el => el.remove());
  // Emptied completely (not just the placeholders taken out), so the terminal's own "nothing has run yet" message, which needs it to be empty, shows.
  $('term').replaceChildren();
  document.body.classList.remove('is-loading');
  document.body.classList.add('is-ready');
}

/** The lowest server level this page works with (see SERVER_LEVEL in api/config.mjs). */
const REQUIRED_SERVER_LEVEL = 4;

export function render() {
  $('envCount').textContent = state.environments.length;
  $('connCount').textContent = state.connections.length;
  renderAuthPill();
  renderEnvSelect();
  renderComponents();
  renderTarget();
  renderRuns();
  renderEnvironments();
  renderConnections();
}

// What decides whether the lists changed.
const signatureOf = data =>
  JSON.stringify([
    data.environments,
    data.notesProblems,
    data.hubConfigFound,
    data.connections,
    data.components,
    data.namePrefix
  ]);
let listSignature = '';

/** Asks the server for everything and draws it. */
export async function load() {
  const first = document.body.classList.contains('is-loading');
  try {
    const [config] = await Promise.all([
      api('/api/config'),
      first
        ? new Promise(resolve =>
            setTimeout(resolve, Math.max(0, SKELETON_MIN_MS - performance.now()))
          )
        : null
    ]);
    Object.assign(state, config);
    setNamePrefix(state.namePrefix);
    // A server started before the page was updated reports a lower level, or none: say so, since it would not recognise everything.
    $('staleBar').hidden = (state.serverLevel || 0) >= REQUIRED_SERVER_LEVEL;
    listSignature = signatureOf(state);
    render();
    finishLoading();
    syncHistory();
  } catch (err) {
    // Without an answer there is nothing to show but the message, so the placeholders do not stay up forever.
    finishLoading();
    toast('Could not reach the hub: ' + err.message, 'error');
  }
}

/**
 * hub.config.json is read by the server on every request, but the page only asked once. So it asks again, quietly, and redraws the lists only
 * if they changed. Not while a publish or sign-in is running, so the dropdowns do not change under it.
 */
async function refreshLists() {
  if (state.running || state.signingIn || document.hidden) return;
  try {
    const fresh = await api('/api/config');
    if (signatureOf(fresh) === listSignature) return;
    listSignature = signatureOf(fresh);
    Object.assign(state, {
      environments: fresh.environments,
      notesProblems: fresh.notesProblems,
      hubConfigFound: fresh.hubConfigFound,
      hubConfigPath: fresh.hubConfigPath,
      connections: fresh.connections,
      components: fresh.components,
      namePrefix: fresh.namePrefix
    });
    setNamePrefix(fresh.namePrefix);
    $('envCount').textContent = state.environments.length;
    $('connCount').textContent = state.connections.length;
    renderEnvSelect();
    // A component added to (or removed from) src/components shows up here, and in the Publish all count.
    renderComponents();
    renderTarget();
    renderEnvironments();
    renderConnections();
  } catch {
    /* The hub is not reachable for a moment; the next try will do. */
  }
}

/** When the lists are checked: when the tab is shown or focused, and every few seconds. And the sign-in, once a minute, as its minutes count down. */
export function startPolling() {
  window.addEventListener('focus', refreshLists);
  document.addEventListener('visibilitychange', refreshLists);
  setInterval(refreshLists, 4000);
  setInterval(() => {
    if (state.running || document.hidden) return;
    api('/api/status')
      .then(status => {
        state.auth = status.auth;
        renderAuthPill();
        renderTarget();
      })
      .catch(() => {});
  }, 60000);
}
