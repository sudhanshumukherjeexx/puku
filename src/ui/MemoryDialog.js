import { Dialog, refs, onAction } from './dom.js';
import { assetUrl } from '../utils/assets.js';

/**
 * Accessible memory viewer (native modal <dialog>). Media is loaded only when
 * opened and released on close. Video never autoplays with sound: it starts
 * muted (unless reduced motion is on) and the native controls offer audio.
 * Falls back to the image, then to a friendly note, when files are missing.
 */
export class MemoryDialog {
  constructor(element, { onClose, onMediaPlaying, reducedMotion }) {
    this.dialog = new Dialog(element, { onClose: () => this._closed() });
    this.el = element;
    this.r = refs(element);
    this.onCloseCb = onClose;
    this.onMediaPlaying = onMediaPlaying;
    this.reducedMotion = reducedMotion;
    this.list = [];
    this.index = 0;
    onAction(element, {
      prev: () => this.step(-1),
      next: () => this.step(1),
    });
    element.addEventListener('keydown', (e) => {
      if (e.target === this.r.video) return; // arrows seek inside the video
      if (e.key === 'ArrowLeft') this.step(-1);
      if (e.key === 'ArrowRight') this.step(1);
    });
    const v = this.r.video;
    v.addEventListener('error', () => this._videoFailed());
    v.addEventListener('playing', () => this.onMediaPlaying?.(!v.muted));
    v.addEventListener('volumechange', () => !v.paused && this.onMediaPlaying?.(!v.muted));
    v.addEventListener('pause', () => this.onMediaPlaying?.(false));
    this.r.image.addEventListener('error', () => this._imageFailed());
  }

  get open() {
    return this.dialog.open;
  }

  /**
   * @param memory  manifest entry
   * @param list    navigable memories (story order), e.g. found ones
   */
  show(memory, list = [memory], returnFocus) {
    this.list = list.length ? list : [memory];
    this.index = Math.max(
      0,
      this.list.findIndex((m) => m.id === memory.id),
    );
    this._render();
    this.dialog.show(returnFocus);
    // Put focus on the close button so Escape/Enter work predictably.
    this.el.querySelector('[data-action="close"]').focus({ preventScroll: true });
  }

  close() {
    this.dialog.close();
  }

  step(delta) {
    if (this.list.length < 2) return;
    this.index = (this.index + delta + this.list.length) % this.list.length;
    this._render();
  }

  _render() {
    const m = this.list[this.index];
    const { r } = this;
    this._releaseVideo();
    r.title.textContent = m.title;
    r.chapter.textContent = m.chapter || 'A memory';
    r.desc.textContent = m.description;
    r.desc.hidden = !m.description;
    r.note.hidden = true;
    r.position.textContent = this.list.length > 1 ? `${this.index + 1} of ${this.list.length}` : '';
    const nav = this.list.length > 1;
    this.el.querySelector('[data-action="prev"]').hidden = !nav;
    this.el.querySelector('[data-action="next"]').hidden = !nav;
    this.current = m;

    if (m.video) {
      r.image.hidden = true;
      r.video.hidden = false;
      r.video.poster = assetUrl(m.poster || m.image || '');
      r.video.setAttribute('aria-label', m.alt || m.title);
      r.video.muted = true;
      r.video.preload = 'metadata';
      r.video.src = assetUrl(m.video);
      if (m.captions) {
        const track = document.createElement('track');
        track.kind = 'captions';
        track.src = assetUrl(m.captions);
        track.srclang = 'en';
        track.label = 'Captions';
        r.video.append(track);
      }
      if (!this.reducedMotion()) r.video.play().catch(() => {});
    } else {
      this._showImage(m);
    }
  }

  _showImage(m) {
    const { r } = this;
    r.video.hidden = true;
    if (!m.image) return this._imageFailed();
    r.image.hidden = false;
    r.image.alt = m.alt || m.title;
    r.image.src = assetUrl(m.image);
  }

  _videoFailed() {
    if (!this.current || this.r.video.hidden || !this.r.video.getAttribute('src')) return;
    if (import.meta.env?.DEV) console.warn(`[memory] video failed: ${this.current.video}`);
    this._releaseVideo();
    this._showImage(this.current);
    this._note('This video couldn’t be loaded, so here’s the picture instead.');
  }

  _imageFailed() {
    if (!this.current) return;
    this.r.image.hidden = true;
    this._note('This memory’s picture couldn’t be loaded right now. Please check your connection and try again.');
  }

  _note(text) {
    this.r.note.textContent = text;
    this.r.note.hidden = false;
  }

  _releaseVideo() {
    const v = this.r.video;
    v.pause();
    v.querySelectorAll('track').forEach((t) => t.remove());
    if (v.getAttribute('src')) {
      v.removeAttribute('src');
      v.load(); // frees the decoder and network connection
    }
  }

  _closed() {
    this._releaseVideo();
    this.r.image.removeAttribute('src');
    this.current = null;
    this.onMediaPlaying?.(false);
    this.onCloseCb?.();
  }
}
