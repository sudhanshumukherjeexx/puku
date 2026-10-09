import { refs, el } from './dom.js';
import { assetUrl } from '../utils/assets.js';
import { MemoryDialog } from './MemoryDialog.js';

/**
 * Shown when 3D can't start (no WebGL 2, lost context, init error) or the
 * manifest is invalid. Never a blank screen: it explains what happened and,
 * when possible, offers a plain-HTML gallery of every memory.
 */
export function showFallback({ title, message, retry = true, manifest = null }) {
  const root = document.getElementById('fallback');
  const r = refs(root);
  r.title.textContent = title;
  r.message.textContent = message;
  r.actions.replaceChildren();
  if (retry) {
    r.actions.append(el('button', { class: 'btn btn--primary', type: 'button', text: 'Try again', onclick: () => location.reload() }));
  }
  r.gallery.replaceChildren();
  if (manifest) {
    const viewer = new MemoryDialog(document.getElementById('memory-dialog'), { reducedMotion: () => true });
    const list = el('ul', { class: 'journal__grid', role: 'list' });
    manifest.memories.forEach((m) => {
      list.append(
        el('li', {}, [
          el(
            'button',
            {
              class: 'journal__card',
              type: 'button',
              'aria-label': `Open memory: ${m.title}`,
              onclick: (e) => viewer.show(m, manifest.memories, e.currentTarget),
            },
            [
              el('span', { class: 'journal__thumb' }, [
                el('img', { src: assetUrl(m.thumbnail), alt: '', loading: 'lazy', width: 384, height: 256 }),
              ]),
              el('span', { class: 'journal__text' }, [
                el('span', { class: 'journal__name', text: m.title }),
                el('span', { class: 'journal__desc', text: m.description }),
              ]),
            ],
          ),
        ]),
      );
    });
    r.gallery.append(el('h2', { text: 'Memories' }), list);
  }
  root.hidden = false;
  root.querySelector('button')?.focus();
}
