import { expect, test } from '@playwright/test';

/** Loads the built app with debug hooks and a fixed seed, waiting for READY. */
async function open(page, query = '') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`./?hooks&seed=2025${query}`);
  await page.waitForFunction(() => window.__PUKU__?.state() === 'ready', null, { timeout: 45_000 });
  return errors;
}

async function begin(page) {
  await page.getByTestId('begin').click();
  await expect.poll(() => page.evaluate(() => window.__PUKU__.state())).toBe('playing');
}

const car = (page) => page.evaluate(() => window.__PUKU__.car());
const state = (page) => page.evaluate(() => window.__PUKU__.state());

test.describe('journey', () => {
  test('loads, shows the welcome screen and begins @smoke', async ({ page }) => {
    const errors = await open(page);
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Starfall Meadow' })).toBeVisible();
    await expect(page.getByTestId('begin')).toBeFocused();
    await begin(page);
    await expect(page.locator('#welcome')).toBeHidden();
    await expect(page.getByTestId('counter')).toContainText('0 / 18');
    expect(errors).toEqual([]);
  });

  test('keyboard drives the car and the speedometer keeps its markup @smoke', async ({ page }) => {
    await open(page);
    await begin(page);
    const start = await car(page);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1500);
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(500);
    await page.keyboard.up('KeyA');
    await page.keyboard.up('KeyW');
    const moved = await car(page);
    expect(Math.hypot(moved.x - start.x, moved.z - start.z)).toBeGreaterThan(3);
    expect(moved.heading).toBeGreaterThan(start.heading);

    const speedo = page.getByTestId('speedometer');
    await expect(speedo.locator('[data-ref="speed"]')).toHaveCount(1);
    await expect(speedo.locator('[data-ref="speedBar"]')).toHaveCount(1);
    await expect(speedo.locator('.speedo__unit')).toHaveText('km/h');
    await expect(speedo.locator('[data-ref="speed"]')).not.toHaveText('0');
  });

  test('keys release when the window loses focus (no stuck acceleration)', async ({ page }) => {
    await open(page);
    await begin(page);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(300);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(2500);
    const c = await car(page);
    expect(c.speed).toBe(0); // coasted to a stop even though keyup never arrived
    await page.keyboard.up('KeyW');
  });

  test('discovering a memory pauses driving, plays media and resumes on close @smoke', async ({ page }) => {
    await open(page);
    await begin(page);
    await page.evaluate(() => window.__PUKU__.parkAt(0));
    await expect(page.getByTestId('interact')).toBeVisible();

    await page.keyboard.press('KeyE');
    const dialog = page.getByTestId('memory-dialog');
    await expect(dialog).toBeVisible();
    expect(await state(page)).toBe('viewing-memory');
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('First Glances');
    await expect(dialog.locator('video')).toHaveAttribute('src', /memory-01\.mp4$/);
    await expect(page.getByTestId('counter')).toContainText('1 / 18');

    // Driving keys do nothing behind the dialog.
    const before = await car(page);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(600);
    await page.keyboard.up('KeyW');
    const during = await car(page);
    expect(during.x).toBe(before.x);
    expect(during.z).toBe(before.z);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect.poll(() => state(page)).toBe('playing'); // 'close' fires asynchronously
    await expect(dialog.locator('video')).not.toHaveAttribute('src', /.+/); // media released

    // Re-discovering the same memory does not inflate progress.
    await page.keyboard.press('KeyE');
    await expect(dialog).toBeVisible();
    await page.getByRole('button', { name: 'Close memory' }).click();
    await expect(page.getByTestId('counter')).toContainText('1 / 18');
  });

  test('theme switching updates the world and HUD accent', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    const select = page.getByTestId('theme-select');
    await expect(select).toHaveValue('enchanted-dream');
    const accentBefore = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent'));
    await select.selectOption('cosmic-night');
    await expect.poll(() => page.evaluate(() => window.__PUKU__.theme())).toBe('cosmic-night');
    await expect.poll(() => page.evaluate(() => window.__PUKU__.game.themes.transitioning)).toBe(false);
    const accentAfter = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent'));
    expect(accentAfter).not.toBe(accentBefore);
    const ground = await page.evaluate(() => window.__PUKU__.game.themes.palette.ground.base.getHex());
    expect(ground).toBe(0x3a3f70);
    await page.keyboard.press('Escape');
    await expect(page.locator('#settings-dialog')).toBeHidden();
  });

  test('mini-map toggles with T and the toolbar button', async ({ page }) => {
    await open(page);
    await begin(page);
    const map = page.locator('.minimap');
    await expect(map).toBeVisible();
    await page.keyboard.press('KeyT');
    await expect(map).toBeHidden();
    await page.getByRole('button', { name: /Toggle mini-map/ }).click();
    await expect(map).toBeVisible();
  });

  test('pause menu, journal and settings pause and resume driving', async ({ page }) => {
    await open(page);
    await begin(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-dialog')).toBeVisible();
    expect(await state(page)).toBe('paused');
    await page.getByRole('button', { name: 'Journal', exact: true }).click();
    await expect(page.locator('#journal-dialog')).toBeVisible();
    await expect(page.locator('#journal-dialog')).toContainText('0 of 18 found');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect.poll(() => state(page)).toBe('playing');

    await page.keyboard.press('KeyJ');
    await expect(page.locator('#journal-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect.poll(() => state(page)).toBe('playing');
  });

  test('settings change graphics quality and persist preferences', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.locator('select[name="quality"]').selectOption('low');
    await expect.poll(() => page.evaluate(() => window.__PUKU__.preset())).toBe('low');
    await page.locator('input[name="reducedMotion"]').check();
    await expect(page.locator('html')).toHaveClass(/reduce-motion/);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('puku:settings')));
    expect(saved).toMatchObject({ quality: 'low', reducedMotion: true });
  });

  test('gallery lets you browse every memory without driving', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Browse memories without driving' }).click();
    const journal = page.locator('#journal-dialog');
    await expect(journal).toContainText('All 18 memories');
    await journal.getByRole('button', { name: 'Open memory: Fort Selfie' }).click();
    await expect(page.getByTestId('memory-dialog')).toBeVisible();
    await expect(page.getByTestId('memory-dialog').getByRole('heading', { level: 2 })).toHaveText('Fort Selfie');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('memory-dialog').getByRole('heading', { level: 2 })).toHaveText('Sandy Toes with Friends');
  });

  test('production build serves hashed assets and memory media under a relative base @smoke', async ({ page, request }) => {
    await open(page);
    const scripts = await page.locator('script[type="module"]').evaluateAll((s) => s.map((n) => n.getAttribute('src')));
    expect(scripts.every((src) => src.startsWith('./assets/'))).toBe(true);
    for (const path of [
      'assets/memories/memory-01-thumb.webp',
      'assets/memories/memory-18.webp',
      'assets/memories/memory-07.mp4',
      'favicon.svg',
    ]) {
      const res = await request.head(`./${path}`);
      expect(res.status(), path).toBe(200);
    }
  });
});

test.describe('mobile', () => {
  test('touch controls appear and drive the car @mobile', async ({ page }) => {
    await open(page);
    await page.getByTestId('begin').tap();
    await expect.poll(() => state(page)).toBe('playing');
    const touch = page.locator('#touch');
    await expect(touch).toBeVisible();
    const gas = page.getByRole('button', { name: 'Accelerate' });
    const box = await gas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await gas.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true });
    await page.waitForTimeout(1200);
    await gas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', isPrimary: true });
    const c = await car(page);
    expect(Math.hypot(c.x, c.z + 14)).toBeGreaterThan(2);
  });
});
