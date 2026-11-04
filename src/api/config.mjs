// Where everything is, and the few numbers the server works to. Nothing else in the hub spells out a path.
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_FILE } from './hub-config.mjs';

/** The package's own src folder (the page is in web/ beside api/). */
export const HUB_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/**
 * The project the hub serves: the folder with package.json, tasks.config.json and hub.config.json. It is where the command is run
 * (Storybook and `npx dx-hub` both start in the project folder); set DX_HUB_ROOT to point somewhere else.
 */
export const ROOT_DIR = resolve(process.env.DX_HUB_ROOT || process.cwd());
/**
 * What the hub keeps for itself (environments, connections with their secrets, sign-in state, publish history) lives in the project,
 * not in the package, so a reinstall or an upgrade never wipes it. Git must ignore this folder (`npx dx-hub init` does that).
 */
export const DATA_DIR = join(ROOT_DIR, '.dx-hub');
try {
  mkdirSync(DATA_DIR, { recursive: true });
} catch {
  // Read-only project: saving will report its own error.
}
/** The page: markup, styles and scripts, served as they are. */
export const WEB_DIR = join(HUB_DIR, 'web');

const PEGA_CLI_DIR = join(ROOT_DIR, 'node_modules/@pega/custom-dx-components');

export const PATHS = {
  // What the CLI reads: the hub writes the chosen environment and connection into it before a run.
  tasksConfig: join(ROOT_DIR, 'tasks.config.json'),
  // What you edit by hand, and the hub only reads.
  hubConfig: join(ROOT_DIR, CONFIG_FILE),
  // What the hub keeps for itself. All four are in .dx-hub/, which git ignores; the client secret is only ever in connections.
  environments: join(DATA_DIR, 'environments.json'),
  connections: join(DATA_DIR, 'connections.json'),
  authState: join(DATA_DIR, 'auth-state.json'),
  // What has been published where, so a publish can be told from a republish (see history.mjs).
  publishHistory: join(DATA_DIR, 'publish-history.json'),
  // The components the hub can build and publish.
  components: join(ROOT_DIR, 'src/components'),
  // The CLI's own token and entry point.
  token: join(PEGA_CLI_DIR, '.access_token'),
  cli: join(PEGA_CLI_DIR, 'bin/index.js')
};

export const LIMITS = {
  /** How many finished runs are remembered (in memory only). */
  runs: 20,
  /** How much output is kept for one run. */
  logChars: 300000
};

/**
 * What this copy of the server can do. The page asks for at least the level it needs, and says so when it is served beside an older,
 * still-running server. Raise it whenever the page starts to rely on something new here.
 *   2: sign-in and ruleset problems are recognised in the output.
 *   3: after a failed sign-in the server says whether the Pega server answers (run.serverUp).
 *   4: a publish run says whether it is a publish, a republish or a new version (run.kind, run.lastPublishedAt).
 */
export const SERVER_LEVEL = 4;
