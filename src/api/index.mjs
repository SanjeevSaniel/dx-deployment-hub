// The Deployment Hub's API: one function that answers a request, used by the standalone server and by the Storybook (Vite) plugin.
//
//   GET  /api/status        who is signed in, and whether a run is active
//   GET  /api/config        everything the page shows: environments, connections (without secrets), components, sign-in, runs
//   POST /api/environments  save the hub's own environments
//   POST /api/connections   save the connections
//   GET  /api/runs/:id      one run, with its output
//   POST /api/run           start an action; the answer is a stream of events (see runs.mjs)
//   POST /api/abort         stop the active run
//
// Two things are kept apart on purpose:
//   - an ENVIRONMENT is where a build goes: a Pega server URL, one ruleset, one version, a development or production build;
//   - a CONNECTION is how the hub signs in to a server: server type, grant type, client ID and client secret.
// The client secret is only ever written, never sent back to the browser.
import { existsSync, readFileSync } from 'node:fs';
import { PATHS, SERVER_LEVEL } from './config.mjs';
import { getAuthStatus } from './auth.mjs';
import { applyEnvironment, buildCliArgs, NEEDS_ENVIRONMENT } from './cli.mjs';
import { commonNamePrefix, getComponentList } from './components.mjs';
import { readNamePrefix } from './hub-config.mjs';
import { allConnections, publicConnection, saveConnections } from './connections.mjs';
import {
  allEnvironments,
  loadEnvironments,
  saveEnvironments,
  withVersion
} from './environments.mjs';
import { isRulesetVersion } from './validation.mjs';
import { isSameOrigin, readJsonBody, sendJson } from './http.mjs';
import { abortActiveRun, findRun, isRunning, listRuns, startRun } from './runs.mjs';

/** What the page needs to draw itself. */
async function configPayload() {
  const everything = allEnvironments();
  const components = await getComponentList();
  const fromFile = existsSync(PATHS.hubConfig) ? readNamePrefix(readFileSync(PATHS.hubConfig, 'utf8')) : '';
  return {
    // Dropped from component names on screen: hub.config.json's "namePrefix", else what all the components share.
    namePrefix: fromFile || commonNamePrefix(components),
    environments: everything.environments,
    notesProblems: everything.problems,
    hubConfigFound: existsSync(PATHS.hubConfig),
    // The full path, so the Environments tab can say exactly which file to edit for a permanent addition.
    hubConfigPath: PATHS.hubConfig,
    // Raised whenever the page starts to rely on something new in this server, so a page served beside an older, still-running server can say so.
    serverLevel: SERVER_LEVEL,
    connections: allConnections().map(publicConnection),
    components,
    auth: getAuthStatus(),
    runs: listRuns()
  };
}

/** Starts an action. Returns after the stream has begun, or after answering with an error. */
async function handleRun(req, res) {
  if (isRunning()) {
    sendJson(res, 409, { error: 'Another task is already running. Wait for it or abort it.' });
    return;
  }
  const { action, component, environmentId, rulesetVersion } = await readJsonBody(req);
  const listed = allEnvironments().environments.find(entry => entry.id === environmentId);
  // A publish goes out under the version typed on the page, which has to be a real one. Signing in, a build and a validation do not use
  // a version, so one that is half typed does not stop them.
  const usesVersion = ['publish', 'publishAll'].includes(action);
  if (usesVersion && listed && !isRulesetVersion(rulesetVersion)) {
    sendJson(res, 400, { error: 'Type the version as three two-digit parts, like 01-01-01.' });
    return;
  }
  const environment = usesVersion ? withVersion(listed, rulesetVersion) : listed;
  if (NEEDS_ENVIRONMENT.includes(action) && !environment) {
    sendJson(res, 400, { error: 'Choose an environment first.' });
    return;
  }
  if (component && !(await getComponentList()).includes(component)) {
    sendJson(res, 400, { error: `There is no component called "${component}".` });
    return;
  }
  const { args, error } = buildCliArgs(action, { component, environment });
  if (error) {
    sendJson(res, 400, { error });
    return;
  }
  if (environment) {
    const connections = allConnections();
    const connection =
      connections.find(entry => entry.id === environment.connectionId) ?? connections[0];
    await applyEnvironment(environment, connection, action);
  }
  startRun({ req, res, action, component, environment, cliArgs: args });
}

/**
 * Answers an API request. Returns true when the request was an API request and has been answered, false when it is not the hub's.
 */
export async function handleDxApiRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/^\/api\/dx/, '/api');
  if (!pathname.startsWith('/api/')) return false;

  if (!isSameOrigin(req)) {
    sendJson(res, 403, { error: 'This request did not come from the Deployment Hub page.' });
    return true;
  }
  // The browser cannot make a cross-site request with this header without asking first, and nothing here answers that.
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  if (req.method === 'POST' && req.headers['x-dx-hub'] !== '1') {
    sendJson(res, 403, { error: 'Missing the Deployment Hub header.' });
    return true;
  }

  const route = `${req.method} ${pathname}`;
  try {
    if (route === 'GET /api/status') {
      sendJson(res, 200, { auth: getAuthStatus(), isRunning: isRunning() });
      return true;
    }
    if (route === 'GET /api/config') {
      sendJson(res, 200, await configPayload());
      return true;
    }
    if (route === 'POST /api/environments') {
      const body = await readJsonBody(req);
      if (!Array.isArray(body.environments)) {
        sendJson(res, 400, { error: 'Environments must be a list.' });
        return true;
      }
      sendJson(res, 200, {
        success: true,
        environments: await saveEnvironments(body.environments)
      });
      return true;
    }
    if (route === 'POST /api/connections') {
      const body = await readJsonBody(req);
      if (!Array.isArray(body.connections)) {
        sendJson(res, 400, { error: 'Connections must be a list.' });
        return true;
      }
      const saved = await saveConnections(body.connections);
      // An environment whose connection was removed moves to the first one that is left.
      await saveEnvironments(loadEnvironments());
      sendJson(res, 200, { success: true, connections: saved.map(publicConnection) });
      return true;
    }
    if (req.method === 'GET' && pathname.startsWith('/api/runs/')) {
      const run = findRun(pathname.split('/').pop());
      if (run) sendJson(res, 200, run);
      else sendJson(res, 404, { error: 'That run is no longer kept.' });
      return true;
    }
    if (route === 'POST /api/abort') {
      const stopped = abortActiveRun();
      sendJson(res, 200, { success: true, message: stopped ? 'Stopping' : 'No process running' });
      return true;
    }
    if (route === 'POST /api/run') {
      await handleRun(req, res);
      return true;
    }
  } catch (err) {
    // A bad request body or a rejected save is the caller's to fix; anything else is the server's.
    const clientError = ['POST /api/environments', 'POST /api/connections'].includes(route);
    if (!res.headersSent) sendJson(res, clientError ? 400 : 500, { error: err.message });
    return true;
  }
  return false;
}

// What the tests, the standalone server and the Storybook plugin use from here.
export { serveHubAsset, serveHubPage, PAGE_PATHS } from './assets.mjs';
export { getAuthStatus } from './auth.mjs';
export { getComponentList } from './components.mjs';
export { environmentsFromConfig, withVersion } from './environments.mjs';
export { isSameOrigin } from './http.mjs';
export {
  mentionsLockedRuleset,
  rulesetProblemIn,
  runProblemIn,
  serverResponds
} from './problems.mjs';
export { stopProcess } from './process.mjs';
export {
  cleanServerUrl,
  isRulesetVersion,
  validateConnection,
  validateEnvironment
} from './validation.mjs';
export { SERVER_LEVEL } from './config.mjs';
