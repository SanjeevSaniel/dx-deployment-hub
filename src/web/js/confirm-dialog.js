// The question before something that cannot be taken back (a publish to a server, stopping one half way). A <dialog> opened with showModal() is
// used instead of window.confirm so the question can say what is about to happen (where, how many, which) in the page's own look, and because
// the browser gives it Escape, focus trapping and a backdrop for free.
import { h } from './util.js';

const SHIELD =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M12 8v5M12 16.5v.01"/></svg>';

let counter = 0;

/**
 * Asks and answers true (confirmed) or false (cancelled, Escape, or a click outside).
 *   title    the question, short
 *   lead     one sentence under it that says where it goes
 *   items    what is affected, shown as chips (kept short: the rest is summarised as "+ n more")
 *   note     a quieter line for what happens next or what cannot be undone
 *   confirm  the label of the main button; `danger` turns it red (stopping a publish)
 */
export function confirmDialog({ title, lead, items = [], note, confirm = 'Continue', danger = false }) {
  return new Promise(resolve => {
    const id = 'dlg-' + ++counter;
    const dialog = h('dialog', { class: 'dlg' + (danger ? ' is-danger' : ''), 'aria-labelledby': id });
    const icon = h('span', { class: 'dlg-icon' });
    icon.innerHTML = SHIELD;

    const shown = items.slice(0, 8);
    const chips = shown.length
      ? h(
          'div',
          { class: 'dlg-chips' },
          ...shown.map(name => h('span', { class: 'dlg-chip' }, name)),
          items.length > shown.length
            ? h('span', { class: 'dlg-chip is-more' }, '+ ' + (items.length - shown.length) + ' more')
            : ''
        )
      : '';

    const ok = h('button', { class: 'btn ' + (danger ? 'btn-stop-now' : 'btn-primary'), type: 'submit', value: 'ok' }, confirm);
    const cancel = h('button', { class: 'btn btn-ghost', type: 'submit', value: 'cancel', formnovalidate: true }, 'Cancel');
    dialog.append(
      h(
        'form',
        { method: 'dialog' },
        h('div', { class: 'dlg-head' }, icon, h('h2', { id }, title)),
        lead ? h('p', { class: 'dlg-lead' }, lead) : '',
        chips,
        note ? h('p', { class: 'dlg-note' }, note) : '',
        h('div', { class: 'dlg-foot' }, cancel, ok)
      )
    );

    // A click on the backdrop lands on the dialog element itself, not on anything inside it.
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close('cancel');
    });
    dialog.addEventListener('close', () => {
      const answer = dialog.returnValue === 'ok';
      dialog.remove();
      resolve(answer);
    });
    document.body.append(dialog);
    dialog.showModal();
    // The safe choice has the focus when the question is about stopping; otherwise the main action does, so Enter confirms.
    (danger ? cancel : ok).focus();
  });
}
