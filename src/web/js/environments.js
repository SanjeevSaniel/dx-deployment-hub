// The Environments tab: where builds go. The ones from hub.config.json are read from the file and can only be copied, never changed here; the
// hub's own can be added, edited, duplicated and removed.
import { api } from './api.js';
import { closeDrawer, field, input, liveCheck, openDrawer, section, setCanSave } from './drawer.js';
import { reload } from './reload.js';
import { connectionOf, signInState, state } from './state.js';
import { $, h, hostOf, toast } from './util.js';

/** The ones from hub.config.json are never saved by the hub, so only the hub's own are sent back. */
const ownEnvironments = () => state.environments.filter(env => env.source !== 'file');

const NO_FILE_HINT =
  'To list your servers, rulesets and versions in a file, copy hub.config.sample.json to hub.config.json (both in the project folder, beside tasks.config.json) and edit it. Git ignores that file.';

export function renderEnvironments() {
  const problems = state.notesProblems || [];
  const bar = $('notesProblems');
  // Without the file there is nothing to read, so the page says how to start: the sample is copied, as with tasks.config.json.
  const noFile = !state.hubConfigFound;
  bar.hidden = problems.length === 0 && !noFile;
  bar.classList.toggle('is-info', problems.length === 0 && noFile);
  bar.textContent = problems.length
    ? 'hub.config.json: ' +
      problems[0] +
      (problems.length > 1 ? ' (+' + (problems.length - 1) + ' more)' : '')
    : noFile
      ? NO_FILE_HINT
      : '';
  $('envEmpty').hidden = state.environments.length > 0;
  if (state.hubConfigPath) $('envFilePath').textContent = state.hubConfigPath;
  $('envBody').replaceChildren(
    ...state.environments.map(env => {
      const conn = connectionOf(env);
      const sign = signInState(env);
      const source =
        env.source === 'file'
          ? h(
              'span',
              {
                class: 'badge',
                title:
                  'Read from ' +
                  (env.file || 'hub.config.json') +
                  ' in the project folder. Change it there, or use Edit a copy.'
              },
              env.file || 'hub.config.json'
            )
          : h(
              'span',
              { class: 'badge', title: 'Added in this page and saved on this computer only' },
              'Local'
            );
      return h(
        'tr',
        {},
        h(
          'td',
          {},
          h(
            'div',
            { class: 'cell-main' },
            h('span', { class: 'dot ' + (sign.ok ? 'ok' : '') }),
            env.name,
            source
          )
        ),
        h('td', { class: 'mono' }, hostOf(env.serverUrl) || '—'),
        h('td', { class: 'mono' }, env.rulesetName),
        h('td', { class: 'mono' }, env.rulesetVersion),
        h(
          'td',
          {},
          h(
            'span',
            { class: 'badge ' + (env.devBuild ? 'blue' : 'green') },
            env.devBuild ? 'Development' : 'Production'
          )
        ),
        h('td', {}, conn ? conn.name : '—'),
        h(
          'td',
          { class: 'end' },
          env.source === 'file'
            ? h(
                'button',
                {
                  class: 'btn btn-sm',
                  onclick: () => editEnvironment({ ...env, id: '', source: undefined }),
                  title:
                    'Make your own copy that you can change here; hub.config.json stays as it is'
                },
                'Edit a copy'
              )
            : [
                h('button', { class: 'btn btn-sm', onclick: () => editEnvironment(env) }, 'Edit'),
                ' ',
                h(
                  'button',
                  {
                    class: 'btn btn-sm btn-ghost',
                    onclick: () => editEnvironment({ ...env, id: '', name: env.name + ' copy' }),
                    title: 'Duplicate, for another ruleset or version'
                  },
                  'Duplicate'
                )
              ]
        )
      );
    })
  );
}

function editEnvironment(env) {
  const isNew = !env || !env.id;
  const draft = {
    devBuild: true,
    connectionId: state.connections[0]?.id,
    rulesetVersion: '01-01-01',
    ...(env || {})
  };
  const name = input(draft.name, { placeholder: 'e.g. MyComponents Dev' });
  const url = input(draft.serverUrl, { placeholder: 'https://your-pega-server/prweb/' });
  const ruleset = input(draft.rulesetName, { placeholder: 'MyComponents' });
  const version = input(draft.rulesetVersion, { placeholder: '01-01-01', class: 'input mono' });
  const conn = h(
    'select',
    { class: 'input' },
    state.connections.map(c => h('option', { value: c.id }, c.name))
  );
  conn.value = draft.connectionId;
  const dev = h(
    'button',
    { type: 'button', 'aria-pressed': String(draft.devBuild) },
    'Development'
  );
  const prod = h(
    'button',
    { type: 'button', 'aria-pressed': String(!draft.devBuild) },
    'Production'
  );
  const pick = value => {
    draft.devBuild = value;
    dev.setAttribute('aria-pressed', String(value));
    prod.setAttribute('aria-pressed', String(!value));
  };
  dev.addEventListener('click', () => pick(true));
  prod.addEventListener('click', () => pick(false));
  const remove = isNew
    ? null
    : h(
        'button',
        {
          class: 'btn btn-danger',
          onclick: async () => {
            if (!confirm('Remove "' + draft.name + '"?')) return;
            await api('/api/environments', {
              environments: ownEnvironments().filter(e => e.id !== draft.id)
            });
            closeDrawer();
            await reload();
            toast('Environment removed');
          }
        },
        'Remove'
      );
  openDrawer(
    isNew ? 'Add environment' : 'Edit environment',
    [
      section('Where it goes'),
      field('Name', name, 'How it appears in the list.'),
      field('Server URL', url),
      h(
        'div',
        { class: 'row' },
        field('Ruleset', ruleset),
        field('Version', version, 'Three two-digit parts.')
      ),
      section('How it is built'),
      field(
        'Build',
        h('div', { class: 'segmented' }, dev, prod),
        'Development keeps source maps and builds faster.'
      ),
      section('How it signs in'),
      field('Connection', conn, 'How the hub signs in to this server.'),
      h(
        'div',
        { class: 'note' },
        'To publish to another ruleset or version on the same server, use Duplicate and change them.'
      )
    ],
    async () => {
      const entry = {
        id: draft.id,
        name: name.value,
        serverUrl: url.value,
        rulesetName: ruleset.value,
        rulesetVersion: version.value,
        devBuild: draft.devBuild,
        connectionId: conn.value
      };
      const list = isNew
        ? [...ownEnvironments(), entry]
        : ownEnvironments().map(e => (e.id === draft.id ? entry : e));
      await api('/api/environments', { environments: list });
      closeDrawer();
      await reload();
      toast('Environment saved');
    },
    remove
  );

  // Dashes go in as the version is typed (010101 becomes 01-01-01), and each field says what is wrong with it as soon as it is. Save waits until
  // all four are right. The server checks the same things when it saves.
  version.addEventListener('input', () => {
    const digits = version.value.replace(/\D/g, '').slice(0, 6);
    version.value = digits.replace(/(\d{2})(?=\d)/g, '$1-');
  });
  const update = () => setCanSave(checks.every(check => check.valid()));
  const checks = [
    liveCheck(name, value => value.trim() !== '', 'Give it a name.', update),
    liveCheck(
      url,
      value => /^https?:\/\/\S+$/i.test(value.trim()),
      'Start with https:// (or http://).',
      update
    ),
    liveCheck(
      ruleset,
      value => /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value),
      'Letters, numbers and underscores, starting with a letter.',
      update
    ),
    liveCheck(
      version,
      value => /^\d{2}-\d{2}-\d{2}$/.test(value),
      'Three two-digit parts, like 01-01-01.',
      update
    )
  ];
  update();
}

export function initEnvironments() {
  $('addEnv').addEventListener('click', () => editEnvironment(null));
  $('copyEnvFile').addEventListener('click', () => {
    navigator.clipboard.writeText($('envFilePath').textContent).then(
      () => toast('Path copied'),
      () => toast('Could not copy the path', 'error')
    );
  });
}
