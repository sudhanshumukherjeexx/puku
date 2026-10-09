import { LoadingManager, NeutralToneMapping, PCFShadowMap, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { Config, validateConfig } from './Config.js';
import { GameState, StateMachine } from './GameState.js';
import { GameLoop } from './GameLoop.js';
import { Settings } from './Settings.js';
import { PerformanceManager, detectPreset } from './PerformanceManager.js';
import { World } from '../world/World.js';
import { ThemeManager } from '../world/ThemeManager.js';
import { DayNightCycle } from '../world/DayNightCycle.js';
import { getTheme } from '../world/themes.js';
import { copyCarState, createCarState, stepCar } from '../vehicle/CarPhysics.js';
import { FollowCamera } from '../vehicle/FollowCamera.js';
import { placeMemories } from '../memories/placement.js';
import { Progress } from '../memories/Progress.js';
import { ProximitySystem } from '../memories/ProximitySystem.js';
import { InputManager } from '../input/InputManager.js';
import { AudioManager } from '../audio/AudioManager.js';
import { LoadingScreen } from '../ui/LoadingScreen.js';
import { HUD } from '../ui/HUD.js';
import { Minimap } from '../ui/Minimap.js';
import { MemoryDialog } from '../ui/MemoryDialog.js';
import { Journal } from '../ui/Journal.js';
import { SettingsPanel } from '../ui/SettingsPanel.js';
import { PhotoMode, saveCanvas } from '../ui/PhotoMode.js';
import { Dialog, onAction, refs } from '../ui/dom.js';
import { clearAll } from '../utils/storage.js';
import { lerp, lerpAngle } from '../utils/math.js';

const SPAWN = Object.freeze({ x: 0, z: -14, heading: 0 });
const S = GameState;

/**
 * Owns the lifecycle and wires systems together. Systems talk through this
 * class (or small callbacks) — physics never touches the DOM, UI never
 * touches physics, and memory content only enters through the manifest.
 */
export class Game {
  constructor({ manifest, params = new URLSearchParams() }) {
    this.manifest = manifest;
    this.params = params;
    // `?hooks` exposes test hooks only; `?debug` also shows the diagnostics overlay.
    this.debug = params.has('debug') || params.has('hooks') || params.has('bench') || Boolean(import.meta.env?.DEV);
    this.seed = params.has('seed') ? Number(params.get('seed')) || params.get('seed') : manifest.seed;
    this.state = new StateMachine(S.LOADING);
    this.started = false; // has the player begun the journey at least once
    this.time = 0;
    this.focus = new Vector3();
    this._proxTimer = 0;
    this._hudTimer = 0;
    this._audioTimer = 0;
    this._boundaryToastAt = -10;
    this.near = null;
  }

  async init() {
    validateConfig();
    this.settings = new Settings();
    this.progress = new Progress(this.manifest, { persist: this.settings.get('saveProgress') });

    const canvas = document.getElementById('scene');
    this.canvas = canvas;
    this.loading = new LoadingScreen(document.getElementById('loading'));
    this.loading.progress(0, 1, 'Waking the meadow');

    // --- Renderer (WebGL 2). Failure → friendly HTML fallback. ---
    const probe = canvas.getContext('webgl2', { powerPreference: 'default' });
    if (!probe) throw Object.assign(new Error('WebGL 2 is not available'), { code: 'NO_WEBGL' });
    const quality = this.settings.get('quality');
    this.detectedPreset = detectPreset(probe);
    this.presetName = quality === 'auto' ? this.detectedPreset : quality;
    const preset = Config.presets[this.presetName];
    try {
      this.renderer = new WebGLRenderer({ canvas, context: probe, antialias: preset.antialias, powerPreference: 'default' });
    } catch (e) {
      throw Object.assign(e, { code: 'NO_WEBGL' });
    }
    const r = this.renderer;
    r.outputColorSpace = SRGBColorSpace;
    r.toneMapping = NeutralToneMapping; // keeps pastel hues true
    r.toneMappingExposure = 1;
    r.shadowMap.type = PCFShadowMap;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.loop?.stop();
      this.onFatal?.(Object.assign(new Error('Graphics context lost'), { code: 'CONTEXT_LOST' }));
    });

    // --- World (seeded, built in yielding steps with real progress) ---
    const placements = placeMemories(this.manifest.memories, {
      seed: this.seed,
      echoes: this.manifest.placement.echoes,
      mode: this.manifest.placement.mode,
    });
    this.loadingManager = new LoadingManager();
    this.loadingManager.onError = (url) => import.meta.env?.DEV && console.warn(`[assets] failed: ${url}`);
    this.world = new World({
      manifest: { ...this.manifest, seed: this.seed },
      placements,
      preset,
      loadingManager: this.loadingManager,
      isFound: (id) => this.progress.has(id),
    });
    await this.world.build((done, total, label) => this.loading.progress(done, total, label));

    this.themes = new ThemeManager(this.settings.get('theme') ?? this.manifest.defaultTheme);
    this.cycle = new DayNightCycle();
    this.proximity = new ProximitySystem(Config.memories.interactionDistance);
    this.proximity.setItems(this.world.memories.items);

    // --- Car ---
    this.car = createCarState(SPAWN.x, SPAWN.z, SPAWN.heading);
    this.prevCar = createCarState(SPAWN.x, SPAWN.z, SPAWN.heading);
    this.renderCar = createCarState(SPAWN.x, SPAWN.z, SPAWN.heading);
    this.camera = new FollowCamera(innerWidth / innerHeight);
    this.camera.snap(this.car, this.world.field);

    this._initUI();
    this._initInput();
    this.audio = new AudioManager(this.settings);
    this.perf = new PerformanceManager({
      initial: this.detectedPreset,
      onDowngrade: (next, fps) => {
        this._setPreset(next);
        this.hud.toast('Graphics adjusted', `Switched to “${next}” to keep things smooth (${fps.toFixed(0)} FPS).`);
      },
    });

    this._applySettings();
    this.world.applyPalette(this.themes.palette);
    this._applyThemeCss();
    this._restoreMilestones();
    this.settings.onChange((key) => this._onSetting(key));

    this.loop = new GameLoop({
      fixedUpdate: (dt) => this._fixedUpdate(dt),
      update: (dt, alpha) => this._update(dt, alpha),
      render: () => this.renderer.render(this.world.scene, this.camera.camera),
    });
    this.state.onChange((next, prev) => this._onState(next, prev));
    this._resize();
    window.addEventListener('resize', () => this._resize());

    // Render one frame before revealing, so the welcome screen sits over the meadow.
    this._update(0, 1);
    this.renderer.render(this.world.scene, this.camera.camera);
    this.loop.start();
    this.state.set(S.READY);
    this.loading.hide();
    this.welcome.hidden = false;
    this.welcome.querySelector('[data-action="begin"]').focus({ preventScroll: true });

    // Optional assets: thumbnails stream in behind the welcome screen.
    this.world.memories.loadThumbnails();

    if (this.debug) this._exposeDebug();
    if (this.params.has('debug') || this.params.has('bench')) this.toggleDiagnostics();
  }

  // ------------------------------------------------------------------ UI

  _initUI() {
    const hudRoot = document.getElementById('hud');
    this.touchMode = Boolean(matchMedia('(pointer: coarse)').matches);
    this.hud = new HUD(hudRoot, { touch: this.touchMode });
    this.hud.setProgress(this.progress.count, this.progress.total);

    const pathPts = this.world.path.curve.getSpacedPoints(80);
    this.minimap = new Minimap(refs(hudRoot).minimapCanvas, {
      pathPoints: pathPts,
      markers: this.world.memories.items,
      isFound: (id) => this.progress.has(id),
      landmarkVisible: () => this.world.effects.tree.visible,
    });

    this.memoryDialog = new MemoryDialog(document.getElementById('memory-dialog'), {
      onClose: () => this._afterDialog(),
      onMediaPlaying: (audible) => this.audio?.duck(audible),
      reducedMotion: () => this.settings.reducedMotion,
    });
    this.journal = new Journal(document.getElementById('journal-dialog'), {
      progress: this.progress,
      onOpenMemory: (m, list, opener) => this.openMemory(m, list, opener),
      onClose: () => this._afterDialog(),
    });
    this.settingsPanel = new SettingsPanel(document.getElementById('settings-dialog'), {
      settings: this.settings,
      getEffectivePreset: () => this.presetName,
      onRestart: () => this.restart(),
      onClearData: () => this.clearData(),
      onClose: () => this._afterDialog(),
    });
    this.helpDialog = new Dialog(document.getElementById('help-dialog'), { onClose: () => this._afterDialog() });
    this.pauseDialog = new Dialog(document.getElementById('pause-dialog'), { onClose: () => this._afterDialog() });
    this.dialogs = [this.memoryDialog, this.journal, this.settingsPanel, this.helpDialog, this.pauseDialog];

    onAction(document.getElementById('pause-dialog'), {
      resume: () => this.pauseDialog.close(),
      journal: (e, b) => this.journal.show({}, b),
      settings: (e, b) => this.settingsPanel.show(b),
      help: (e, b) => this.helpDialog.show(b),
    });

    this.photo = new PhotoMode(document.getElementById('photo'), this.canvas, {
      onExit: () => this.exitPhoto(),
      onCapture: () => this.capturePhoto(),
    });

    // Welcome screen
    this.welcome = document.getElementById('welcome');
    const w = refs(this.welcome);
    w.title.textContent = this.manifest.title;
    w.tagline.textContent = this.manifest.tagline;
    w.intro.textContent = this.manifest.intro;
    if (this.progress.count > 0) {
      w.progress.hidden = false;
      w.progress.textContent = `Welcome back — you've found ${this.progress.count} of ${this.progress.total} memories.`;
    }
    onAction(this.welcome, {
      begin: () => this.begin(),
      help: (e, b) => this.helpDialog.show(b),
      settings: (e, b) => this.settingsPanel.show(b),
      sound: () => this.settings.set('muted', !this.settings.get('muted')),
      gallery: (e, b) => this.journal.show({ gallery: true }, b),
    });

    onAction(hudRoot, {
      journal: (e, b) => this.openJournal(b),
      map: () => this.settings.set('showMinimap', !this.settings.get('showMinimap')),
      photo: () => this.enterPhoto(),
      settings: (e, b) => this.openSettings(b),
      pause: (e, b) => this.pause(b),
      interact: () => this.interact(),
      'dismiss-hint': () => {
        this.settings.set('onboarded', true);
        this.hud.showHints(false);
        this.canvas.focus({ preventScroll: true });
      },
    });
  }

  _initInput() {
    this.touchRoot = document.getElementById('touch');
    this.input = new InputManager({
      touchRoot: this.touchRoot,
      canDrive: () => this.state.simulating,
      onAction: (action) => this._onAction(action),
    });
    // Switch to touch layout on first real touch (hybrid laptops etc.).
    window.addEventListener('pointerdown', (e) => {
      const touch = e.pointerType === 'touch';
      if (touch !== this.touchMode && (touch || e.pointerType === 'mouse')) {
        this.touchMode = touch;
        this.hud.setTouchMode(touch);
        this._syncTouchVisibility();
      }
    });
  }

  /** Keyboard actions. Returns true when the key was handled. */
  _onAction(action) {
    const st = this.state;
    switch (action) {
      case 'interact':
        if (st.is(S.READY) && !this.started) return (this.begin(), true);
        return st.simulating ? (this.interact(), true) : false;
      case 'escape':
        if (st.is(S.PHOTO)) return (this.exitPhoto(), true);
        if (st.simulating) return (this.pause(), true);
        return false;
      case 'map':
        if (!st.is(S.PLAYING)) return false;
        this.settings.set('showMinimap', !this.settings.get('showMinimap'));
        return true;
      case 'journal':
        return st.is(S.PLAYING) ? (this.openJournal(), true) : false;
      case 'photo':
        if (st.is(S.PHOTO)) return (this.exitPhoto(), true);
        return st.is(S.PLAYING) ? (this.enterPhoto(), true) : false;
      case 'hud':
        if (!st.is(S.PLAYING)) return false;
        this.hudCollapsed = !this.hudCollapsed;
        this.hud.setCollapsed(this.hudCollapsed);
        return true;
      case 'help':
        return st.is(S.PLAYING) ? (this.helpDialog.show(), true) : false;
      case 'diagnostics':
        if (!this.debug) return false;
        this.toggleDiagnostics();
        return true;
      default:
        return false;
    }
  }

  // ------------------------------------------------------------------ flow

  begin() {
    if (!this.state.is(S.READY)) return;
    this.audio.start();
    this.audio.chime('ui');
    this.started = true;
    this.welcome.hidden = true;
    this.state.set(S.PLAYING);
    if (this.settings.get('showHints') && !this.settings.get('onboarded')) this.hud.showHints(true);
    this.canvas.focus({ preventScroll: true });
  }

  pause(opener) {
    if (!this.state.is(S.PLAYING)) return;
    this.state.set(S.PAUSED);
    this.pauseDialog.show(opener ?? this.canvas);
    this.pauseDialog.el.querySelector('[data-action="resume"]').focus();
  }

  openJournal(opener) {
    if (this.state.is(S.PLAYING)) this.state.set(S.PAUSED);
    this.journal.show({}, opener ?? this.canvas);
  }

  openSettings(opener) {
    if (this.state.is(S.PLAYING)) this.state.set(S.PAUSED);
    this.settingsPanel.show(opener ?? this.canvas);
  }

  interact() {
    if (!this.state.simulating || !this.near) return;
    const marker = this.near;
    const { isNew, milestones } = this.progress.discover(marker.memoryId);
    if (isNew) {
      this.audio.chime('discover');
      this.world.memories.refresh(marker.memoryId);
      this.hud.setProgress(this.progress.count, this.progress.total);
      document.body.classList.remove('is-discovering');
      void document.body.offsetWidth;
      document.body.classList.add('is-discovering');
      this._pendingMilestones = milestones;
      if (!this.settings.get('onboarded')) {
        // First discovery means the player has the hang of it.
        this.settings.set('onboarded', true);
        this.hud.showHints(false);
      }
    }
    this.hud.setPrompt(null);
    this._promptKey = null;
    this.openMemory(marker.memory, this.progress.discoveredList(), this.canvas);
  }

  openMemory(memory, list, opener) {
    if (this.state.is(S.PLAYING) || this.state.is(S.PAUSED)) this.state.set(S.VIEWING_MEMORY);
    this.memoryDialog.show(memory, list, opener);
  }

  /** Called whenever any dialog closes. Resumes driving when nothing is open. */
  _afterDialog() {
    if (this.dialogs.some((d) => d.open)) {
      if (this.state.is(S.VIEWING_MEMORY) && !this.memoryDialog.open) this.state.set(S.PAUSED);
      return;
    }
    if (this.state.is(S.VIEWING_MEMORY) || this.state.is(S.PAUSED)) this.state.set(S.PLAYING);
    if (this.state.is(S.PLAYING)) this.canvas.focus({ preventScroll: true });
    if (this._pendingMilestones?.length) {
      const list = this._pendingMilestones;
      this._pendingMilestones = null;
      list.forEach((ms, i) => setTimeout(() => this._celebrate(ms), 400 + i * 1200));
    }
    if (!this.started) this.welcome.querySelector('[data-action="begin"]')?.focus({ preventScroll: true });
  }

  _celebrate(ms) {
    this.world.effects.setMilestone(ms.effect, { instant: this.settings.reducedMotion });
    this.audio.chime('milestone');
    this.hud.toast(ms.title, ms.message, { duration: ms.effect === 'finale' ? 10000 : 6000, tone: 'milestone' });
    this.minimap.update(0, this.renderCar, this.near?.key ?? '', true);
  }

  _restoreMilestones() {
    this.world.effects.resetMilestones();
    for (const ms of this.manifest.milestones) {
      if (this.progress.reachedMilestones.has(ms.id)) this.world.effects.setMilestone(ms.effect, { instant: true });
    }
  }

  enterPhoto() {
    if (!this.state.is(S.PLAYING)) return;
    this.state.set(S.PHOTO);
    this.camera.orbit = this.photo.orbit;
    this.photo.enter(this.touchMode);
  }

  exitPhoto() {
    if (!this.state.is(S.PHOTO)) return;
    this.photo.exit();
    this.camera.orbit = null;
    this.state.set(S.PLAYING);
    this.canvas.focus({ preventScroll: true });
  }

  async capturePhoto() {
    this.renderer.render(this.world.scene, this.camera.camera);
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const ok = await saveCanvas(this.canvas, `puku-starfall-meadow-${stamp}.png`);
    this.audio.chime('ui');
    if (ok) this.hud.toast('Photo saved', 'Check your downloads folder.', { duration: 2500 });
    else this.hud.toast('Couldn’t save the photo', 'Your browser blocked the download. Try a long-press screenshot instead.');
  }

  restart() {
    this.progress.reset();
    this._restoreMilestones();
    this.world.memories.refresh();
    this.hud.setProgress(0, this.progress.total);
    copyCarState(createCarState(SPAWN.x, SPAWN.z, SPAWN.heading), this.car);
    copyCarState(this.car, this.prevCar);
    this.camera.snap(this.car, this.world.field);
    this.cycle.phase = Config.dayNight.startPhase;
    this.dialogs.forEach((d) => d.close());
    this.input.reset();
    this.hud.toast('A fresh journey', 'Every memory is waiting to be found again.');
  }

  clearData() {
    clearAll();
    this.settings.reset();
    this.progress.setPersist(false);
    this.hud.toast('Saved data cleared', 'Nothing from this meadow is stored in your browser now.');
  }

  // ------------------------------------------------------------------ settings

  _applySettings() {
    for (const key of ['quality', 'theme', 'muted', 'cameraShake', 'reducedMotion', 'showMinimap', 'showHints']) this._onSetting(key, true);
  }

  _onSetting(key, initial = false) {
    const s = this.settings;
    switch (key) {
      case 'quality': {
        const q = s.get('quality');
        this._setPreset(q === 'auto' ? this.detectedPreset : q);
        break;
      }
      case 'theme':
        if (!initial && s.get('theme')) {
          this.themes.setTheme(s.get('theme'), { instant: s.reducedMotion });
          this._applyThemeCss();
        }
        break;
      case 'muted':
      case 'masterVolume':
      case 'musicVolume':
      case 'sfxVolume': {
        this.audio?.applyVolumes();
        const btn = this.welcome.querySelector('[data-action="sound"]');
        const on = !s.get('muted');
        btn.setAttribute('aria-pressed', String(on));
        btn.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
        btn.querySelector('use').setAttribute('href', on ? '#i-sound' : '#i-mute');
        break;
      }
      case 'reducedMotion':
      case 'cameraShake':
        this.camera.shake = s.get('cameraShake') && !s.reducedMotion;
        document.documentElement.classList.toggle('reduce-motion', s.reducedMotion);
        break;
      case 'showMinimap':
        this.hud.setMinimapVisible(s.get('showMinimap'));
        break;
      case 'showHints':
        if (!s.get('showHints')) this.hud.showHints(false);
        break;
      case 'saveProgress':
        this.progress.setPersist(s.get('saveProgress'));
        break;
      default:
    }
    if (!initial) this.loop?.requestFrame();
  }

  _setPreset(name) {
    this.presetName = name;
    const preset = Config.presets[name];
    this.world.setQuality(preset);
    this.renderer.shadowMap.enabled = preset.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, preset.pixelRatio));
    this.perf?.reset();
    this.settingsPanel?.sync(this.themes?.id);
    this.loop?.requestFrame();
  }

  _applyThemeCss() {
    const t = getTheme(this.themes.id);
    const root = document.documentElement.style;
    root.setProperty('--accent', t.css.accent);
    root.setProperty('--accent-soft', t.css.accentSoft);
    this.minimap.setAccent(t.css.accent);
    this.settingsPanel.currentTheme = t.id;
  }

  // ------------------------------------------------------------------ loop

  _onState(next) {
    const playing = next === S.PLAYING;
    // While a dialog covers the world, stop rendering entirely: the last frame
    // stays on screen and the GPU rests (smooth video playback on weak devices).
    this.loop.renderEnabled = next === S.PLAYING || next === S.READY || next === S.PHOTO;
    this.loop.simulate = playing;
    if (!playing) this.input.reset();
    if (next === S.PAUSED || next === S.VIEWING_MEMORY) this.audio.suspend?.();
    else if (this.started) this.audio.resume();
    document.getElementById('hud').hidden = !(playing || next === S.PAUSED || next === S.VIEWING_MEMORY);
    this.hud.setCollapsed(next === S.PHOTO || this.hudCollapsed);
    if (!playing) this.hud.setPrompt(null);
    this._syncTouchVisibility();
    this.perf.reset();
  }

  _syncTouchVisibility() {
    this.touchRoot.hidden = !(this.touchMode && this.state.is(S.PLAYING));
  }

  _fixedUpdate(dt) {
    if (!this.state.simulating) return;
    const input = this._scripted ? this._scripted(this.time) : this.input.read();
    this._lastThrottle = input.throttle;
    copyCarState(this.car, this.prevCar);
    stepCar(this.car, input, dt);
    if (this.car.boundaryHit && this.time - this._boundaryToastAt > 6) {
      this._boundaryToastAt = this.time;
      this.hud.toast('The meadow ends here', 'Turn around — there’s more to find inside. ✿', { duration: 3000 });
    }
  }

  _update(dt, alpha) {
    const playingish = this.state.is(S.PLAYING) || this.state.is(S.READY) || this.state.is(S.PHOTO);
    const themeChanging = this.themes.update(dt);
    if (themeChanging) {
      this.world.applyPalette(this.themes.palette);
      this.loop.requestFrame();
    }
    if (!playingish && !themeChanging && !this.loop._pendingFrame) return;

    const animate = !this.settings.reducedMotion;
    if (playingish) {
      this.time += dt;
      if (!this.state.is(S.PHOTO)) this.cycle.update(dt);
    }

    // Interpolate between the last two physics states for smooth rendering at any refresh rate.
    const rc = this.renderCar;
    const a = this.state.simulating ? alpha : 1;
    rc.x = lerp(this.prevCar.x, this.car.x, a);
    rc.z = lerp(this.prevCar.z, this.car.z, a);
    rc.heading = lerpAngle(this.prevCar.heading, this.car.heading, a);
    rc.speed = this.car.speed;
    rc.steer = this.car.steer;

    this.world.car.sync(rc, this.world.field, dt, { throttle: this._lastThrottle ?? 0, maxSpeed: Config.car.maxSpeed, animate });
    this.focus.set(rc.x, this.world.field.heightAt(rc.x, rc.z), rc.z);

    if (this.state.is(S.READY) && !this.started) {
      // Slow cinematic orbit behind the welcome screen.
      const t = animate ? this.time * 0.08 : 0.6;
      const cam = this.camera.camera;
      cam.position.set(rc.x + Math.sin(t) * 16, this.focus.y + 6.5, rc.z + Math.cos(t) * 16);
      cam.lookAt(rc.x, this.focus.y + 1.5, rc.z);
    } else {
      this.camera.update(rc, this.world.field, dt, this.time);
    }

    this.world.update(dt, this.time, this.themes.palette, this.cycle, this.focus, animate);

    if (!this.state.is(S.PLAYING)) return;

    // Low-frequency systems
    this._proxTimer += dt;
    if (this._proxTimer >= 1 / Config.memories.proximityHz) {
      this._proxTimer = 0;
      this.near = this.proximity.nearest(rc.x, rc.z);
      this.hud.setPrompt(this.near?.memory ?? null, this.near ? this.progress.has(this.near.memoryId) : false);
    }
    this._hudTimer += dt;
    if (this._hudTimer >= 1 / Config.hudHz) {
      this._hudTimer = 0;
      this.hud.setSpeed(this.car.speed);
    }
    this._audioTimer += dt;
    if (this._audioTimer >= 0.1) {
      this.audio.update(this._audioTimer, Math.abs(this.car.speed) / Config.car.maxSpeed);
      this._audioTimer = 0;
    }
    this.minimap.update(dt, rc, this.near?.key ?? '');
    this.perf.sample(dt, this.presetName, this.settings.get('quality') === 'auto');
    this.diagnostics?.onFrame(dt);
  }

  _resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.resize(w / h);
    this.loop?.requestFrame();
  }

  // ------------------------------------------------------------------ debug

  async toggleDiagnostics() {
    if (this.diagnostics) {
      this.diagnostics.dispose();
      this.diagnostics = null;
      return;
    }
    const { createDiagnostics } = await import('../ui/Diagnostics.js');
    this.diagnostics = createDiagnostics(this);
    if (this.params.has('bench')) {
      if (!this.started) this.begin();
      this.diagnostics.runBenchmark(Number(this.params.get('bench')) || 20);
    }
  }

  startScripted(fn) {
    this._scripted = fn;
  }

  stopScripted() {
    this._scripted = null;
  }

  /** Read-mostly hooks for automated browser tests and the benchmark. */
  _exposeDebug() {
    window.__PUKU__ = {
      game: this,
      state: () => this.state.current,
      car: () => ({ ...this.car }),
      progress: () => ({ found: this.progress.count, total: this.progress.total }),
      theme: () => this.themes.id,
      preset: () => this.presetName,
      markers: () => this.world.memories.items.map((m) => ({ key: m.key, memoryId: m.memoryId, x: m.x, z: m.z })),
      /** Parks the car next to a marker (tests only). */
      parkAt: (index = 0) => {
        const m = this.world.memories.items[index];
        copyCarState(createCarState(m.x, m.z - 4, 0), this.car);
        copyCarState(this.car, this.prevCar);
        this.camera.snap(this.car, this.world.field);
        this._proxTimer = 1;
      },
      clearColor: () => this.themes.palette.sky.dayTop.getHexString(),
    };
  }
}
