// What has been published where, so a publish can be told apart from a republish. Runs are only kept in memory, but a component published
// yesterday and published again today is still a republish, so the successful publishes are written to a small file of the hub's own.
//   { "<server host>": { "<component>": [ { "ruleset": "...", "version": "...", "at": "<ISO time>", "count": 2 } ] } }
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { PATHS } from './config.mjs';

function readHistory(file) {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  } catch {
    // A file that cannot be read is treated as no history: the worst outcome is a republish called a publish.
    return {};
  }
}

/**
 * What a publish to this target is:
 *   publish     the first time the component goes to this server
 *   republish   the same ruleset and version again: Pega replaces what is there
 *   newVersion  the component is on this server already, but under another ruleset or version
 * With no component (publish all) any component on the server counts. `lastAt` is when it last went to exactly this ruleset and version.
 */
export function classifyPublish(
  { server, ruleset, version, component },
  file = PATHS.publishHistory
) {
  const onServer = (server && readHistory(file)[server]) || {};
  const names = component ? [component] : Object.keys(onServer);
  const entries = names.flatMap(name => onServer[name] ?? []);
  const same = entries.filter(entry => entry.ruleset === ruleset && entry.version === version);
  if (same.length > 0) {
    return {
      kind: 'republish',
      lastAt: same
        .map(entry => entry.at)
        .sort()
        .at(-1)
    };
  }
  return { kind: entries.length > 0 ? 'newVersion' : 'publish', lastAt: null };
}

/** Remembers that these components went through to this ruleset and version. Never throws: a note that cannot be saved must not fail a publish. */
export function recordPublish(
  { server, ruleset, version, components },
  file = PATHS.publishHistory
) {
  if (!server) return;
  try {
    const history = readHistory(file);
    const onServer = (history[server] ||= {});
    const at = new Date().toISOString();
    components.forEach(name => {
      const list = (onServer[name] ||= []);
      const entry = list.find(item => item.ruleset === ruleset && item.version === version);
      if (entry) {
        entry.at = at;
        entry.count = (entry.count || 1) + 1;
      } else {
        list.push({ ruleset, version, at, count: 1 });
      }
    });
    writeFileSync(file, JSON.stringify(history, null, 2), 'utf8');
  } catch {
    /* not saved: the next publish may be called a publish when it is a republish */
  }
}
