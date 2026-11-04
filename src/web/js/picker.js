// A picker stands in for a <select>: a button that shows the chosen option, and a list under it to choose from, with a search box when the list is
// long. The <select> stays in the page, hidden, as the source of truth (its options, its value, whether it is disabled), so the rest of the code
// does not change: choosing writes the select's value and fires "change", and refreshPickers() redraws the buttons after the code has changed
// a select. The list is attached to the page body, not the card, because the cards clip what overflows them.
import { h } from './util.js';

const pickers = [];
let openPicker = null;

const CARET = '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';

/**
 * Replaces a select's look with a picker.
 *  label  what a screen reader calls the button
 *  search a search box in the list (for a long one)
 *  short  turns an option's text into the shorter text shown on the button (the full text stays in the list and the tooltip)
 *  mono   the version style: a monospace face
 */
export function enhanceSelect(
  select,
  { label, search = false, short = text => text, mono = false } = {}
) {
  const text = h('span', { class: 'pick-text' });
  const caret = h('span', { class: 'pick-caret', 'aria-hidden': 'true' });
  caret.innerHTML = CARET;
  const button = h(
    'button',
    {
      class: 'pick-btn' + (mono ? ' mono' : ''),
      type: 'button',
      id: select.id + 'Pick',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
      'aria-label': label
    },
    text,
    caret
  );
  const wrap = h('div', { class: 'pick' }, button);
  select.before(wrap);
  select.classList.add('pick-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  // A label that pointed at the select now points at the button, so clicking it opens the list.
  const own = document.querySelector('label[for="' + select.id + '"]');
  if (own) own.htmlFor = button.id;

  const options = () =>
    [...select.options]
      .filter(option => option.value !== '')
      .map(option => ({ value: option.value, text: option.textContent }));
  const selected = () => options().find(option => option.value === select.value);

  const picker = {
    refresh() {
      const current = selected();
      text.textContent = current ? short(current.text) : options().length ? 'Choose' : 'None';
      button.title = current ? current.text : '';
      button.disabled = select.disabled || options().length === 0;
      wrap.classList.toggle('is-disabled', button.disabled);
    },
    close() {
      if (!picker.pop) return;
      picker.pop.remove();
      picker.pop = null;
      button.setAttribute('aria-expanded', 'false');
      if (openPicker === picker) openPicker = null;
    },
    pop: null
  };

  function choose(value) {
    picker.close();
    button.focus();
    if (value === select.value) return;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    picker.refresh();
  }

  function open() {
    if (button.disabled) return;
    openPicker?.close();
    const all = options();
    const pop = h('div', {
      class: 'pick-pop',
      role: 'listbox',
      'aria-label': label,
      tabindex: '-1'
    });
    const list = h('div', { class: 'pick-list' });
    const searchBox = search
      ? h('input', {
          class: 'pick-search',
          type: 'search',
          placeholder: 'Search ' + all.length + '...',
          'aria-label': 'Search ' + label.toLowerCase(),
          autocomplete: 'off'
        })
      : null;
    if (searchBox) pop.append(searchBox);
    pop.append(list);

    let shown = all;
    let active = Math.max(
      0,
      all.findIndex(option => option.value === select.value)
    );
    const draw = () => {
      list.replaceChildren(
        ...(shown.length
          ? shown.map((option, index) =>
              h(
                'div',
                {
                  class:
                    'pick-opt' +
                    (mono ? ' mono' : '') +
                    (option.value === select.value ? ' is-sel' : '') +
                    (index === active ? ' is-active' : ''),
                  role: 'option',
                  'aria-selected': String(option.value === select.value),
                  onmousedown: event => event.preventDefault(),
                  onclick: () => choose(option.value),
                  onmousemove: () => {
                    if (active !== index) {
                      active = index;
                      list.querySelector('.is-active')?.classList.remove('is-active');
                      list.children[index].classList.add('is-active');
                    }
                  }
                },
                option.text
              )
            )
          : [h('div', { class: 'pick-none' }, 'Nothing matches')])
      );
      list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
    };
    draw();

    searchBox?.addEventListener('input', () => {
      const query = searchBox.value.trim().toLowerCase();
      shown = all.filter(option => option.text.toLowerCase().includes(query));
      active = 0;
      draw();
    });
    pop.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        picker.close();
        button.focus();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (shown.length)
          active = (active + (event.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
        draw();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (shown[active]) choose(shown[active].value);
      } else if (event.key === 'Tab') {
        picker.close();
      }
    });

    document.body.append(pop);
    // Under the button, as wide as it at least; above it when there is no room below.
    const box = button.getBoundingClientRect();
    pop.style.minWidth = Math.max(box.width, 180) + 'px';
    pop.style.left = Math.min(box.left, window.innerWidth - pop.offsetWidth - 8) + 'px';
    const room = window.innerHeight - box.bottom - 12;
    if (room < 200 && box.top > room) {
      pop.style.bottom = window.innerHeight - box.top + 4 + 'px';
      pop.style.maxHeight = Math.min(300, box.top - 12) + 'px';
    } else {
      pop.style.top = box.bottom + 4 + 'px';
      pop.style.maxHeight = Math.min(300, room) + 'px';
    }
    picker.pop = pop;
    openPicker = picker;
    button.setAttribute('aria-expanded', 'true');
    (searchBox || pop).focus();
  }

  button.addEventListener('click', () => (picker.pop ? picker.close() : open()));
  button.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open();
    }
  });

  pickers.push(picker);
  picker.refresh();
  return picker;
}

/** Redraws every picker from its select, after the code has changed the select's options, value or disabled state. */
export const refreshPickers = () => pickers.forEach(picker => picker.refresh());

// A click anywhere else, a resize or a scroll closes the open list (it is placed once, under its button).
document.addEventListener('pointerdown', event => {
  if (openPicker && !openPicker.pop.contains(event.target) && !event.target.closest('.pick'))
    openPicker.close();
});
window.addEventListener('resize', () => openPicker?.close());
window.addEventListener(
  'scroll',
  event => {
    if (openPicker && !openPicker.pop.contains(event.target)) openPicker.close();
  },
  true
);
