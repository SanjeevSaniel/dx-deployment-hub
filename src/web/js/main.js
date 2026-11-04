// The Deployment Hub page. Each file in this folder is one part of it:
//
//   util.js         helpers: finding and building elements, formatting
//   actions.js      the actions and the words for them ("Published", "Build failed")
//   api.js          talking to the server, and reading a run's stream of events
//   state.js        what the page knows
//   reload.js       "ask the server again and redraw", registered here so parts can call it without importing one another in a circle
//   chrome.js       the frame: light or dark, the tabs, the cards that fold
//   target.js       server, ruleset, version, component; the sign-in status; which buttons may be pressed
//   pipeline.js     the stepper (Validate, Lint, Bundle, Package, Publish)
//   terminal.js     the terminal: one block per run, following the output, history
//   runs.js         the list of recent runs
//   run-action.js   running an action and moving everything as its events arrive
//   motion.js       the ripple on a pressed button, the rocket launching, the ring when a run ends
//   confirm-dialog.js, reload-guard.js   the page's own question before a publish, a stop or a reload that would end a run
//   queue.js       publishing several components in turn: the order of the work (no page code, so it can be checked on its own)
//   publish-selected.js   Publish several: the list to tick, and what the page shows while it goes
//   environments.js, connections.js, drawer.js   the two tabs and the slide-over that edits them
//   app.js          loading from the server, drawing everything, and keeping the lists up to date
import { load, startPolling } from './app.js';
import { initPanels, initTabs, initTheme } from './chrome.js';
import { initConnections } from './connections.js';
import { initDrawer } from './drawer.js';
import { initEnvironments } from './environments.js';
import { initRipples } from './motion.js';
import { setReload } from './reload.js';
import { initPublishSelected } from './publish-selected.js';
import { initReloadGuard } from './reload-guard.js';
import { initActions } from './run-action.js';
import { initTarget } from './target.js';
import { initTerminal } from './terminal.js';

setReload(load);

initTheme();
initTabs();
initPanels();
initTarget();
initTerminal();
initDrawer();
initEnvironments();
initConnections();
initActions();
initPublishSelected();
initReloadGuard();
initRipples();

load();
startPolling();
