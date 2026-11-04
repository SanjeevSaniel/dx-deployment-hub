// What the Pega Custom DX CLI is told: its arguments for each action, and the tasks.config.json it reads.
import { readFile, writeFile } from 'node:fs/promises';
import { PATHS } from './config.mjs';

/**
 * The CLI's arguments for an action, or { error } when something it needs is missing.
 *
 * The CLI asks a question (such as "Generate development build?") for anything it is not told, and a run has no input to answer with,
 * so everything it would ask is passed here: a development build, with source maps, unless the chosen environment is a production one.
 */
export function buildCliArgs(action, { component, environment }) {
  const devFlag = environment?.devBuild ? 'Y' : 'N';
  // A plain build with no environment chosen is a development build.
  const buildFlag = environment ? devFlag : 'Y';
  switch (action) {
    case 'authenticate':
      return { args: [PATHS.cli, 'authenticate'] };
    case 'publish':
      if (!component) return { error: 'Choose a component to deploy.' };
      return {
        args: [
          PATHS.cli,
          'publish',
          component,
          environment.rulesetName,
          environment.rulesetVersion,
          devFlag
        ]
      };
    case 'publishAll':
      return {
        args: [
          PATHS.cli,
          'publishAll',
          environment.rulesetName,
          environment.rulesetVersion,
          devFlag
        ]
      };
    case 'buildComponent':
      if (!component) return { error: 'Choose a component to build.' };
      return { args: [PATHS.cli, 'buildComponent', component, buildFlag, buildFlag] };
    case 'buildAllComponents':
      return { args: [PATHS.cli, 'buildAllComponents', buildFlag] };
    case 'validateSchema':
      return { args: [PATHS.cli, 'validateSchema', ...(component ? [component] : [])] };
    default:
      return { error: `Unknown action: ${action}` };
  }
}

/** The actions that go to a server, and so need an environment chosen. */
export const NEEDS_ENVIRONMENT = ['authenticate', 'publish', 'publishAll'];

async function readTasksConfig() {
  try {
    return JSON.parse(await readFile(PATHS.tasksConfig, 'utf8'));
  } catch {
    return { 'server-config': {} };
  }
}

/**
 * Writes the chosen environment and its connection into tasks.config.json, which is what the CLI reads. This is output only: the
 * server, ruleset, version and credentials come from the hub's environments and connections (hub.config.json among them), and
 * nothing in tasks.config.json is read back as a source for them.
 */
export async function applyEnvironment(environment, connection, action) {
  const tasksConfig = await readTasksConfig();
  const serverConfig = (tasksConfig['server-config'] = tasksConfig['server-config'] || {});
  serverConfig.server = environment.serverUrl;
  serverConfig.rulesetName = environment.rulesetName;
  serverConfig.rulesetVersion = environment.rulesetVersion;
  serverConfig.devBuild = environment.devBuild;
  if (connection) {
    serverConfig.serverType = connection.serverType;
    serverConfig.grantType = connection.grantType;
    serverConfig.clientId = connection.clientId;
    serverConfig.clientSecret = connection.clientSecret;
  }
  if (action === 'authenticate') {
    // Everything is already in the file, so the CLI has nothing to ask.
    serverConfig.questions_askNever =
      'server,serverType,grantType,clientId,clientSecret,authService,redirectUri';
  }
  await writeFile(PATHS.tasksConfig, JSON.stringify(tasksConfig, null, 4), 'utf8');
}
