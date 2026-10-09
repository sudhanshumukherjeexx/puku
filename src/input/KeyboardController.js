/** Key bindings by physical key (`code`) so WASD works on any keyboard layout. */
export const BINDINGS = Object.freeze({
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  brake: ['Space'],
});

export const ACTIONS = Object.freeze({
  KeyE: 'interact',
  Enter: 'interact',
  NumpadEnter: 'interact',
  Escape: 'escape',
  KeyT: 'map',
  KeyM: 'map',
  KeyJ: 'journal',
  KeyP: 'photo',
  KeyH: 'hud',
  Slash: 'help',
  Backquote: 'diagnostics',
});

const DRIVE_CODES = new Set(Object.values(BINDINGS).flat());

const isTextField = (el) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/**
 * Tracks held driving keys and emits one-shot actions. Gameplay keys are only
 * swallowed (preventDefault) while the game owns input, so menus, dialogs and
 * form fields keep their normal keyboard behaviour.
 */
export class KeyboardController {
  constructor({ canDrive, onAction }) {
    this.held = new Set();
    this.canDrive = canDrive;
    this.onAction = onAction;
    this._down = (e) => this._onDown(e);
    this._up = (e) => this.held.delete(e.code);
    window.addEventListener('keydown', this._down);
    window.addEventListener('keyup', this._up);
  }

  _onDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTextField(e.target)) return;
    const inDialog = e.target instanceof Element && e.target.closest('dialog[open]');
    if (inDialog) return; // dialogs handle their own keys (Escape, arrows)

    if (DRIVE_CODES.has(e.code) && this.canDrive()) {
      e.preventDefault();
      this.held.add(e.code);
      return;
    }
    const action = ACTIONS[e.code];
    if (action && !e.repeat) {
      // Don't steal Enter/Space from focused buttons.
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && e.target instanceof HTMLButtonElement) return;
      if (this.onAction(action, e) === true) e.preventDefault();
    }
  }

  isDown(name) {
    return BINDINGS[name].some((c) => this.held.has(c));
  }

  reset() {
    this.held.clear();
  }

  dispose() {
    window.removeEventListener('keydown', this._down);
    window.removeEventListener('keyup', this._up);
  }
}
