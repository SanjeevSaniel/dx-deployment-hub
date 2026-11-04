// Motion for the buttons: a ripple where a button is pressed, the rocket leaving when a publish starts, and a short ring (green for done, red for failed)
// on the button that started a run when the run ends. It is only decoration: every state is also shown in words and colour, and the styles turn
// the animations off for people who ask for less motion (prefers-reduced-motion).
import { $ } from './util.js';

const RIPPLED = '.btn, .btn-signin, .btn-tool';

/** A circle grows from the point of the press and fades, clipped to the button (see .ripple in hub.css). */
export function initRipples() {
  document.addEventListener('pointerdown', event => {
    const button = event.target.closest?.(RIPPLED);
    if (!button || button.disabled) return;
    const box = button.getBoundingClientRect();
    // Large enough to reach the far corner from wherever the press was.
    const size = Math.max(box.width, box.height) * 2;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${event.clientX - box.left - size / 2}px;top:${event.clientY - box.top - size / 2}px`;
    button.append(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  });
}

/** Plays a one-off animation class on an element, and takes it off afterwards so it can play again. */
function play(element, className, ms) {
  if (!element) return;
  element.classList.remove(className);
  // Reading a layout value makes the browser see the class gone, so adding it again restarts the animation.
  void element.offsetWidth;
  element.classList.add(className);
  setTimeout(() => element.classList.remove(className), ms);
}

/** The rocket on Publish lifts off as the run starts; the button then hands over to Stop. */
export const launch = () => play($('btnPublish'), 'is-launching', 650);

// The button that starts each action, so the result shows where the person pressed.
const STARTED_BY = {
  publish: 'btnPublish',
  publishAll: 'btnPublishAll',
  buildComponent: 'btnBuild',
  validateSchema: 'btnValidate'
};

/** When a run ends: a green ring on the button that started it if it went through, a red ring if it failed. A stopped run shows nothing. */
export function flashResult(action, { ok, stopped }) {
  const button = $(STARTED_BY[action]);
  if (stopped) return;
  play(button, ok ? 'flash-ok' : 'flash-bad', 900);
}
