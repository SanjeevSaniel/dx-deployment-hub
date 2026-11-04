// The things the hub can do, and the words for them. One table so a run, its block in the terminal, its row in the list and the buttons all
// say the same thing: "Published", not "Succeeded".

/** What each action is called. */
export const ACTION_NAMES = {
  publish: 'Publish',
  publishAll: 'Publish all',
  buildComponent: 'Build',
  buildAllComponents: 'Build all',
  validateSchema: 'Validate',
  authenticate: 'Sign in'
};

/** What an action is called while it runs, when it went through, and when it did not. */
export const OUTCOMES = {
  publish: { doing: 'Publishing', done: 'Published', failed: 'Publish failed' },
  publishAll: { doing: 'Publishing all', done: 'Published all', failed: 'Publish all failed' },
  buildComponent: { doing: 'Building', done: 'Built', failed: 'Build failed' },
  buildAllComponents: { doing: 'Building all', done: 'Built all', failed: 'Build all failed' },
  validateSchema: { doing: 'Validating', done: 'Validated', failed: 'Validation failed' },
  authenticate: { doing: 'Signing in', done: 'Signed in', failed: 'Sign-in failed' }
};

/**
 * A publish is a publish, a republish (the same ruleset and version again, which replaces what is on the server) or a new version
 * (the component is on the server already, under another ruleset or version). The server works out which (run.kind); the other actions
 * have no kind and keep their own words.
 */
export const KIND_WORDS = {
  republish: { name: 'Republish', doing: 'Republishing', done: 'Republished', failed: 'Republish failed' },
  newVersion: { name: 'Publish', tag: 'New version' }
};

/** The kind of a publish run in words for a tag next to its name: 'Republish', 'New version', 'First publish', or '' for any other run. */
export const kindTag = run => {
  if (run.action !== 'publish' && run.action !== 'publishAll') return '';
  if (run.kind === 'republish') return 'Republish';
  if (run.kind === 'newVersion') return 'New version';
  return run.kind === 'publish' ? 'First publish' : '';
};

/** The name of a run: "Republish" for a republish, otherwise what the action is called (a publish all becomes "Republish all"). */
export const runName = run => {
  const base = ACTION_NAMES[run.action] || run.action;
  return run.kind === 'republish' ? base.replace('Publish', 'Republish') : base;
};

export const outcomeOf = run => {
  const own = OUTCOMES[run.action] || { doing: 'Running', done: 'Done', failed: 'Failed' };
  return run.kind === 'republish'
    ? {
        doing: own.doing.replace('Publishing', 'Republishing'),
        done: own.done.replace('Published', 'Republished'),
        failed: own.failed.replace('Publish', 'Republish')
      }
    : own;
};

/** The status words for the problems the server recognises in the CLI's output (see api/problems.mjs). */
export const ISSUE_WORDS = {
  locked: 'Ruleset locked',
  invalid: 'Invalid version',
  auth: 'Sign-in failed'
};

/** The actions that put something on a Pega server: they ask before stopping, and the target cannot change under them. */
export const PUBLISHING = { publish: 'Publishing...', publishAll: 'Publishing all...' };

/** What the Stop button says while each action runs: it names what it stops. */
export const STOP_LABELS = {
  publish: 'Stop publishing',
  publishAll: 'Stop publishing',
  buildComponent: 'Stop build',
  buildAllComponents: 'Stop build',
  validateSchema: 'Stop validating',
  authenticate: 'Cancel sign-in'
};
