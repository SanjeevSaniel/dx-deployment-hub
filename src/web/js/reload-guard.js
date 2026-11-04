// Reloading the page ends a run: the server stops the CLI when the page that started it goes away (see startRun in api/runs.mjs), so a stray F5
// in the middle of a publish would stop it half way. This asks first. Only runs that leave something behind are guarded; stopping a validation or
// a sign-in loses nothing.
import { confirmDialog } from './confirm-dialog.js';
import { state } from './state.js';

const HARMLESS = ['authenticate', 'validateSchema'];

const guarded = () =>
  Boolean(state.queue) || (state.running && !HARMLESS.includes(state.currentAction));

// Set once the person has said yes, so the browser's own question is not asked a second time on the reload that follows.
let leaving = false;
let asking = false;

export function initReloadGuard() {
  // F5 and Ctrl/Cmd+R can be caught, so they get the page's own dialog. The browser's reload button, closing the tab and going back cannot be
  // caught that way: for those the browser only allows its own wording, which is the fallback below.
  document.addEventListener('keydown', async event => {
    const reloads = event.key === 'F5' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r');
    if (!reloads || !guarded()) return;
    event.preventDefault();
    if (asking) return;
    asking = true;
    const sure = await confirmDialog({
      title: 'Reload and stop publishing?',
      lead: state.queue
        ? 'Reloading ends this run. Anything already published to the server stays there, and the components still waiting are not published.'
        : 'Reloading ends this run. Anything already published to the server stays there.',
      confirm: 'Reload and stop',
      danger: true
    });
    asking = false;
    if (!sure) return;
    leaving = true;
    location.reload();
  });

  window.addEventListener('beforeunload', event => {
    if (leaving || !guarded()) return;
    event.preventDefault();
    // Some browsers only ask when a return value is set.
    event.returnValue = '';
  });
}
