// Connections: how the hub signs in to a server (server type, grant type, client ID, client secret).
// Kept apart from environments on purpose: one connection can serve many environments. The secret is only ever written, never sent back.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { PATHS } from './config.mjs';
import { connectionsFromHubConfig } from './hub-config.mjs';
import { readJsonFile, slug } from './util.mjs';
import { validateConnection } from './validation.mjs';

export function loadConnections() {
  const saved = readJsonFile(PATHS.connections, null);
  if (Array.isArray(saved) && saved.length > 0) return saved;
  // First run: an empty connection to fill in. Credentials come from the Connections tab or from the servers of hub.config.json, never
  // from tasks.config.json: that file is only what the hub writes for the CLI to read, so reading it back would feed old values in.
  const first = [
    {
      id: 'default',
      name: 'Default',
      serverType: 'infinity',
      grantType: 'clientCreds',
      clientId: '',
      clientSecret: ''
    }
  ];
  writeFileSync(PATHS.connections, JSON.stringify(first, null, 2), 'utf8');
  return first;
}

/** The hub's own connections and the ones the servers of hub.config.json carry. A saved one wins over a file one of the same id. */
export function allConnections() {
  const saved = loadConnections();
  let fromFile = [];
  try {
    fromFile = existsSync(PATHS.hubConfig)
      ? connectionsFromHubConfig(readFileSync(PATHS.hubConfig, 'utf8'))
      : [];
  } catch {
    /* an unreadable file is reported with the environments */
  }
  return [...saved, ...fromFile.filter(entry => !saved.some(own => own.id === entry.id))];
}

/** What the browser gets: everything except the secret, with a flag saying whether one is stored. */
export const publicConnection = connection => {
  const { clientSecret, ...rest } = connection;
  return { ...rest, hasSecret: Boolean(clientSecret) };
};

export async function saveConnections(incoming) {
  const existing = loadConnections();
  const merged = [];
  const seen = new Set();
  // Connections that came from hub.config.json are edited in the file and never written to the hub's own list.
  for (const item of incoming.filter(entry => entry.source !== 'file')) {
    const problem = validateConnection(item);
    if (problem) throw new Error(problem);
    let id =
      item.id && !seen.has(item.id) ? item.id : slug(item.name) || `connection-${Date.now()}`;
    while (seen.has(id)) id = `${id}-2`;
    seen.add(id);
    const before = existing.find(entry => entry.id === item.id);
    merged.push({
      id,
      name: String(item.name).trim(),
      serverType: item.serverType,
      grantType: item.grantType,
      clientId: String(item.clientId ?? '').trim(),
      // A blank secret means "keep the one that is stored": the browser is never shown it, so it cannot send it back.
      clientSecret: item.clientSecret ? String(item.clientSecret) : (before?.clientSecret ?? '')
    });
  }
  if (merged.length === 0) throw new Error('Keep at least one connection.');
  await writeFile(PATHS.connections, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}
