// Small things the other server modules share.
import { existsSync, readFileSync } from 'node:fs';

/** Text as an id: letters, numbers and single dashes. */
export const slug = text =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** The host part of a URL, or an empty string when it is not one. */
export const hostOf = url => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

/** A JSON file's contents, or the fallback when it is missing or not valid. */
export const readJsonFile = (path, fallback) => {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
  } catch {
    return fallback;
  }
};
