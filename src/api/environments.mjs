// Environments: where a build goes (a Pega server, one ruleset, one version, a development or production build).
// There are two sources, shown together:
//   - the hub's own, added in the page and kept in environments.local.json;
//   - the rows of hub.config.json, read from the file each time and never copied into the hub's own list, so editing the file is all it takes.
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { PATHS } from './config.mjs';
import { CONFIG_FILE, parseHubConfig, toEnvironment } from './hub-config.mjs';
import { allConnections } from './connections.mjs';
import { readJsonFile, slug } from './util.mjs';
import { cleanServerUrl, validateEnvironment } from './validation.mjs';

/** The environments added in the page itself. */
export function loadEnvironments() {
  const saved = readJsonFile(PATHS.environments, []);
  return Array.isArray(saved) ? saved : [];
}

const sameTarget = (a, b) =>
  cleanServerUrl(a.serverUrl) === cleanServerUrl(b.serverUrl) &&
  a.rulesetName === b.rulesetName &&
  a.rulesetVersion === b.rulesetVersion;

/**
 * The rows of hub.config.json as environments, ready to list beside the ones kept in the hub. A row for a server, ruleset and
 * version the hub already has is left out (the hub's own wins), and a row that is not valid is reported.
 */
export function environmentsFromConfig(json, connections, local) {
  const environments = [];
  const parsed = json ? parseHubConfig(json) : { rows: [], problems: [] };
  const problems = [...parsed.problems];
  for (const row of parsed.rows) {
    const entry = toEnvironment(row, connections);
    const problem = validateEnvironment(entry);
    if (problem) {
      problems.push(problem);
      continue;
    }
    entry.serverUrl = cleanServerUrl(entry.serverUrl);
    if ([...local, ...environments].some(existing => sameTarget(existing, entry))) continue;
    let id = `file-${slug(`${entry.name}-${entry.rulesetName}-${entry.rulesetVersion}`)}`;
    while (environments.some(existing => existing.id === id)) id = `${id}-2`;
    environments.push({ ...entry, id, source: 'file' });
  }
  return { environments, problems };
}

function loadFileEnvironments(local) {
  try {
    const json = existsSync(PATHS.hubConfig) ? readFileSync(PATHS.hubConfig, 'utf8') : '';
    return environmentsFromConfig(json, allConnections(), local);
  } catch (err) {
    return { environments: [], problems: [`${CONFIG_FILE} could not be read: ${err.message}`] };
  }
}

/**
 * The environment with the version the person typed on the Publish card. The environment says where a build goes (the server and the
 * ruleset); the version is typed each time, so it is not taken from the environment's own. No typed version leaves it as it is.
 */
export function withVersion(environment, version) {
  if (!environment || version === undefined || version === null) return environment;
  return { ...environment, rulesetVersion: String(version).trim() };
}

/** The hub's own environments, then the ones from hub.config.json, and what is wrong with the file. */
export function allEnvironments() {
  const local = loadEnvironments();
  const fromFile = loadFileEnvironments(local);
  return { environments: [...local, ...fromFile.environments], problems: fromFile.problems };
}

/** Saves the hub's own list. Rows that came from hub.config.json are never written here. */
export async function saveEnvironments(incoming) {
  const connectionIds = new Set(allConnections().map(connection => connection.id));
  const merged = [];
  const seen = new Set();
  for (const item of incoming.filter(entry => entry.source !== 'file')) {
    const problem = validateEnvironment(item);
    if (problem) throw new Error(problem);
    let id =
      item.id && !seen.has(item.id) ? item.id : slug(item.name) || `environment-${Date.now()}`;
    while (seen.has(id)) id = `${id}-2`;
    seen.add(id);
    merged.push({
      id,
      name: String(item.name).trim(),
      serverUrl: cleanServerUrl(item.serverUrl),
      rulesetName: String(item.rulesetName).trim(),
      rulesetVersion: String(item.rulesetVersion).trim(),
      devBuild: item.devBuild !== false,
      connectionId: connectionIds.has(item.connectionId) ? item.connectionId : [...connectionIds][0]
    });
  }
  await writeFile(PATHS.environments, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}
