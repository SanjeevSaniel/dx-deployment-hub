// The Connections tab: how the hub signs in to a server. The client secret is typed in and stored by the server; it is never shown again.
import { api } from './api.js';
import { closeDrawer, field, input, liveCheck, openDrawer, section, setCanSave } from './drawer.js';
import { reload } from './reload.js';
import { state } from './state.js';
import { $, h, toast } from './util.js';

export function renderConnections() {
  $('connBody').replaceChildren(
    ...state.connections.map(conn => {
      // Counted in rulesets, which is what a person thinks in: a ruleset with two versions is still one ruleset.
      const rulesets = [
        ...new Set(
          state.environments.filter(env => env.connectionId === conn.id).map(env => env.rulesetName)
        )
      ];
      const used = rulesets.length;
      return h(
        'tr',
        {},
        h('td', {}, h('div', { class: 'cell-main' }, conn.name)),
        h('td', {}, conn.serverType === 'launchpad' ? 'Launchpad' : 'Infinity'),
        h('td', { class: 'mono' }, conn.grantType),
        h('td', { class: 'mono' }, conn.clientId || '—'),
        h(
          'td',
          {},
          h(
            'span',
            { class: 'badge ' + (conn.hasSecret ? 'green' : 'amber') },
            conn.hasSecret ? 'Saved' : 'Not set'
          )
        ),
        h(
          'td',
          { title: rulesets.join(', ') },
          used ? used + (used === 1 ? ' ruleset' : ' rulesets') : '—'
        ),
        h(
          'td',
          { class: 'end' },
          // A connection from hub.config.json is edited in that file, so there is nothing to edit here.
          conn.source === 'file'
            ? h('span', { class: 'badge', title: 'Edit it in hub.config.json' }, 'hub.config.json')
            : h('button', { class: 'btn btn-sm', onclick: () => editConnection(conn) }, 'Edit')
        )
      );
    })
  );
}

function editConnection(conn) {
  const isNew = !conn;
  const draft = { serverType: 'infinity', grantType: 'clientCreds', ...(conn || {}) };
  const name = input(draft.name, { placeholder: 'e.g. Dev server' });
  const type = h(
    'select',
    { class: 'input' },
    h('option', { value: 'infinity' }, 'Infinity'),
    h('option', { value: 'launchpad' }, 'Launchpad')
  );
  type.value = draft.serverType;
  const grant = h(
    'select',
    { class: 'input' },
    h('option', { value: 'clientCreds' }, 'clientCreds (service)'),
    h('option', { value: 'passwordCreds' }, 'passwordCreds (user and password)'),
    h('option', { value: 'authCode' }, 'authCode (browser sign-in)')
  );
  grant.value = draft.grantType;
  const clientId = input(draft.clientId, { placeholder: 'OAuth client ID', autocomplete: 'off' });
  const secret = input('', {
    type: 'password',
    placeholder: draft.hasSecret ? 'Saved. Leave blank to keep it.' : 'OAuth client secret',
    autocomplete: 'new-password'
  });
  const remove =
    isNew || state.connections.length < 2
      ? null
      : h(
          'button',
          {
            class: 'btn btn-danger',
            onclick: async () => {
              if (
                !confirm(
                  'Remove "' + draft.name + '"? Environments using it move to another connection.'
                )
              )
                return;
              await api('/api/connections', {
                connections: state.connections.filter(c => c.id !== draft.id)
              });
              closeDrawer();
              await reload();
              toast('Connection removed');
            }
          },
          'Remove'
        );
  openDrawer(
    isNew ? 'Add connection' : 'Edit connection',
    [
      section('The server'),
      field('Name', name),
      h('div', { class: 'row' }, field('Server type', type), field('Grant type', grant)),
      section('Credentials'),
      field('Client ID', clientId),
      field(
        'Client secret',
        secret,
        'Stored on this machine only, in a file git ignores. It is never shown again.'
      )
    ],
    async () => {
      const entry = {
        id: draft.id,
        name: name.value,
        serverType: type.value,
        grantType: grant.value,
        clientId: clientId.value,
        clientSecret: secret.value
      };
      const list = isNew
        ? [...state.connections, entry]
        : state.connections.map(c => (c.id === draft.id ? entry : c));
      await api('/api/connections', { connections: list });
      closeDrawer();
      await reload();
      toast('Connection saved');
    },
    remove
  );
  // A connection needs a name; Save waits for one.
  const nameCheck = liveCheck(
    name,
    value => value.trim() !== '',
    'Give it a name.',
    () => setCanSave(nameCheck.valid())
  );
  setCanSave(nameCheck.valid());
}

export function initConnections() {
  $('addConn').addEventListener('click', () => editConnection(null));
}
