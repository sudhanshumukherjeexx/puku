/** Collects `[data-ref]` children once, so components never re-query the DOM in hot paths. */
export function refs(root) {
  const out = {};
  root.querySelectorAll('[data-ref]').forEach((el) => {
    out[el.dataset.ref] = el;
  });
  return out;
}

/** Delegated click handling for `[data-action]` buttons inside a root. */
export function onAction(root, handlers) {
  const fn = (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || !root.contains(btn)) return;
    const h = handlers[btn.dataset.action];
    if (h) h(e, btn);
  };
  root.addEventListener('click', fn);
  return () => root.removeEventListener('click', fn);
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

/**
 * Thin wrapper over native <dialog>: modal focus containment and Escape come
 * from the platform; we add focus restoration and a single close path.
 */
export class Dialog {
  constructor(element, { onClose } = {}) {
    this.el = element;
    this.onClose = onClose;
    this.returnFocus = null;
    element.addEventListener('cancel', (e) => {
      e.preventDefault(); // route Escape through close() so state stays consistent
      this.close();
    });
    element.addEventListener('click', (e) => {
      const backdrop = e.target === element;
      if (backdrop || e.target.closest('[data-action="close"]')) this.close();
    });
    element.addEventListener('close', () => {
      const target = this.returnFocus;
      this.returnFocus = null;
      if (target?.isConnected && typeof target.focus === 'function') target.focus({ preventScroll: true });
      this.onClose?.();
    });
  }

  get open() {
    return this.el.open;
  }

  show(returnFocus = document.activeElement) {
    if (this.el.open) return;
    this.returnFocus = returnFocus;
    this.el.showModal();
  }

  close() {
    if (this.el.open) this.el.close();
  }
}
