import { Dialog, refs, el } from './dom.js';
import { assetUrl } from '../utils/assets.js';

/**
 * HTML memory journal, grouped by chapter. Hidden entries show as soft
 * silhouettes. In "gallery" mode every memory is open — this is the
 * accessible way to enjoy the memories without driving.
 */
export class Journal {
  constructor(element, { progress, onOpenMemory, onClose }) {
    this.dialog = new Dialog(element, { onClose });
    this.el = element;
    this.r = refs(element);
    this.progress = progress;
    this.onOpenMemory = onOpenMemory;
    this.gallery = false;
  }

  get open() {
    return this.dialog.open;
  }

  show({ gallery = false } = {}, returnFocus) {
    this.gallery = gallery;
    this.render();
    this.dialog.show(returnFocus);
    const first = this.r.list.querySelector('button:not([disabled])') ?? this.el.querySelector('[data-action="close"]');
    first?.focus({ preventScroll: true });
  }

  close() {
    this.dialog.close();
  }

  /** Memories the viewer can step through from here. */
  viewable() {
    const all = this.progress.manifest.memories;
    return this.gallery ? all : all.filter((m) => this.progress.has(m.id));
  }

  render() {
    const { manifest } = this.progress;
    const found = this.progress.count;
    const total = this.progress.total;
    this.r.summary.textContent = this.gallery ? `All ${total} memories` : `${found} of ${total} found`;
    this.r.foot.textContent = this.gallery
      ? 'Gallery mode — browsing here doesn’t count as discovering.'
      : found === total
        ? 'You found every memory. ✨'
        : 'Hidden memories are waiting along the path.';

    const chapters = new Map();
    for (const m of manifest.memories) {
      const key = m.chapter || 'Memories';
      if (!chapters.has(key)) chapters.set(key, []);
      chapters.get(key).push(m);
    }
    const frag = document.createDocumentFragment();
    for (const [chapter, list] of chapters) {
      const grid = el('ul', { class: 'journal__grid', role: 'list' });
      for (const m of list) {
        const unlocked = this.gallery || this.progress.has(m.id);
        const thumb =
          unlocked && m.thumbnail
            ? el('img', { src: assetUrl(m.thumbnail), alt: '', loading: 'lazy', decoding: 'async', width: 384, height: 256 })
            : el('span', { class: 'journal__silhouette', 'aria-hidden': 'true', text: '✦' });
        const body = el('span', { class: 'journal__text' }, [
          el('span', { class: 'journal__name', text: unlocked ? m.title : 'Still hidden' }),
          el('span', { class: 'journal__desc', text: unlocked ? m.description : 'Somewhere along the path…' }),
        ]);
        const card = el(
          'button',
          {
            type: 'button',
            class: `journal__card ${unlocked ? '' : 'is-locked'}`,
            disabled: !unlocked,
            'aria-label': unlocked ? `Open memory: ${m.title}` : 'Undiscovered memory',
            onclick: (e) => this.onOpenMemory(m, this.viewable(), e.currentTarget),
          },
          [el('span', { class: 'journal__thumb' }, [thumb]), body],
        );
        grid.append(el('li', {}, [card]));
      }
      frag.append(el('section', { class: 'journal__chapter' }, [el('h3', { text: chapter }), grid]));
    }
    this.r.list.replaceChildren(frag);
  }
}
