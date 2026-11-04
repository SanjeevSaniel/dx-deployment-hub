// The frame around the work: light or dark, the three tabs, and the cards that fold up.
import { $, h } from './util.js';

const VIEWS = ['deploy', 'environments', 'connections'];

/** Light or dark follows the system; the button in the header overrides it, and the choice is remembered. */
export function initTheme() {
  const root = document.documentElement;
  try {
    const saved = localStorage.getItem('dx-hub-theme');
    if (saved) root.dataset.theme = saved;
  } catch {
    /* storage is blocked: the system's choice stands */
  }
  $('themeBtn').addEventListener('click', () => {
    const dark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try {
      localStorage.setItem('dx-hub-theme', root.dataset.theme);
    } catch {
      /* not remembered */
    }
  });
}

export function showView(name) {
  VIEWS.forEach(view => {
    $('view-' + view).hidden = view !== name;
    $('tab-' + view).setAttribute('aria-selected', String(view === name));
  });
  history.replaceState(null, '', '#' + name);
}

/** The tabs switch the view, and the address (#environments) opens that tab directly. */
export function initTabs() {
  document
    .querySelectorAll('.tab')
    .forEach(tab => tab.addEventListener('click', () => showView(tab.dataset.view)));
  const first = location.hash.slice(1);
  if (VIEWS.includes(first)) showView(first);
}

// ── Panels ───────────────────────────────────────────────────────────────

// The runs and the terminal can be hidden and shown from a labelled button in the header, and the boxes that stay open take the room (the
// form is always there, as it is the point of the page). The grid in the style sheet follows the no-runs and no-term classes this sets on
// the view. The choice is remembered, so the screen opens as it was left. The first time both are closed, so the screen holds only what is
// needed to publish; a failed run opens the terminal by itself (see run-action.js). There are no shortcuts: a hidden panel should be easy to find.
const PANELS = {
  // Recent runs always opens hidden, whatever it was left as: the terminal already holds every run, so the list is there to be called up when wanted.
  runs: { button: 'toggleRuns', cls: 'no-runs', card: '.runs-card', startsHidden: true },
  terminal: { button: 'toggleTerm', cls: 'no-term', card: '.term-card' }
};

// A panel fades out before it is taken out of the layout, as it fades in when it comes back (the style sheet's contentIn). The wait is the
// length of the fade-out in the style sheet. Someone who asks their system for less motion gets no fade and no wait.
const LEAVE_MS = 200;
const leaving = {};
const prefersLessMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function isPanelShown(name) {
  return $(PANELS[name].button).getAttribute('aria-pressed') === 'true';
}

// The saved choice has its own key (v2): an older version of this page saved "open" for everyone on first load, and that must not keep the
// terminal open now that it starts closed.
const panelKey = name => 'dx-hub-panel-v2-' + name;

/**
 * Opens or closes a panel. Only a choice the user makes is remembered; a panel the page opens by itself (a failed run) is not.
 * `animate: false` is for the first drawing of the page, where nothing should move.
 */
export function setPanel(name, shown, { remember = true, animate = true } = {}) {
  const panel = PANELS[name];
  const view = $('view-deploy');
  const card = view.querySelector(panel.card);
  $(panel.button).setAttribute('aria-pressed', String(shown));

  clearTimeout(leaving[name]);
  card.classList.remove('is-leaving');
  if (shown) {
    view.classList.remove(panel.cls);
  } else if (animate && !prefersLessMotion() && !view.classList.contains(panel.cls)) {
    card.classList.add('is-leaving');
    leaving[name] = setTimeout(() => {
      card.classList.remove('is-leaving');
      view.classList.add(panel.cls);
    }, LEAVE_MS);
  } else {
    view.classList.add(panel.cls);
  }

  // A panel that always starts hidden has nothing to remember.
  if (!remember || panel.startsHidden) return;
  try {
    localStorage.setItem(panelKey(name), shown ? '1' : '0');
  } catch {
    /* not remembered */
  }
}

/** The header buttons, and the panels as they were left (closed the first time; Recent runs closed every time). */
export function initPanels() {
  Object.entries(PANELS).forEach(([name, panel]) => {
    let shown = false;
    if (!panel.startsHidden) {
      try {
        shown = localStorage.getItem(panelKey(name)) === '1';
      } catch {
        /* closed */
      }
    }
    setPanel(name, shown, { remember: false, animate: false });
    $(panel.button).addEventListener('click', () => setPanel(name, !isPanelShown(name)));
  });
}
