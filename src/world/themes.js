/**
 * Theme palettes. Ground and car colours come from the original four themes;
 * sky, light and decoration palettes were added so a theme switch recolours
 * the whole world coherently. All values are hex numbers so they can be
 * lerped into THREE.Color without parsing.
 */
export const THEMES = Object.freeze([
  {
    id: 'enchanted-dream',
    name: 'Enchanted Dream',
    css: { accent: '#b78ad9', accentSoft: '#f6c7d5' },
    sky: {
      dayTop: 0x9ec4f2,
      dayHorizon: 0xf8dbe8,
      duskTop: 0x8b7fc9,
      duskHorizon: 0xffb8c6,
      nightTop: 0x16163a,
      nightHorizon: 0x3b2c5e,
    },
    ground: { base: 0xcdbcec, detail: 0xaedfc6, path: 0xfff3e2, rim: 0xb09bdc },
    light: { sun: 0xfff3e6, dusk: 0xffb3a7, hemiSky: 0xe9e2ff, hemiGround: 0xc9b6e6, night: 0x6e6ab8 },
    car: { body: 0x9966ff, accent: 0x7fd8ff, tail: 0xff7eb6 },
    flowers: [0xff8fc4, 0xffd36e, 0x8ff0d0, 0xc9a7ff],
    crystals: [0xbfa6ff, 0xff9ed1, 0x9ee7ff],
    mushrooms: [0xff8b8b, 0xb69cff, 0xffb26b],
    grass: 0x9ed9b0,
    stone: 0xcfc8e0,
    particles: 0xffd6f0,
    glow: 0.55,
    nightFloor: 0,
  },
  {
    id: 'sunset-oasis',
    name: 'Sunset Oasis',
    css: { accent: '#ff8e72', accentSoft: '#ffd6bb' },
    sky: {
      dayTop: 0x8fc3e8,
      dayHorizon: 0xffe0c2,
      duskTop: 0xc0789a,
      duskHorizon: 0xffa66e,
      nightTop: 0x1f1636,
      nightHorizon: 0x5b2f4a,
    },
    ground: { base: 0xf8dcc2, detail: 0xefc796, path: 0xfff6e8, rim: 0xe3ad82 },
    light: { sun: 0xffe2b8, dusk: 0xff9466, hemiSky: 0xffe9d1, hemiGround: 0xe3b38a, night: 0x8a5c8a },
    car: { body: 0xff5e62, accent: 0xffd27d, tail: 0xff4f6d },
    flowers: [0xff7e5f, 0xfeb47b, 0xffe27a, 0xff9fb2],
    crystals: [0xffb38a, 0xff8fa3, 0xffe08a],
    mushrooms: [0xff6f5b, 0xffa94d, 0xe08bd8],
    grass: 0xc9d98a,
    stone: 0xe3c7aa,
    particles: 0xffe0b0,
    glow: 0.45,
    nightFloor: 0,
  },
  {
    id: 'crystal-forest',
    name: 'Crystal Forest',
    css: { accent: '#3fb8c8', accentSoft: '#bde4d5' },
    sky: {
      dayTop: 0x8ed3ea,
      dayHorizon: 0xdaf6f0,
      duskTop: 0x6f86c9,
      duskHorizon: 0xb7e3e6,
      nightTop: 0x0c1f33,
      nightHorizon: 0x1e4a5a,
    },
    ground: { base: 0xbde3c3, detail: 0x8ed2c0, path: 0xf0fbf6, rim: 0x86c2b0 },
    light: { sun: 0xf2fffb, dusk: 0xa8d8ff, hemiSky: 0xdff8ff, hemiGround: 0x9fd1b8, night: 0x4f8fb0 },
    car: { body: 0x0091ea, accent: 0x7dfff0, tail: 0x8f7dff },
    flowers: [0x7debff, 0xb1a6ff, 0x9dffcf, 0xe0f7ff],
    crystals: [0x6ff0e8, 0x9fb8ff, 0xc7a6ff],
    mushrooms: [0x7fd6ff, 0xa58cff, 0x7fffc4],
    grass: 0x7fcfa0,
    stone: 0xb8d8d6,
    particles: 0xc8fff6,
    glow: 0.85,
    nightFloor: 0,
  },
  {
    id: 'cosmic-night',
    name: 'Cosmic Night',
    css: { accent: '#9a8cff', accentSoft: '#c8c4ec' },
    sky: {
      dayTop: 0x2a2360,
      dayHorizon: 0x6b4f9e,
      duskTop: 0x1c1747,
      duskHorizon: 0x5a3c86,
      nightTop: 0x070a1f,
      nightHorizon: 0x24194a,
    },
    ground: { base: 0x3a3f70, detail: 0x4a5a8c, path: 0x8a86c4, rim: 0x2f2a5a },
    light: { sun: 0xb8b0ff, dusk: 0x9c7bff, hemiSky: 0x6c64c8, hemiGround: 0x2b2650, night: 0x5850a8 },
    car: { body: 0x3d5afe, accent: 0x9ee7ff, tail: 0xff9e80 },
    flowers: [0xb58cff, 0x7fdcff, 0xff9ee6, 0xfff09e],
    crystals: [0x8f7dff, 0x6ff0ff, 0xff8fe0],
    mushrooms: [0x7f6bff, 0x48d1cc, 0xff9e80],
    grass: 0x5a78a8,
    stone: 0x55557a,
    particles: 0xe2dcff,
    glow: 1,
    nightFloor: 0.55,
  },
]);

export const THEME_IDS = THEMES.map((t) => t.id);

export const getTheme = (id) => THEMES.find((t) => t.id === id) ?? THEMES[0];

export function nextThemeId(id) {
  const i = THEME_IDS.indexOf(id);
  return THEME_IDS[(i + 1) % THEME_IDS.length];
}
