// Serving the page itself: the HTML at /hub, its styles and scripts under /hub-assets/, and the hub's two fonts.
// Used by both the standalone server and the Storybook (Vite) plugin, so the two cannot drift apart.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, normalize, sep } from 'node:path';
import { HUB_DIR, ROOT_DIR, WEB_DIR } from './config.mjs';

/** The addresses the page answers at. /hub is the one to give people; /dx-hub is the earlier one and still works. */
export const PAGE_PATHS = ['/hub', '/hub/', '/dx-hub', '/dx-hub/index.html'];

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

// Where a font may be installed: beside this package (npm hoists dependencies next to it), inside it, or in the project.
const fontCandidates = (font) => [
  join(HUB_DIR, '../..', font),
  join(HUB_DIR, '../node_modules', font),
  join(ROOT_DIR, 'node_modules', font)
];

// The hub's own typeface, served from node_modules, so it looks the same on a machine with no internet.
const FONTS = {
  '/hub-assets/inter.woff2': '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  '/hub-assets/jetbrains-mono.woff2':
    '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2'
};

/** Answers a request for the page (web/index.html). */
export async function serveHubPage(res) {
  try {
    const html = await readFile(join(WEB_DIR, 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(html);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Error reading the hub page: ${err.message}`);
  }
}

/**
 * Answers a request for one of the hub's assets: a font, or a file from the web folder (hub.css, js/...).
 * Returns true when the path was one of them, so the caller knows the request is done.
 */
export function serveHubAsset(pathname, res) {
  const font = FONTS[pathname];
  if (font) {
    const full = fontCandidates(font).find((candidate) => existsSync(candidate));
    if (!full) {
      // Not installed: the page falls back to the system font.
      res.writeHead(404);
      res.end();
      return true;
    }
    res.writeHead(200, {
      'Content-Type': MIME['.woff2'],
      'Cache-Control': 'public, max-age=86400'
    });
    res.end(readFileSync(full));
    return true;
  }

  const prefix = '/hub-assets/';
  if (!pathname.startsWith(prefix)) return false;
  // Only files inside the web folder: a path that climbs out of it (../) is refused.
  const full = normalize(join(WEB_DIR, pathname.slice(prefix.length)));
  if (!full.startsWith(WEB_DIR + sep) || !existsSync(full) || !statSync(full).isFile()) {
    res.writeHead(404);
    res.end();
    return true;
  }
  const type = MIME[full.slice(full.lastIndexOf('.'))] || 'application/octet-stream';
  // No caching: the page is edited while it is being worked on, and a stale script would be hard to tell from a bug.
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(readFileSync(full));
  return true;
}
