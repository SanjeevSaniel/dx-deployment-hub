// The components the hub can build and publish: the folders under src/components.
import { readdir } from 'node:fs/promises';
import { PATHS } from './config.mjs';

/**
 * The prefix every name shares, up to and including its last underscore (Acme_Team_Table and Acme_Team_Card share "Acme_Team_").
 * Needs two or more components, so a single one is never shortened to nothing.
 */
export function commonNamePrefix(names) {
  if (names.length < 2) return '';
  let prefix = names[0];
  for (const name of names) while (!name.startsWith(prefix)) prefix = prefix.slice(0, -1);
  const cut = prefix.lastIndexOf('_');
  return cut > 0 ? prefix.slice(0, cut + 1) : '';
}

export async function getComponentList() {
  try {
    const entries = await readdir(PATHS.components, { withFileTypes: true });
    return entries
      .filter(
        entry => entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_')
      )
      .map(entry => entry.name)
      .sort();
  } catch {
    return [];
  }
}
