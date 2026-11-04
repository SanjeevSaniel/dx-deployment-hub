// What may be saved, so a typo cannot reach the CLI as something else. Each check returns a sentence for the person, or null when it passes.

const RULESET_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
// Pega ruleset versions are three two-digit parts, written with dashes for the CLI: 01-01-01.
const RULESET_VERSION = /^\d{2}-\d{2}-\d{2}$/;

/** Whether a version is three two-digit parts, 01-01-01: the rule for a version typed on the page, and for one saved with an environment. */
export const isRulesetVersion = value => RULESET_VERSION.test(String(value ?? '').trim());

const SERVER_TYPES = ['infinity', 'launchpad'];
const GRANT_TYPES = ['clientCreds', 'passwordCreds', 'authCode'];

/** The URL with a closing slash, or null when it is not an http(s) address. */
export function cleanServerUrl(value) {
  const text = String(value ?? '').trim();
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return text.endsWith('/') ? text : `${text}/`;
}

export function validateEnvironment(env) {
  if (!env || typeof env !== 'object') return 'An environment is missing.';
  if (!String(env.name ?? '').trim()) return 'Every environment needs a name.';
  if (!cleanServerUrl(env.serverUrl)) {
    return `"${env.name}": the server URL must start with https:// (or http://).`;
  }
  if (!RULESET_NAME.test(String(env.rulesetName ?? ''))) {
    return `"${env.name}": the ruleset name uses letters, numbers and underscores only.`;
  }
  if (!RULESET_VERSION.test(String(env.rulesetVersion ?? ''))) {
    return `"${env.name}": the version is three two-digit parts, for example 01-01-01.`;
  }
  return null;
}

export function validateConnection(connection) {
  if (!connection || typeof connection !== 'object') return 'A connection is missing.';
  if (!String(connection.name ?? '').trim()) return 'Every connection needs a name.';
  if (!SERVER_TYPES.includes(connection.serverType)) {
    return `"${connection.name}": choose Infinity or Launchpad.`;
  }
  if (!GRANT_TYPES.includes(connection.grantType)) {
    return `"${connection.name}": choose a grant type.`;
  }
  return null;
}
