// Checks for the Deployment Hub's own rules (the server side). Run with: npm run test:hub
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  cleanServerUrl,
  environmentsFromConfig,
  isRulesetVersion,
  isSameOrigin,
  mentionsLockedRuleset,
  rulesetProblemIn,
  runProblemIn,
  serverResponds,
  stopProcess,
  validateConnection,
  validateEnvironment,
  withVersion
} from '../src/api/index.mjs';
import { buildCliArgs } from '../src/api/cli.mjs';
import { connectionsFromHubConfig, parseHubConfig, toEnvironment } from '../src/api/hub-config.mjs';
import { publicConnection } from '../src/api/connections.mjs';
import { classifyPublish, recordPublish } from '../src/api/history.mjs';
import { queueSummary, runQueue } from '../src/web/js/queue.js';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const environment = {
  name: 'MyComponents Dev',
  serverUrl: 'https://dev.example.com/prweb/',
  rulesetName: 'MyComponents',
  rulesetVersion: '01-01-01'
};

test('a server URL needs http or https and ends with a slash', () => {
  assert.equal(
    cleanServerUrl('https://dev.example.com/prweb'),
    'https://dev.example.com/prweb/'
  );
  assert.equal(
    cleanServerUrl(' https://dev.example.com/prweb/ '),
    'https://dev.example.com/prweb/'
  );
  assert.equal(cleanServerUrl('javascript:alert(1)'), null);
  assert.equal(cleanServerUrl('ftp://host/'), null);
  assert.equal(cleanServerUrl('not a url'), null);
  assert.equal(cleanServerUrl(''), null);
});

test('an environment is accepted only with a name, a server, a ruleset and a two-digit version', () => {
  assert.equal(validateEnvironment(environment), null);
  assert.match(validateEnvironment({ ...environment, name: ' ' }), /needs a name/);
  assert.match(validateEnvironment({ ...environment, serverUrl: 'dev' }), /server URL/);
  assert.match(
    validateEnvironment({ ...environment, rulesetName: 'MyComponents; rm -rf /' }),
    /ruleset name/
  );
  assert.match(
    validateEnvironment({ ...environment, rulesetVersion: '1.1.1' }),
    /three two-digit parts/
  );
  assert.match(
    validateEnvironment({ ...environment, rulesetVersion: '01-01-1' }),
    /three two-digit parts/
  );
});

test('a connection needs a name, a known server type and a known grant type', () => {
  const connection = { name: 'Dev', serverType: 'infinity', grantType: 'clientCreds' };
  assert.equal(validateConnection(connection), null);
  assert.match(validateConnection({ ...connection, name: '' }), /needs a name/);
  assert.match(validateConnection({ ...connection, serverType: 'other' }), /Infinity or Launchpad/);
  assert.match(validateConnection({ ...connection, grantType: 'magic' }), /grant type/);
});

test('only a request from the hub page itself is accepted', () => {
  const host = 'localhost:6040';
  assert.equal(isSameOrigin({ headers: { host } }), true);
  assert.equal(isSameOrigin({ headers: { host, origin: 'http://localhost:6040' } }), true);
  assert.equal(isSameOrigin({ headers: { host, origin: 'https://evil.example.com' } }), false);
  assert.equal(isSameOrigin({ headers: { host, origin: 'http://localhost:9999' } }), false);
  assert.equal(isSameOrigin({ headers: { host, origin: 'null' } }), false);
});

const hubConfig = {
  servers: [
    {
      name: 'Dev',
      url: 'https://dev.example.com/prweb/',
      connection: 'Default',
      build: 'dev',
      rulesets: [
        { name: 'MyComponents', versions: ['01-01-01', '01-01-02'] },
        { name: 'MyApp', versions: ['02-00-00'], build: 'production' }
      ]
    },
    {
      name: 'Test',
      url: 'https://test.example.com/prweb/',
      rulesets: [{ name: 'MyComponents', version: '01-01-01' }]
    }
  ]
};

test('hub.config.json: every server, ruleset and version becomes a row', () => {
  const { rows, problems } = parseHubConfig(JSON.stringify(hubConfig));
  assert.deepEqual(problems, []);
  assert.deepEqual(
    rows.map(row => `${row.name} ${row.rulesetVersion}`),
    ['Dev MyComponents 01-01-01', 'Dev MyComponents 01-01-02', 'Dev MyApp 02-00-00', 'Test MyComponents 01-01-01']
  );
  assert.equal(rows[0].serverUrl, 'https://dev.example.com/prweb/');
  assert.equal(rows[0].serverName, 'Dev');
  assert.equal(rows[0].build, 'dev');
  assert.equal(rows[2].build, 'production', "a ruleset's own build wins over the server's");
  assert.equal(rows[3].rulesetVersion, '01-01-01', 'a single version may be written as version');
  assert.equal(rows[3].serverName, 'Test');
});

test('hub.config.json: notes, an empty list and a bad file are all handled', () => {
  assert.deepEqual(parseHubConfig('{"_about":"note","_example":{"name":"x"},"servers":[]}'), {
    rows: [],
    problems: []
  });
  assert.match(parseHubConfig('{ nope').problems[0], /not valid JSON/);
  assert.match(
    parseHubConfig('{"servers":[{"name":"A","url":"https://a/"}]}').problems[0],
    /at least one ruleset/
  );
  assert.match(
    parseHubConfig('{"servers":[{"name":"A","url":"https://a/","rulesets":[{"name":"R"}]}]}')
      .problems[0],
    /at least one version/
  );
});

test('a row becomes an environment: Development unless it says production, connection by name', () => {
  const connections = [
    { id: 'default', name: 'Default' },
    { id: 'test', name: 'Test' }
  ];
  const base = { name: 'N', serverUrl: 'https://s/', rulesetName: 'R', rulesetVersion: '01-01-01' };
  assert.equal(
    toEnvironment({ ...base, build: 'Dev', connection: 'default' }, connections).devBuild,
    true
  );
  assert.equal(
    toEnvironment({ ...base, build: 'Production', connection: 'Test' }, connections).devBuild,
    false
  );
  assert.equal(toEnvironment({ ...base, build: 'prod' }, connections).devBuild, false);
  assert.equal(toEnvironment({ ...base }, connections).devBuild, true);
  assert.equal(toEnvironment({ ...base, connection: 'TEST' }, connections).connectionId, 'test');
  assert.equal(
    toEnvironment({ ...base, connection: 'Missing' }, connections).connectionId,
    'default'
  );
});

test('the file environments are listed once, never written to the hub, and wrong rows are reported', () => {
  const connections = [{ id: 'default', name: 'Default' }];
  const withBadRow = JSON.parse(JSON.stringify(hubConfig));
  withBadRow.servers.push({
    name: 'QA',
    url: 'https://qa.example.com/prweb/',
    rulesets: [{ name: 'MyComponents', versions: ['3'] }]
  });
  // The hub already has the Test one, so the file's row for it is left out.
  const local = [
    {
      serverUrl: 'https://test.example.com/prweb/',
      rulesetName: 'MyComponents',
      rulesetVersion: '01-01-01'
    }
  ];
  const { environments, problems } = environmentsFromConfig(
    JSON.stringify(withBadRow),
    connections,
    local
  );
  assert.deepEqual(
    environments.map(env => `${env.name}|${env.rulesetVersion}`),
    ['Dev MyComponents|01-01-01', 'Dev MyComponents|01-01-02', 'Dev MyApp|02-00-00']
  );
  assert.ok(
    environments.every(
      env => env.source === 'file' && env.id.startsWith('file-') && env.file === 'hub.config.json'
    )
  );
  assert.equal(new Set(environments.map(env => env.id)).size, environments.length);
  assert.equal(environments.find(env => env.name === 'Dev MyApp').devBuild, false);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /three two-digit parts/);
  assert.deepEqual(
    environmentsFromConfig('', connections, []),
    { environments: [], problems: [] },
    'no file, nothing to list'
  );
});

const alive = pid => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test('a server with its own client ID gets a connection of its own, and the secret never leaves the server', () => {
  process.env.HUB_TEST_SECRET = 'from-the-environment';
  const text = JSON.stringify({
    servers: [
      {
        name: 'Dev',
        url: 'https://dev/prweb/',
        clientId: 'dev-id',
        clientSecret: 's3cret',
        rulesets: [{ name: 'A', versions: ['01-01-01'] }]
      },
      {
        name: 'Test',
        url: 'https://test/prweb/',
        clientId: 'test-id',
        clientSecret: 'env:HUB_TEST_SECRET',
        rulesets: [{ name: 'A', versions: ['01-01-01'] }]
      },
      {
        name: 'Copy',
        url: 'https://copy/prweb/',
        clientId: '<client id>',
        clientSecret: '<client secret>',
        rulesets: [{ name: 'A', versions: ['01-01-01'] }]
      },
      {
        name: 'Plain',
        url: 'https://plain/prweb/',
        connection: 'Default',
        rulesets: [{ name: 'A', versions: ['01-01-01'] }]
      }
    ]
  });
  const connections = connectionsFromHubConfig(text);
  // The sample's <placeholders> and a server without a client ID make no connection.
  assert.deepEqual(
    connections.map(entry => entry.name),
    ['Dev', 'Test']
  );
  assert.equal(connections[1].clientSecret, 'from-the-environment');
  // A row uses its own server's connection, whatever name it asks for; one without uses the named one.
  const rows = parseHubConfig(text).rows;
  const all = [{ id: 'default', name: 'Default' }, ...connections];
  assert.equal(toEnvironment(rows[0], all).connectionId, connections[0].id);
  assert.equal(toEnvironment(rows[3], all).connectionId, 'default');
  // What the page is given has no secret, only whether there is one.
  const shown = publicConnection(connections[0]);
  assert.equal('clientSecret' in shown, false);
  assert.equal(shown.hasSecret, true);
});

test('a version typed on the page is three two-digit parts, and nothing else', () => {
  for (const good of ['01-01-01', '00-00-00', '99-12-31', ' 01-02-03 ']) {
    assert.equal(isRulesetVersion(good), true, good);
  }
  for (const bad of [
    '',
    '1-1-1',
    '01-01',
    '01-01-01-01',
    '010101',
    '01.01.01',
    'ab-cd-ef',
    undefined,
    null,
    '01-01-0a'
  ]) {
    assert.equal(isRulesetVersion(bad), false, String(bad));
  }
});

test('the typed version replaces the one the environment was listed with, and the rest is kept', () => {
  const typed = withVersion(environment, '01-05-09');
  assert.equal(typed.rulesetVersion, '01-05-09');
  assert.equal(typed.rulesetName, environment.rulesetName);
  assert.equal(typed.serverUrl, environment.serverUrl);
  // The environment itself is not changed, so the next request starts from what the file listed.
  assert.equal(environment.rulesetVersion, '01-01-01');
  assert.equal(withVersion(environment, ' 02-00-00 ').rulesetVersion, '02-00-00');
  assert.equal(withVersion(environment, undefined), environment);
  assert.equal(withVersion(undefined, '01-01-01'), undefined);
});

test('a publish is sent to Pega under the typed version, not a listed one', () => {
  const { args, error } = buildCliArgs('publish', {
    component: 'Acme_Team_Accordion',
    environment: withVersion(environment, '01-05-09')
  });
  assert.equal(error, undefined);
  assert.ok(args.includes('01-05-09'));
  assert.ok(!args.includes('01-01-01'));
  const all = buildCliArgs('publishAll', { environment: withVersion(environment, '01-05-09') });
  assert.ok(all.args.includes('01-05-09'));
});

test('Stop ends the run and the processes it started, not only the first', async () => {
  // A child that starts a long-running child of its own and prints its pid, as the CLI does with its bundler.
  const child = spawn(
    process.execPath,
    [
      '-e',
      "const c = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']); console.log(c.pid); setInterval(() => {}, 1000);"
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] }
  );
  const grandchildPid = await new Promise(resolve =>
    child.stdout.once('data', chunk => resolve(Number(String(chunk).trim())))
  );
  assert.ok(alive(child.pid) && alive(grandchildPid));
  stopProcess(child);
  await new Promise(resolve => child.once('close', resolve));
  // The tree is ended as one on Windows (taskkill /t); elsewhere the signal reaches the first process, so only that is checked.
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.equal(alive(child.pid), false);
  if (process.platform === 'win32') assert.equal(alive(grandchildPid), false);
  else process.kill(grandchildPid);
});

test('a locked ruleset is recognised from the words of the output, and an ordinary line is not', () => {
  assert.equal(mentionsLockedRuleset('Error: RuleSet version MyComponents:01-01-01 is locked'), true);
  assert.equal(mentionsLockedRuleset('The ruleset is locked, unlock it first'), true);
  assert.equal(mentionsLockedRuleset('Cannot save: locked ruleset MyComponents 01-01-01'), true);
  assert.equal(
    mentionsLockedRuleset('Publish component Accordion to ruleset MyComponents 01-01-01'),
    false
  );
  assert.equal(mentionsLockedRuleset('a locked door'), false);
  assert.equal(mentionsLockedRuleset(''), false);
  assert.equal(mentionsLockedRuleset(undefined), false);
});

test('an invalid ruleset version is told apart from a locked one', () => {
  const invalid =
    'Error: Error: Error: \nInvalid Ruleset version: Please provide correct unlocked ruleset version';
  assert.equal(rulesetProblemIn(invalid), 'invalid');
  assert.equal(mentionsLockedRuleset(invalid), false, '"unlocked" is not "locked"');
  assert.equal(rulesetProblemIn('Error: RuleSet version MyComponents:01-01-01 is locked'), 'locked');
  assert.equal(rulesetProblemIn('Publish component Accordion'), null);
});

test('a failed sign-in is recognised from the output of the sign-in', () => {
  const failed =
    'Authenticating to server: https://x/prweb/\n\nError: Token endpoint error.\nAuthentication failed:Error: Token endpoint error.\nAuthentication failed:false';
  assert.equal(runProblemIn(failed), 'auth');
  assert.equal(runProblemIn('Error: RuleSet version MyComponents:01-01-01 is locked'), 'locked');
  assert.equal(
    runProblemIn('Invalid Ruleset version: Please provide correct unlocked ruleset version'),
    'invalid'
  );
  assert.equal(runProblemIn('Authentication successful'), null);
});

test('a Pega server that is not running is told apart from one that answers', async () => {
  const { createServer } = await import('node:http');
  const up = createServer((req, res) => res.writeHead(401).end('login'));
  const gateway = createServer((req, res) => res.writeHead(503).end('down'));
  await Promise.all(
    [up, gateway].map(server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve)))
  );
  const urlOf = server => `http://127.0.0.1:${server.address().port}/prweb/`;
  assert.equal(await serverResponds(urlOf(up), 2000), true, 'a 401 means it is running');
  assert.equal(
    await serverResponds(urlOf(gateway), 2000),
    false,
    'a gateway error means it is not'
  );
  const closedUrl = urlOf(up);
  up.closeAllConnections();
  await new Promise(resolve => up.close(resolve));
  assert.equal(
    await serverResponds(closedUrl, 2000),
    false,
    'nothing listening means it is not running'
  );
  gateway.closeAllConnections();
  await new Promise(resolve => gateway.close(resolve));
});

// ── Publish, republish or a new version ─────────────────────────────────────────────────────────────────────────────
const target = {
  server: 'dev.example.com',
  ruleset: 'MyComponents_WIP',
  version: '01-01-01',
  component: 'Acme_Team_Accordion'
};

test('a component that was never published to a server is a first publish', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-history-'));
  try {
    assert.deepEqual(classifyPublish(target, join(dir, 'h.json')), {
      kind: 'publish',
      lastAt: null
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the same ruleset and version again is a republish, with when it was last published', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-history-'));
  const file = join(dir, 'h.json');
  try {
    recordPublish({ ...target, components: [target.component] }, file);
    const result = classifyPublish(target, file);
    assert.equal(result.kind, 'republish');
    assert.match(result.lastAt, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the same component under another version, or ruleset, is a new version, not a republish', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-history-'));
  const file = join(dir, 'h.json');
  try {
    recordPublish({ ...target, components: [target.component] }, file);
    assert.equal(classifyPublish({ ...target, version: '01-01-02' }, file).kind, 'newVersion');
    assert.equal(classifyPublish({ ...target, ruleset: 'Other_Rules' }, file).kind, 'newVersion');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('another server, or another component, is a first publish', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-history-'));
  const file = join(dir, 'h.json');
  try {
    recordPublish({ ...target, components: [target.component] }, file);
    assert.equal(
      classifyPublish({ ...target, server: 'test.example.com' }, file).kind,
      'publish'
    );
    assert.equal(
      classifyPublish({ ...target, component: 'Acme_Team_SearchBoard' }, file).kind,
      'publish'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('publish all is a republish when anything already went to that ruleset and version, and publishing twice counts twice', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-history-'));
  const file = join(dir, 'h.json');
  try {
    assert.equal(classifyPublish({ ...target, component: null }, file).kind, 'publish');
    recordPublish({ ...target, components: ['A', 'B'] }, file);
    recordPublish({ ...target, components: ['A'] }, file);
    assert.equal(classifyPublish({ ...target, component: null }, file).kind, 'republish');
    assert.equal(JSON.parse(readFileSync(file, 'utf8'))[target.server].A[0].count, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a history file that is not readable is treated as no history, and saving never throws', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-history-'));
  const file = join(dir, 'h.json');
  try {
    writeFileSync(file, '{ not json');
    assert.equal(classifyPublish(target, file).kind, 'publish');
    assert.doesNotThrow(() =>
      recordPublish({ ...target, components: ['A'] }, join(dir, 'missing', 'h.json'))
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Publish several: the queue that publishes components one after another (web/js/queue.js, no page code in it) ──

const wentThrough = { ok: true, stopped: false, issue: null };
const failedAs = issue => ({ ok: false, stopped: false, issue: issue ?? null });
const label = name => name.toUpperCase();

test('the queue publishes the components in the order given, one at a time', async () => {
  const order = [];
  let active = 0;
  let mostAtOnce = 0;
  const result = await runQueue(['A', 'B', 'C'], async name => {
    active += 1;
    mostAtOnce = Math.max(mostAtOnce, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    order.push(name);
    active -= 1;
    return wentThrough;
  });
  assert.deepEqual(order, ['A', 'B', 'C']);
  // The server runs one action at a time, so the next must never start before the last has ended.
  assert.equal(mostAtOnce, 1);
  assert.deepEqual(result, { published: ['A', 'B', 'C'], failed: [], notRun: [], ended: 'done' });
});

test('the queue stops at the first component that fails, unless told to keep going', async () => {
  const started = [];
  const run = async name => {
    started.push(name);
    return name === 'B' ? failedAs() : wentThrough;
  };
  const stopping = await runQueue(['A', 'B', 'C'], run);
  assert.deepEqual(started, ['A', 'B']);
  assert.deepEqual(stopping, { published: ['A'], failed: ['B'], notRun: ['C'], ended: 'failed' });

  started.length = 0;
  const carryOn = await runQueue(['A', 'B', 'C'], run, { keepGoing: true });
  assert.deepEqual(started, ['A', 'B', 'C']);
  assert.deepEqual(carryOn, { published: ['A', 'C'], failed: ['B'], notRun: [], ended: 'done' });
});

test('a problem with the target ends the queue even when it keeps going, as the next one would meet the same problem', async () => {
  for (const issue of ['auth', 'locked', 'invalid']) {
    const started = [];
    const result = await runQueue(
      ['A', 'B', 'C'],
      async name => {
        started.push(name);
        return failedAs(issue);
      },
      { keepGoing: true }
    );
    assert.deepEqual(started, ['A'], issue);
    assert.deepEqual(result, { published: [], failed: ['A'], notRun: ['B', 'C'], ended: 'target' });
  }
});

test('stopping while a component runs ends the queue, and that component is not counted as failed', async () => {
  const result = await runQueue(['A', 'B', 'C'], async name =>
    name === 'B' ? { ok: false, stopped: true, issue: null } : wentThrough
  );
  assert.deepEqual(result, { published: ['A'], failed: [], notRun: ['B', 'C'], ended: 'stopped' });
});

test('a queue that is cancelled between two components does not start the next one', async () => {
  let cancelled = false;
  const started = [];
  const result = await runQueue(
    ['A', 'B', 'C'],
    async name => {
      started.push(name);
      // The person pressed Stop in the moment after A ended.
      cancelled = true;
      return wentThrough;
    },
    { isCancelled: () => cancelled }
  );
  assert.deepEqual(started, ['A']);
  assert.deepEqual(result, { published: ['A'], failed: [], notRun: ['B', 'C'], ended: 'stopped' });
});

test('a component that throws is a failure, and the queue does not crash', async () => {
  const result = await runQueue(['A', 'B'], async name => {
    if (name === 'A') throw new Error('could not start');
    return wentThrough;
  });
  assert.deepEqual(result, { published: [], failed: ['A'], notRun: ['B'], ended: 'failed' });
});

test('the queue reports which component it is on before each one starts', async () => {
  const seen = [];
  await runQueue(['A', 'B'], async () => wentThrough, { onProgress: step => seen.push(step) });
  assert.deepEqual(seen, [
    { index: 0, total: 2, item: 'A' },
    { index: 1, total: 2, item: 'B' }
  ]);
});

test('an empty queue does nothing and is done', async () => {
  assert.deepEqual(await runQueue([], async () => wentThrough), {
    published: [],
    failed: [],
    notRun: [],
    ended: 'done'
  });
});

test('the summary says what went through, what failed and what did not run', () => {
  assert.equal(
    queueSummary({ published: ['a', 'b', 'c'], failed: [], notRun: [], ended: 'done' }, label),
    'Published all 3 components'
  );
  assert.equal(
    queueSummary({ published: ['a'], failed: [], notRun: [], ended: 'done' }, label),
    'Published A'
  );
  assert.equal(
    queueSummary({ published: ['a'], failed: ['b'], notRun: ['c'], ended: 'failed' }, label),
    'Published 1 of 3. B failed. 1 not run'
  );
  assert.equal(
    queueSummary({ published: ['a'], failed: [], notRun: ['b', 'c'], ended: 'stopped' }, label),
    'Published 1 of 3. Stopped. 2 not run'
  );
});

import { readNamePrefix } from '../src/api/hub-config.mjs';
import { commonNamePrefix } from '../src/api/components.mjs';
import { setNamePrefix, shortName } from '../src/web/js/util.js';

test('namePrefix is read from hub.config.json, and is empty when missing or the file is wrong', () => {
  assert.equal(readNamePrefix('{"namePrefix":" Acme_Team_ ","servers":[]}'), 'Acme_Team_');
  assert.equal(readNamePrefix('{"servers":[]}'), '');
  assert.equal(readNamePrefix('{"namePrefix":5}'), '');
  assert.equal(readNamePrefix('not json'), '');
});

test('the shared prefix is what every component starts with, up to its last underscore', () => {
  assert.equal(commonNamePrefix(['Acme_Team_Table', 'Acme_Team_Card']), 'Acme_Team_');
  assert.equal(commonNamePrefix(['Acme_Team_Table', 'Acme_Other_Card']), 'Acme_');
  assert.equal(commonNamePrefix(['Table', 'Card']), '');
  assert.equal(commonNamePrefix(['Acme_Team_Table']), '', 'one component is never shortened');
  assert.equal(commonNamePrefix([]), '');
});

test('shortName drops the prefix it was told and spaces the words', () => {
  setNamePrefix('Acme_Team_');
  assert.equal(shortName('Acme_Team_ServerPaginatedTable'), 'Server Paginated Table');
  assert.equal(shortName('Other_Thing'), 'Other Thing');
  assert.equal(shortName('Acme_Team_'), 'Acme Team', 'a name that is only the prefix is left whole');
  setNamePrefix('');
  assert.equal(shortName('Acme_Team_Table'), 'Acme Team Table');
});

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/dx-hub.mjs', import.meta.url));
const dxHub = (cwd, ...args) =>
  spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', env: { ...process.env, DX_HUB_ROOT: cwd } });

test('eject copies the hub into the project, and the copy can be imported on its own', async () => {
  const project = mkdtempSync(join(tmpdir(), 'dxhub-eject-'));
  try {
    writeFileSync(join(project, 'package.json'), '{"name":"p"}');
    const run = dxHub(project, 'eject');
    assert.equal(run.status, 0, run.stderr);
    for (const file of ['server.mjs', 'vite-plugin.mjs', 'README.md', 'api/index.mjs', 'web/index.html'])
      assert.ok(existsSync(join(project, 'tools/dx-hub', file)), `${file} was copied`);
    assert.ok(existsSync(join(project, 'hub.config.sample.json')), 'the sample config was added');
    assert.match(readFileSync(join(project, '.gitignore'), 'utf8'), /\.dx-hub\//);
    assert.match(run.stdout, /import \{ dxHub \} from '\.\.\/tools\/dx-hub\/vite-plugin\.mjs'/);
    assert.match(run.stdout, /"hub": "node tools\/dx-hub\/server\.mjs"/);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('eject will not overwrite a folder that has files, unless told to', () => {
  const project = mkdtempSync(join(tmpdir(), 'dxhub-eject-'));
  try {
    writeFileSync(join(project, 'package.json'), '{"name":"p"}');
    assert.equal(dxHub(project, 'eject').status, 0);
    const again = dxHub(project, 'eject');
    assert.equal(again.status, 1);
    assert.match(again.stderr, /not empty/);
    assert.equal(dxHub(project, 'eject', '--force').status, 0);
    assert.equal(dxHub(project, 'eject', 'vendor/hub').status, 0, 'another folder is fine');
    assert.ok(existsSync(join(project, 'vendor/hub/server.mjs')));
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('eject refuses a folder outside the project, and a folder that is not a project', () => {
  const project = mkdtempSync(join(tmpdir(), 'dxhub-eject-'));
  try {
    writeFileSync(join(project, 'package.json'), '{"name":"p"}');
    const outside = dxHub(project, 'eject', '../elsewhere');
    assert.equal(outside.status, 1);
    assert.match(outside.stderr, /inside your project/);
    assert.equal(existsSync(join(project, '..', 'elsewhere')), false);
    const empty = mkdtempSync(join(tmpdir(), 'dxhub-noproject-'));
    try {
      const run = dxHub(empty, 'eject');
      assert.equal(run.status, 1);
      assert.match(run.stderr, /No package\.json/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('--help and --version answer at once and do not start the server', () => {
  const project = mkdtempSync(join(tmpdir(), 'dxhub-help-'));
  try {
    writeFileSync(join(project, 'package.json'), '{"name":"p"}');
    for (const flagName of ['--help', '-h']) {
      const run = spawnSync(process.execPath, [bin, flagName], { cwd: project, encoding: 'utf8', timeout: 8000 });
      assert.equal(run.status, 0, `${flagName} should exit by itself`);
      assert.match(run.stdout, /Usage: dx-hub/);
    }
    const version = spawnSync(process.execPath, [bin, '--version'], { cwd: project, encoding: 'utf8', timeout: 8000 });
    assert.equal(version.status, 0);
    assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+/);
    const unknown = spawnSync(process.execPath, [bin, 'nonsense'], { cwd: project, encoding: 'utf8', timeout: 8000 });
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /Unknown command: nonsense/);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
