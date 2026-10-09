import { Dialog, refs, onAction } from './dom.js';
import { THEMES } from '../world/themes.js';

/** Binds the settings form to the Settings store (two-way, no framework). */
export class SettingsPanel {
  constructor(element, { settings, getEffectivePreset, onRestart, onClearData, onClose }) {
    this.dialog = new Dialog(element, { onClose });
    this.el = element;
    this.r = refs(element);
    this.settings = settings;
    this.getEffectivePreset = getEffectivePreset;
    this.form = this.r.form;

    const themeSelect = this.form.elements.theme;
    for (const t of THEMES) themeSelect.append(new Option(t.name, t.id));

    this.form.addEventListener('change', (e) => this._onInput(e.target));
    this.form.addEventListener('input', (e) => e.target.type === 'range' && this._onInput(e.target));
    onAction(element, {
      restart: () => {
        if (confirm('Restart your journey? Found memories will be hidden again.')) onRestart();
      },
      'clear-data': () => {
        if (confirm('Clear saved progress and settings from this browser?')) onClearData();
      },
    });
  }

  get open() {
    return this.dialog.open;
  }

  show(returnFocus) {
    this.sync();
    this.dialog.show(returnFocus);
  }

  close() {
    this.dialog.close();
  }

  sync(themeId) {
    const f = this.form.elements;
    const s = this.settings;
    f.theme.value = themeId ?? this.currentTheme ?? s.get('theme');
    f.quality.value = s.get('quality');
    f.muted.checked = s.get('muted');
    f.masterVolume.value = s.get('masterVolume');
    f.musicVolume.value = s.get('musicVolume');
    f.sfxVolume.value = s.get('sfxVolume');
    f.reducedMotion.checked = s.reducedMotion;
    f.cameraShake.checked = s.get('cameraShake');
    f.cameraShake.disabled = s.reducedMotion;
    f.showHints.checked = s.get('showHints');
    f.showMinimap.checked = s.get('showMinimap');
    f.saveProgress.checked = s.get('saveProgress');
    const eff = this.getEffectivePreset();
    this.r.qualityNote.textContent =
      s.get('quality') === 'auto' ? `Auto is using “${eff}” for this device. It may lower itself if things get choppy.` : '';
  }

  _onInput(input) {
    const { name } = input;
    if (!name) return;
    const value = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
    this.settings.set(name, value);
    if (name === 'reducedMotion' || name === 'quality') this.sync();
  }
}
