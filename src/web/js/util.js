// Small helpers every part of the page uses: finding elements, building them, and formatting.

export const $ = id => document.getElementById(id);

/**
 * Builds an element. Names, URLs and log text are always set as text, never as markup, so nothing from a server or the CLI can add HTML.
 * `class` sets the class, `onclick` and the like add listeners, `true` sets a bare attribute, and false, null and undefined are skipped.
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (value === false || value === null || value === undefined) return;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  });
  children
    .flat()
    .forEach(child =>
      el.append(child instanceof Node ? child : document.createTextNode(child ?? ''))
    );
  return el;
}

export const hostOf = url => {
  try {
    return new URL(url).host;
  } catch {
    return url || '';
  }
};

/** The items of a list with one for each distinct key, in order. */
export const unique = (list, key) => [...new Map(list.map(item => [key(item), item])).values()];

/**
 * The component's name as people read it, as in the Storybook panel: the team prefix it shares with all the others is dropped and the
 * words are spaced at capitals and underscores, so Acme_Team_ServerPaginatedTable reads Server Paginated Table. Only for showing; the
 * folder name stays the component's real name wherever it is sent or compared.
 */
let namePrefix = '';
/** Told by the page from /api/config. */
export const setNamePrefix = prefix => {
  namePrefix = prefix || '';
};

export const shortName = name =>
  (namePrefix && name.startsWith(namePrefix) && name.length > namePrefix.length
    ? name.slice(namePrefix.length)
    : name
  )
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/_+/g, ' ')
    .trim();

/** An environment's name without the ruleset it repeats, or an empty string when nothing else is left. */
export const cleanEnvLabel = (envName, ruleset) => {
  if (!envName) return '';
  if (!ruleset) return envName;
  if (envName.trim().toLowerCase() === ruleset.trim().toLowerCase()) return '';
  return envName
    .replace(new RegExp('\\b' + ruleset + '\\b', 'gi'), '')
    .replace(/[·\-_/|()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/** "just now", "3 min ago", "2 h ago", or the date. */
export const ago = iso => {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso)) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.round(seconds / 60) + ' min ago';
  if (seconds < 86400) return Math.round(seconds / 3600) + ' h ago';
  return new Date(iso).toLocaleDateString();
};

/** How long a finished run took: "32s" or "1m 5s". */
export const duration = run => {
  if (!run.endedAt) return '';
  return formatSeconds(Math.round((new Date(run.endedAt) - new Date(run.startedAt)) / 1000));
};

export const formatSeconds = s => (s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's');

/** A message at the bottom of the page for a few seconds. `type` 'error' makes it red. */
export const toast = (message, type) => {
  const el = $('toast');
  el.textContent = message;
  el.className = 'toast show' + (type === 'error' ? ' error' : '');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    el.className = 'toast';
  }, 3600);
};

/** The CLI's colour codes as spans with classes (the colours are the terminal theme's), and everything else escaped. */
export function ansiToHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\u001b\[0m/g, '</span>')
    .replace(/\u001b\[1m/g, '<span class="ansi-bold">')
    .replace(/\u001b\[2m/g, '<span class="ansi-dim">')
    .replace(/\u001b\[31m/g, '<span class="ansi-red">')
    .replace(/\u001b\[32m/g, '<span class="ansi-green">')
    .replace(/\u001b\[33m/g, '<span class="ansi-yellow">')
    .replace(/\u001b\[34m/g, '<span class="ansi-blue">')
    .replace(/\u001b\[35m/g, '<span class="ansi-magenta">')
    .replace(/\u001b\[36m/g, '<span class="ansi-cyan">')
    .replace(/\u001b\[90m/g, '<span class="ansi-gray">')
    .replace(/\u001b\[(39|22)m/g, '</span>')
    .replace(/\u001b\[[0-9;]*m/g, '');
}
