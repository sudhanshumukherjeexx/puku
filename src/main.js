import '@fontsource/comfortaa/latin-700.css';
import './styles/variables.css';
import './styles/global.css';
import './styles/hud.css';
import './styles/dialogs.css';
import './styles/responsive.css';

import rawManifest from './content/world.json';
import { validateManifest } from './memories/MemoryManifest.js';
import { Game } from './core/Game.js';
import { showFallback } from './ui/Fallback.js';

const params = new URLSearchParams(location.search);

async function boot() {
  let manifest;
  try {
    manifest = validateManifest(rawManifest);
  } catch (err) {
    console.error(err);
    showFallback({
      title: 'This meadow’s map is a little tangled',
      message:
        'The memory manifest has a problem, so the world can’t be built. If you’re the author, the browser console lists exactly what to fix.',
      retry: false,
    });
    return;
  }

  const game = new Game({ manifest, params });
  game.onFatal = (err) => fail(err, manifest);
  try {
    await game.init();
  } catch (err) {
    fail(err, manifest);
  }
}

function fail(err, manifest) {
  if (import.meta.env.DEV) console.error(err);
  document.getElementById('loading').hidden = true;
  document.getElementById('welcome').hidden = true;
  document.getElementById('hud').hidden = true;
  const noGl = err?.code === 'NO_WEBGL';
  const lost = err?.code === 'CONTEXT_LOST';
  showFallback({
    title: noGl ? 'The meadow can’t bloom here' : lost ? 'The meadow took a little nap' : 'Something went wrong',
    message: noGl
      ? 'Your browser or device couldn’t start 3D graphics (WebGL 2). Try an up-to-date Chrome, Edge, Firefox or Safari, or turn on hardware acceleration. You can still look through every memory below.'
      : lost
        ? 'The graphics driver reset. Reloading usually brings everything back.'
        : 'The world couldn’t be prepared. Please try again — your memories are still here below.',
    retry: true,
    manifest,
  });
}

boot();
