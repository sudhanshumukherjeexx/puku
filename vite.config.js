import { defineConfig } from 'vite';

// Relative base: the same build works at a domain root, under
// https://sudhanshumukherjeexx.github.io/puku/ and in `vite preview`.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Three.js changes rarely; a separate chunk caches across app updates.
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
