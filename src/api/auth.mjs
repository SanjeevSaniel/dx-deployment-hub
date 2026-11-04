// Who is signed in: read from the token the CLI keeps, plus a note of which server it was for.
import { existsSync, readFileSync } from 'node:fs';
import { PATHS } from './config.mjs';
import { readJsonFile } from './util.mjs';

function decodeJwt(tokenStr) {
  try {
    const parts = tokenStr.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export function getAuthStatus() {
  const state = readJsonFile(PATHS.authState, {});
  if (!existsSync(PATHS.token)) {
    return { authenticated: false, reason: 'No token found', message: 'Not signed in.' };
  }
  try {
    const tokenObj = JSON.parse(readFileSync(PATHS.token, 'utf8'));
    const now = Date.now();
    const expiresAt =
      tokenObj.eA ||
      (tokenObj.expires_in && tokenObj.iat
        ? tokenObj.iat * 1000 + tokenObj.expires_in * 1000
        : null);
    const payload = tokenObj.access_token ? decodeJwt(tokenObj.access_token) : null;
    const jwtExp = payload?.exp ? payload.exp * 1000 : null;
    const effectiveExp = expiresAt || jwtExp;
    const isExpired = effectiveExp ? now >= effectiveExp : false;
    const minutesRemaining = effectiveExp
      ? Math.max(0, Math.round((effectiveExp - now) / 60000))
      : null;

    if (isExpired) {
      return {
        authenticated: false,
        expired: true,
        reason: 'Token expired',
        message: 'The sign-in has expired.',
        user: payload?.sub || null,
        server: state.server || null
      };
    }
    return {
      authenticated: true,
      user: payload?.sub || 'Signed in',
      appName: payload?.app_name || null,
      appVersion: payload?.app_version || null,
      expiresInMinutes: minutesRemaining,
      // The CLI keeps ONE token, for the server that was signed in to last, so the hub remembers which one that was and
      // the page can warn when a different environment is chosen.
      server: state.server || null,
      message: 'Signed in'
    };
  } catch (err) {
    return { authenticated: false, reason: 'Error reading token', message: err.message };
  }
}
