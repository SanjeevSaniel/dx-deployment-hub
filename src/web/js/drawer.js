// The slide-over used to add or edit an environment or a connection: a title, fields, a Save that runs the caller's code, and an optional
// button on the left (Remove). An error from Save is shown in the drawer, not as a message that disappears.
import { $, h } from './util.js';

let saveHandler = null;
// Whether the form as it stands may be saved; the caller's checks set it, and Save follows it.
let canSave = true;

export function setCanSave(value) {
  canSave = value;
  $('drawerSave').disabled = !value;
}

/** What the Save button says; it is "Save" again each time the slide-over is closed. */
export const setSaveLabel = text => {
  $('drawerSave').textContent = text;
};

export function openDrawer(title, fields, onSave, leftButton) {
  $('drawerTitle').textContent = title;
  $('drawerBody').replaceChildren(...fields);
  $('drawerLeft').replaceChildren(leftButton || '');
  saveHandler = onSave;
  setCanSave(true);
  $('drawer').classList.add('open');
  $('scrim').classList.add('open');
  $('drawer').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('drawerBody').querySelector('input, select')?.focus(), 60);
}

export function closeDrawer() {
  setSaveLabel('Save');
  $('drawer').classList.remove('open');
  $('scrim').classList.remove('open');
  $('drawer').setAttribute('aria-hidden', 'true');
  saveHandler = null;
}

const showFormError = message => {
  $('drawerBody').querySelector('.form-error')?.remove();
  if (message) $('drawerBody').prepend(h('div', { class: 'form-error', role: 'alert' }, message));
};

/** A heading that groups the fields under it. */
export const section = title => h('div', { class: 'form-section' }, title);

/**
 * Checks a field as it is typed in: its border goes green or red, and a red sentence says what is wrong, once the person has typed in it (an
 * empty new form does not start out red). The real checks are the server's; these only say so sooner. Returns { valid } for the caller to gate Save.
 */
export function liveCheck(control, test, message, onChange) {
  let touched = false;
  const valid = () => test(control.value);
  const show = () => {
    const ok = valid();
    control.classList.toggle('is-ok', touched && ok);
    control.classList.toggle('is-bad', touched && !ok);
    const holder = control.closest('.field');
    let note = holder?.querySelector('.field-msg');
    if (touched && !ok) {
      if (!note) {
        note = h('div', { class: 'field-msg', role: 'alert' });
        holder?.append(note);
      }
      note.textContent = message;
    } else {
      note?.remove();
    }
  };
  control.addEventListener('input', () => {
    touched = true;
    show();
    onChange?.();
  });
  control.addEventListener('blur', () => {
    if (control.value !== '') {
      touched = true;
      show();
    }
  });
  return { valid };
}

/** A labelled form field, with an optional hint under it. */
export const field = (label, control, hint) =>
  h(
    'div',
    { class: 'field' },
    h('label', {}, label),
    control,
    hint ? h('div', { class: 'hint' }, hint) : ''
  );

export const input = (value, attrs) => h('input', { class: 'input', value: value ?? '', ...attrs });

export function initDrawer() {
  $('drawerClose').addEventListener('click', closeDrawer);
  $('drawerCancel').addEventListener('click', closeDrawer);
  $('scrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDrawer();
  });
  $('drawerSave').addEventListener('click', async () => {
    if (!saveHandler) return;
    $('drawerSave').disabled = true;
    try {
      await saveHandler();
    } catch (err) {
      showFormError(err.message);
    }
    $('drawerSave').disabled = !canSave;
  });
}
