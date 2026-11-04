// Reads hub.config.json: the servers the hub publishes to, the rulesets on each, and the versions of each. It is the hub's own
// file, in the manner of tasks.config.json: git ignores it, and hub.config.sample.json is the sample to copy it from. Both sit in the project folder beside tasks.config.json.
//
//   { "servers": [ { "name": "Dev", "url": "https://...", "connection": "Default", "build": "dev",
//       "clientId": "...", "clientSecret": "...",
//       "rulesets": [ { "name": "MyComponents", "versions": ["01-01-01", "01-01-02"] } ] } ] }
//
// A server may carry its own sign-in (clientId and clientSecret, with serverType and grantType if they differ from infinity and
// clientCreds). It then has a connection of its own, named after the server, which its rows use instead of "connection". A
// secret written as "env:NAME" is read from that environment variable, so it need not sit in the file.
//
// Every server, ruleset and version is one row. Keys that start with an underscore are notes and are ignored.

export const CONFIG_FILE = 'hub.config.json';

// The sample file holds <placeholders>; a copy that has not been filled in yet must not make a connection with them.
const isFilledIn = value =>
  typeof value === 'string' && value.trim() !== '' && !/^<.*>$/.test(value.trim());

const secretOf = value => {
  const text = String(value ?? '').trim();
  return text.startsWith('env:') ? (process.env[text.slice(4).trim()] ?? '') : text;
};

/** The id of the connection a server carries, from its name; the same name always gives the same id. */
const ownConnectionId = label =>
  `file-${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;

/** The connections that servers of the file carry (those with a client ID), read-only: they are never copied into the hub's own list. */
export function connectionsFromHubConfig(text) {
  let data;
  try {
    data = JSON.parse(String(text ?? ''));
  } catch {
    return [];
  }
  const servers = Array.isArray(data?.servers) ? data.servers : [];
  return servers
    .filter(server => isFilledIn(server?.clientId))
    .map((server, index) => {
      const label = String(server?.name ?? '').trim() || `server ${index + 1}`;
      return {
        id: ownConnectionId(label),
        name: label,
        serverType: server.serverType === 'launchpad' ? 'launchpad' : 'infinity',
        grantType: server.grantType || 'clientCreds',
        clientId: String(server.clientId).trim(),
        clientSecret: isFilledIn(server.clientSecret) ? secretOf(server.clientSecret) : '',
        source: 'file'
      };
    });
}

/** The rows of the file, and what is wrong with it. A row is checked by the same rules as an environment typed into the page. */
/**
 * The team prefix to drop from component names on screen ("namePrefix": "Acme_Team_"), or an empty string when the file has none.
 * It is only for showing: a component keeps its real name wherever it is sent or compared.
 */
export function readNamePrefix(text) {
  try {
    const value = JSON.parse(String(text ?? ''))?.namePrefix;
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

export function parseHubConfig(text) {
  const rows = [];
  const problems = [];
  let data;
  try {
    data = JSON.parse(String(text ?? ''));
  } catch (err) {
    return { rows, problems: [`${CONFIG_FILE} is not valid JSON: ${err.message}`] };
  }
  const servers = Array.isArray(data?.servers) ? data.servers : [];
  servers.forEach((server, index) => {
    const label = String(server?.name ?? '').trim() || `server ${index + 1}`;
    const rulesets = Array.isArray(server?.rulesets) ? server.rulesets : [];
    if (rulesets.length === 0) problems.push(`"${label}": list at least one ruleset.`);
    rulesets.forEach(ruleset => {
      const versions = Array.isArray(ruleset?.versions)
        ? ruleset.versions
        : ruleset?.version
          ? [ruleset.version]
          : [];
      if (versions.length === 0)
        problems.push(
          `"${label}" ${ruleset?.name ?? ''}: list at least one version.`.replace('  ', ' ')
        );
      versions.forEach(version =>
        rows.push({
          name: `${label} ${ruleset?.name ?? ''}`.trim(),
          serverName: label,
          serverUrl: server?.url ?? server?.serverUrl ?? '',
          rulesetName: ruleset?.name ?? '',
          rulesetVersion: String(version),
          // A ruleset's own build wins over the server's.
          build: ruleset?.build ?? server?.build ?? '',
          connection: server?.connection ?? '',
          // Set when the server carries its own sign-in; that connection then wins over the name above.
          ownConnectionId: isFilledIn(server?.clientId) ? ownConnectionId(label) : ''
        })
      );
    });
  });
  return { rows, problems };
}

/** A row as an environment, ready to be checked and saved. */
export function toEnvironment(row, connections) {
  const build = String(row.build ?? '')
    .trim()
    .toLowerCase();
  const wanted = String(row.connection ?? '')
    .trim()
    .toLowerCase();
  const connection =
    connections.find(entry => entry.id === row.ownConnectionId) ??
    connections.find(entry => entry.name.toLowerCase() === wanted) ??
    connections[0];
  return {
    name: row.name ?? '',
    // What the Server dropdown calls this server.
    serverName: row.serverName ?? row.name ?? '',
    serverUrl: row.serverUrl ?? '',
    rulesetName: row.rulesetName ?? '',
    rulesetVersion: row.rulesetVersion ?? '',
    // Development unless the file says production (or prod).
    devBuild: !build.startsWith('prod'),
    connectionId: connection?.id,
    file: CONFIG_FILE
  };
}
