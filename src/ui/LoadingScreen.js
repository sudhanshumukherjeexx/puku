import { refs } from './dom.js';

/** Shows real, step-based progress (never a fake percentage). */
export class LoadingScreen {
  constructor(root) {
    this.root = root;
    this.r = refs(root);
  }

  progress(done, total, label) {
    const pct = Math.round((done / total) * 100);
    this.r.bar.style.setProperty('--p', `${pct}%`);
    this.r.bar.setAttribute('aria-valuenow', String(pct));
    if (label) this.r.label.textContent = `${label}…`;
  }

  hide() {
    this.root.classList.add('is-done');
    const remove = () => (this.root.hidden = true);
    this.root.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 700);
  }
}
