// The Deployment Hub on its own: npm run hub. (In Storybook the same page and API are served by vite-plugin.mjs.)
// This file only routes: the page and its assets (api/assets.mjs), the API (api/index.mjs), and the start-up message (api/banner.mjs).
import { createServer } from 'node:http';
import { PAGE_PATHS, handleDxApiRequest, serveHubAsset, serveHubPage } from './api/index.mjs';
import { printBanner } from './api/banner.mjs';

const PORT = Number(process.env.PORT) || 3050;
// The hub can publish to Pega with saved sign-ins and has no login of its own, so it listens on this computer only. `dx-hub --host`
// (DX_HUB_HOST) opens it to the network on purpose.
const HOST = process.env.DX_HUB_HOST || '127.0.0.1';
const LOCAL_ONLY = ['127.0.0.1', 'localhost', '::1'].includes(HOST);
// A web page on another site can be made to point its own name at 127.0.0.1 (DNS rebinding) and then talk to this server as if it were
// its own. So while the hub is local-only it answers only to the names of this computer.
const LOCAL_NAMES = new Set(['localhost', '127.0.0.1', '[::1]']);
const hostnameOf = host => String(host || '').replace(/:\d+$/, '').toLowerCase();

const server = createServer(async (req, res) => {
  if (LOCAL_ONLY && !LOCAL_NAMES.has(hostnameOf(req.headers.host))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('The Deployment Hub only answers on this computer. Open it at http://localhost.');
  }
  const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET') {
    // The page is at /hub (and at the root, since nothing else lives here).
    if (pathname === '/' || pathname === '/index.html' || PAGE_PATHS.includes(pathname))
      return serveHubPage(res);
    if (serveHubAsset(pathname, res)) return;
  }

  if (await handleDxApiRequest(req, res)) return;

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// A port that is taken (another hub still open, or something else) is not an error: the next one is tried, so `npm run hub` always starts.
// The banner is printed once, for the port that was really bound (a listen callback would be added again by every attempt, and the failed
// ones would print theirs). Any other failure to listen is still thrown, and after MAX_TRIES busy ports it stops.
const MAX_TRIES = 20;
server.once('listening', () => printBanner(server.address().port, HOST));
function listen(port, tries = 1) {
  server.once('error', error => {
    if (error.code === 'EADDRINUSE' && tries < MAX_TRIES) {
      console.log(`Port ${port} is in use, trying ${port + 1}...`);
      listen(port + 1, tries + 1);
    } else {
      throw error;
    }
  });
  server.listen(port, HOST);
}
listen(PORT);
