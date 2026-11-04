// Reading the CLI's words. When a sign-in or a publish goes wrong, the CLI says so only in its output (a failed sign-in even ends with exit code 0),
// so the output is read for the cases the page shows in their own status and colour:
//   auth    - the sign-in failed ("Authentication failed", "Token endpoint error"). Rose.
//   invalid - the ruleset version is not one Pega accepts ("Invalid Ruleset version: Please provide correct unlocked ruleset version"). Violet.
//   locked  - the version exists but is locked ("RuleSet ... is locked"). Amber.
// The invalid message contains "unlocked", which is why "lock" is only matched as a whole word, and why invalid is checked before locked.

const AUTH_FAILED =
  /authentication failed|token endpoint error|invalid_client|unauthorized_client/i;
const INVALID_RULESET = /invalid\s+rule\s*set(\s+version)?/i;
const LOCKED_RULESET =
  /(rule\s*set[^\n]{0,80}\block(?:ed)?\b|\block(?:ed)?\b[^\n]{0,80}rule\s*set)/i;

/** One sentence for the terminal when a problem is recognised. */
export const PROBLEM_NOTES = {
  auth: "Sign-in failed. Check the connection's client ID and secret, and that the server address is right.",
  invalid:
    'Pega does not accept this ruleset version. Check the ruleset name and version, and that the version is unlocked.',
  locked: 'This ruleset version is locked in Pega. Unlock it there, or choose another version.',
  serverDown:
    'The Pega server did not answer. It may be stopped, or not reachable from this computer. Start it, then sign in again.'
};

/** 'invalid', 'locked' or null: which ruleset problem the text from a publish describes. */
export function rulesetProblemIn(text) {
  const value = String(text ?? '');
  if (INVALID_RULESET.test(value)) return 'invalid';
  return LOCKED_RULESET.test(value) ? 'locked' : null;
}

/** 'auth', 'invalid', 'locked' or null. A failed sign-in is checked first, because a publish that could not sign in never reached the ruleset. */
export function runProblemIn(text) {
  return AUTH_FAILED.test(String(text ?? '')) ? 'auth' : rulesetProblemIn(text);
}

/** Whether text from a publish says the ruleset (version) is locked. */
export function mentionsLockedRuleset(text) {
  return rulesetProblemIn(text) === 'locked';
}

/**
 * Whether a Pega server answers at all. After a failed sign-in this tells "the server is not running or not reachable" (the usual cause of
 * a "Token endpoint error") from "it is up, so the connection details are the problem". Any answer under 500 counts as up, including a
 * login page or a 401; no answer, a timeout or a gateway error (502, 503, 504) counts as down.
 */
export async function serverResponds(url, timeoutMs = 4000) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs)
    });
    return response.status < 500;
  } catch {
    return false;
  }
}
