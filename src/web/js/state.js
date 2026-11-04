// What the page knows. One object, filled from /api/config and changed by what the person does; the render functions read it and nothing else.
import { hostOf } from './util.js';

export const state = {
  // From the server
  environments: [],
  connections: [],
  components: [],
  auth: null,
  runs: [],
  // What is chosen
  envId: '',
  // The version is typed, per server and ruleset, so it is kept apart from the environment: versionKey says which server and ruleset it is for.
  version: '',
  versionKey: '',
  versionTouched: false,
  component: '',
  selectedRun: null,
  // What is happening
  running: false,
  currentAction: '',
  // The step the CLI is on now, { label: 'Linting', n: 2, total: 5 }, set by the stepper as the output arrives (see pipeline.js); null when none.
  step: null,
  // Set while several components are published one after another: { total, index, component, cancelled }. The buttons act as if a run were going
  // for all of it, also in the moment between two components.
  queue: null,
  signingIn: false,
  signInFailed: false,
  serverDown: false
};

/**
 * A run's number: its place in the order the runs happened, #1 the oldest. state.runs is newest first, so the newest has the highest number.
 * Recent runs and the terminal both read it from here, so a run has the same number in both. 0 for a run that is not in the list.
 */
export const runNumber = id => {
  const index = state.runs.findIndex(run => run.id === id);
  return index < 0 ? 0 : state.runs.length - index;
};

// The chosen environment says where a build goes (the server and the ruleset). The version is what is in the Version box, not the one the
// environment was listed with, so everything that reads currentEnv().rulesetVersion reads the typed one.
export const currentEnv = () => {
  const env = state.environments.find(entry => entry.id === state.envId);
  return env ? { ...env, rulesetVersion: state.version } : env;
};
export const connectionOf = env => state.connections.find(c => c.id === env?.connectionId);

/** Signed in for THIS environment: the CLI keeps one token, for the server signed in to last. */
export function signInState(env) {
  const auth = state.auth;
  if (!env) return { ok: false, text: 'Choose an environment.' };
  if (state.signingIn) return { ok: false, pending: true, text: 'Signing in...' };
  if (!auth || !auth.authenticated) {
    return { ok: false, text: auth?.expired ? 'The sign-in has expired.' : 'Not signed in.' };
  }
  if (auth.server && auth.server !== hostOf(env.serverUrl)) {
    return {
      ok: false,
      text: 'Signed in to ' + auth.server + ', not ' + hostOf(env.serverUrl) + '.'
    };
  }
  return { ok: true, text: 'Signed in' };
}
