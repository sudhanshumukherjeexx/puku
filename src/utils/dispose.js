/** Releases GPU resources owned by an object tree. Shared resources can be skipped via `keep`. */
export function disposeObject(root, keep = new Set()) {
  root.traverse((obj) => {
    if (obj.geometry && !keep.has(obj.geometry)) obj.geometry.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const m of mats) {
      if (keep.has(m)) continue;
      for (const value of Object.values(m)) {
        if (value?.isTexture && !keep.has(value)) value.dispose();
      }
      m.dispose();
    }
  });
  root.removeFromParent();
}
