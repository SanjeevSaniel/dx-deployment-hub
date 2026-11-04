// Publishing several components one after another. This file has no page code in it (no document, no fetch), so it can be checked on its own:
// npm run test:hub. The page's part is in publish-selected.js.

// Problems that belong to the target and not to one component: a failed sign-in, a locked ruleset, a version Pega does not accept. The next
// component would meet the same problem, so the queue ends even when it was asked to keep going.
const TARGET_ISSUES = ['auth', 'locked', 'invalid'];

/**
 * Runs `runOne(item)` for each item in turn, waiting for one to end before the next starts (the server runs only one action at a time).
 *
 *   runOne       starts the publish of one component and answers { ok, stopped, issue } when it has ended
 *   keepGoing    carry on after a component fails; a stop and a problem with the target still end the queue
 *   isCancelled  asked before each component; true ends the queue without starting the next one
 *   onProgress   called before each component with { index, total, item }
 *
 * Answers { published, failed, notRun, ended }. `ended` says why it ended: 'done' (all went through), 'failed' (one failed and the queue
 * does not keep going), 'target' (a problem with the target), or 'stopped' (the person stopped it).
 */
export async function runQueue(
  items,
  runOne,
  { keepGoing = false, isCancelled = () => false, onProgress } = {}
) {
  const published = [];
  const failed = [];
  const notRun = [];
  let ended = 'done';
  let next = 0;

  for (; next < items.length; next += 1) {
    if (isCancelled()) {
      ended = 'stopped';
      break;
    }
    onProgress?.({ index: next, total: items.length, item: items[next] });
    let outcome;
    try {
      outcome = await runOne(items[next], next);
    } catch {
      // A component that could not even start is a failure like any other; it never takes the page down with it.
      outcome = { ok: false };
    }
    if (outcome?.ok) {
      published.push(items[next]);
      continue;
    }
    if (outcome?.stopped) {
      // Stopped while it ran: it did not go through, but it did not fail either.
      notRun.push(items[next]);
      ended = 'stopped';
      next += 1;
      break;
    }
    failed.push(items[next]);
    if (TARGET_ISSUES.includes(outcome?.issue)) {
      ended = 'target';
      next += 1;
      break;
    }
    if (!keepGoing) {
      ended = 'failed';
      next += 1;
      break;
    }
  }

  notRun.push(...items.slice(next));
  return { published, failed, notRun, ended };
}

/**
 * One sentence for what the queue did, for the message at the end. `label` turns a component's name into how it is shown.
 *   Published all 3 components
 *   Published 1 of 3. Contact Card failed. 1 not run
 *   Published 1 of 3. Stopped. 2 not run
 */
export function queueSummary({ published, failed, notRun, ended }, label = String) {
  const total = published.length + failed.length + notRun.length;
  if (ended === 'done') {
    return total === 1
      ? 'Published ' + label(published[0])
      : 'Published all ' + total + ' components';
  }
  const parts = ['Published ' + published.length + ' of ' + total];
  if (failed.length) parts.push(failed.map(label).join(', ') + ' failed');
  if (ended === 'stopped') parts.push('Stopped');
  if (notRun.length) parts.push(notRun.length + ' not run');
  return parts.join('. ');
}
