#!/usr/bin/env node
/**
 * A page left open through an update (#132): the built bundle, not the playground, served twice under a stand-in Home
 * Assistant as the integration serves it, each build from a folder of its own (`/fluvy-frontend/<version>-<stamp>/`)
 * and the old folder gone once the server has moved on. The build in `custom_components/fluvy/frontend` (run
 * `pnpm build` first) is the old one, and the same files under another version and folder the new one; or two builds
 * of your own: `node interactions-update.mjs <old frontend dir> <new frontend dir>`. Proves, in Chromium, in WebKit
 * and in an Android-like WebView (a persistent profile, a service worker that answers from its cache first as Home
 * Assistant's does):
 * - a dashboard left open says "Fluvy was updated · Reload" in Home Assistant's toast when the connection comes back on
 *   the new build, before anything fails; and when a card's editor opened from the card picker cannot be fetched;
 * - Reload loads the new build, past the worker's cached page, and the address loses its mark;
 * - left untouched for a minute, a dashboard reloads by itself once: a cache that brings the old build back says so
 *   and never reloads again; one being edited, a dialog open or the settings panel never reloads by itself;
 * - the settings panel opened after the update (Home Assistant imports its new module, which stands down) says so;
 * - a build from before 1.17 running (no watch of its own): the new one says so itself, only where it is the served one.
 *
 *   node interactions-update.mjs        (`pnpm visual` runs it with the suites)
 */
import { existsSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { launchOptions } from './lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = { '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2' };
const scratch = await mkdtemp(join(tmpdir(), 'fluvy-update-'));

/** A build: its folder on the server, its version, the directory its files are in. */
const buildIn = async (dir) => {
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  return { dir, version: manifest.version, folder: `${manifest.version}-${manifest.build}` };
};
const [oldDir, newDir] = process.argv.slice(2);
const OLD = await buildIn(oldDir ?? join(ROOT, 'custom_components', 'fluvy', 'frontend')).catch(
  () => {
    console.error('no build (run pnpm build)');
    process.exit(1);
  },
);
/** The same files, as the next release: another version in its entry, another folder. */
async function nextOf(build) {
  const dir = join(scratch, 'next');
  await cp(build.dir, dir, { recursive: true });
  const entry = await readFile(join(dir, 'fluvy.js'), 'utf8');
  const version = `${build.version}-next`;
  const quoted = `"${build.version}"`;
  if (entry.split(quoted).length !== 2) throw new Error(`fluvy.js names ${quoted} other than once`);
  await writeFile(join(dir, 'fluvy.js'), entry.replace(quoted, `"${version}"`));
  return { dir, version, folder: `${version}-${build.folder.slice(build.version.length + 1)}` };
}
const NEW = newDir ? await buildIn(newDir) : await nextOf(OLD);

/** What the server serves: a build, and whether a cache still answers the old one's page and files. */
const server = { build: OLD, stuck: false };
const loaderOf = (build) => `/fluvy-frontend/${build.folder}/loader.js`;
/** The version of the copy from before 1.17 that `?older=1` stands in for: never one of the builds served. */
const OLDER = '1.16.0';

/**
 * Home Assistant's page as far as Fluvy asks it, before the loader (its `extra_module_url`): the app element with its
 * `hass` (the panels, the connection's `ready` and its panels event, `get_panels` answered by the server), its toasts
 * drawn as a bar with their action, a worker registered as Home Assistant registers its own. `?older=1`: a build from
 * before 1.17 runs already (`__fluvy` with no watch).
 */
const page = (loader) => `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body>
<script>
(() => {
  const ready = new Set();
  const panelEvents = new Set();
  window.toasts = [];
  window.reconnect = () => ready.forEach((listener) => listener());
  window.panelsChanged = () => panelEvents.forEach((listener) => listener());
  if (new URLSearchParams(location.search).has('older')) window.__fluvy = { version: '${OLDER}' };
  const app = document.createElement('home-assistant');
  app.addEventListener('hass-notification', (event) => {
    const toast = event.detail;
    window.toasts.push({ id: toast.id, message: toast.message, action: toast.action?.text, duration: toast.duration });
    document.querySelector('#toast')?.remove();
    const bar = Object.assign(document.createElement('div'), { id: 'toast', textContent: toast.message + ' ' });
    const button = Object.assign(document.createElement('button'), { textContent: toast.action.text });
    button.addEventListener('click', () => toast.action.action());
    bar.append(button);
    document.body.append(bar);
  });
  const panels = () => fetch('/api/panels').then((response) => response.json());
  app.hass = {
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: 'language' },
    config: { time_zone: 'UTC', unit_system: { temperature: '°C' } },
    user: { is_admin: true, name: 'Ada' },
    themes: { darkMode: false },
    states: {}, entities: {}, devices: {}, areas: {},
    panels: { lovelace: { component_name: 'lovelace', url_path: 'lovelace' }, fluvy: { component_name: 'custom', url_path: 'fluvy' } },
    localize: (key) => key,
    connection: {
      subscribeMessage: () => Promise.resolve(() => undefined),
      addEventListener: (type, listener) => type === 'ready' && ready.add(listener),
      removeEventListener: (type, listener) => ready.delete(listener),
      subscribeEvents: (callback, type) => {
        if (type === 'panels_updated') panelEvents.add(callback);
        return Promise.resolve(() => undefined);
      },
    },
    callWS: (message) => (message.type === 'get_panels' ? panels() : Promise.reject(new Error('not here'))),
    callService: () => Promise.resolve(),
  };
  document.body.append(app);
  // Home Assistant's settings panel, opened after the update: it imports the panel's module the server names now
  window.openPanel = async () => {
    history.pushState(null, '', '/fluvy');
    window.dispatchEvent(new CustomEvent('location-changed'));
    await import((await panels()).fluvy.config._panel_custom.module_url).catch(() => undefined);
    document.body.append(document.createElement('fluvy-panel'));
  };
  if (new URLSearchParams(location.search).has('worker')) navigator.serviceWorker?.register('/sw.js');
})();
</script>
<script type="module" src="${loader}"></script>
</body></html>`;

/** Home Assistant's worker as far as this matters: every page and file it has seen is answered from its cache first. */
const WORKER = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;
  event.respondWith(caches.open('file-cache').then(async (cache) => {
    const cached = await cache.match(event.request);
    const network = fetch(event.request).then((response) => {
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    });
    return cached ?? network;
  }));
});`;

const http = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const send = (status, type, body, headers = {}) => {
    response.writeHead(status, { 'content-type': type, ...headers });
    response.end(body);
  };
  if (url.pathname === '/sw.js') return send(200, 'text/javascript', WORKER);
  if (url.pathname === '/api/panels')
    return send(
      200,
      'application/json',
      JSON.stringify({
        lovelace: { component_name: 'lovelace', url_path: 'lovelace', config: null },
        fluvy: {
          component_name: 'custom',
          url_path: 'fluvy',
          config: { _panel_custom: { name: 'fluvy-panel', module_url: loaderOf(server.build) } },
        },
      }),
    );
  const file = /^\/fluvy-frontend\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (file) {
    const build = [OLD, NEW].find((b) => b.folder === file[1]);
    const served = build === server.build || (server.stuck && build === OLD);
    if (!build || !served) return send(404, 'text/plain', 'Not Found');
    try {
      const body = await readFile(join(build.dir, normalize(file[2]).replace(/^(\.\.[/\\])+/, '')));
      // as the integration serves a build's folder: cacheable for good, its URL changes with it
      return send(200, TYPES[extname(file[2])] ?? 'application/octet-stream', body, {
        'cache-control': 'public, max-age=31536000, immutable',
      });
    } catch {
      return send(404, 'text/plain', 'Not Found');
    }
  }
  return send(200, 'text/html', page(loaderOf(server.stuck ? OLD : server.build)), {
    'cache-control': 'no-cache',
  });
});
await new Promise((resolve) => http.listen(0, '127.0.0.1', () => resolve(undefined)));
const BASE = `http://127.0.0.1:${http.address().port}`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Whether `test` comes true within `ms`, asked every tenth of a second (a page may be reloading meanwhile). */
async function until(test, ms = 15000) {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (await test().catch(() => false)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}
/** Whether the tab has loaded `count` pages and its bundle runs `build`. */
const runs = (tab, loads, count, build) =>
  until(
    async () =>
      loads.length === count &&
      (await tab.evaluate(() => window.__fluvy?.version)) === (build.version ?? build),
  );
/** A tab on `path` with the old build served, its clock ours, its page loads counted, the old build running. */
async function open(context, path) {
  server.build = OLD;
  server.stuck = false;
  const tab = await context.newPage();
  await tab.clock.install();
  const loads = [];
  tab.on('load', () => loads.push(tab.url()));
  await tab.goto(`${BASE}${path}`);
  // an older copy already running keeps its own version: the loader stands down beside it
  const running = new URL(path, BASE).searchParams.has('older') ? OLDER : OLD;
  if (!(await runs(tab, loads, 1, running))) throw new Error(`${path}: the old build does not run`);
  return { tab, loads };
}
const toasts = (tab) => tab.evaluate(() => window.toasts);
/** Whether the page says "Fluvy was updated · Reload" in Home Assistant's toast, which stays (within ten seconds). */
const said = (tab) =>
  until(async () => {
    const list = await toasts(tab);
    return (
      list.length > 0 &&
      list.every(
        (t) =>
          t.id === 'fluvy-update' &&
          t.message === 'Fluvy was updated' &&
          t.action === 'Reload' &&
          t.duration === -1,
      )
    );
  }, 10000);
/** The toast's Reload, clicked or tapped (a page that says nothing has none: the checks after it say so). */
const reload = (tab, how) => {
  const button = tab.locator('#toast button');
  return (how === 'tap' ? button.tap({ timeout: 2000 }) : button.click({ timeout: 2000 })).catch(
    () => undefined,
  );
};
/** Lets the page's minute untouched pass, and its look once more. */
const untouched = async (tab) => {
  await tab.clock.fastForward(61_000);
  await tab.clock.fastForward(5_000);
  await tab.waitForTimeout(600);
};
/** A card's editor as the card picker opens it: Home Assistant awaits it and says what failed in its place. */
const openEditor = (tab) =>
  tab.evaluate(() =>
    window.customElements
      .get('fluvy-tile-card')
      .getConfigElement()
      .then(
        () => 'loaded',
        (error) => String(error),
      ),
  );

async function suite(engine, context, label) {
  // the connection comes back on the new build: said before anything fails; Reload loads the new build, once
  {
    const { tab, loads } = await open(context, '/lovelace/0');
    server.build = NEW;
    await tab.evaluate(() => window.reconnect());
    check(
      `${label}: the connection back on a new build says "Fluvy was updated · Reload"`,
      await said(tab),
      JSON.stringify(await toasts(tab)),
    );
    await reload(tab, 'click');
    check(`${label}: Reload runs the new build`, await runs(tab, loads, 2, NEW), NEW.folder);
    await tab.waitForTimeout(400);
    check(
      `${label}: …its address without the mark, and nothing more to say`,
      !new URL(tab.url()).searchParams.has('fluvy_reload') && (await toasts(tab)).length === 0,
      tab.url(),
    );
    await untouched(tab);
    check(`${label}: …and it stays`, loads.length === 2, loads.join(' → '));
    await tab.close();
  }
  // a card's editor opened from the card picker, no reconnect seen: the failure asks, and an edit never reloads
  {
    const { tab, loads } = await open(context, '/lovelace/0?edit=1');
    server.build = NEW;
    const editor = await openEditor(tab);
    check(`${label}: a card's editor cannot be fetched`, editor !== 'loaded', editor.slice(0, 110));
    check(`${label}: …and the page says so`, await said(tab), JSON.stringify(await toasts(tab)));
    await untouched(tab);
    check(`${label}: …and a dashboard being edited never reloads by itself`, loads.length === 1);
    await tab.close();
  }
  if (engine === 'webkit') return;
  // untouched for a minute, once by itself: a touch puts it off, a cache that brings the old build back only says so
  {
    const { tab, loads } = await open(context, '/lovelace/0');
    server.build = NEW;
    server.stuck = true;
    await tab.evaluate(() => window.reconnect());
    await said(tab);
    await tab.clock.fastForward(30_000);
    await tab.mouse.click(5, 5);
    await tab.clock.fastForward(40_000);
    await tab.waitForTimeout(300);
    check(`${label}: a touch puts the reload off`, loads.length === 1);
    await untouched(tab);
    check(
      `${label}: untouched a minute, the dashboard reloads by itself`,
      await runs(tab, loads, 2, OLD),
      loads.join(' → '),
    );
    check(`${label}: …the old build back from a cache says so again`, await said(tab));
    await untouched(tab);
    await untouched(tab);
    check(`${label}: …and never reloads again`, loads.length === 2, loads.join(' → '));
    await tab.close();
  }
  // a dialog open: never by itself, and once it has closed
  {
    const { tab, loads } = await open(context, '/lovelace/0');
    await tab.evaluate(() => window.history.pushState({ dialog: 'ha-more-info-dialog' }, ''));
    server.build = NEW;
    await tab.evaluate(() => window.reconnect());
    await said(tab);
    await untouched(tab);
    check(`${label}: a dialog open, the page never reloads by itself`, loads.length === 1);
    await tab.evaluate(() => window.history.replaceState(null, ''));
    await untouched(tab);
    check(`${label}: …and does once it closed`, await runs(tab, loads, 2, NEW), loads.join(' → '));
    await tab.close();
  }
  // the settings panel opened after the update: its new module stands down and the page says so, never by itself
  {
    const { tab, loads } = await open(context, '/lovelace/0');
    server.build = NEW;
    await tab.evaluate(() => window.openPanel());
    check(
      `${label}: the settings panel opened after the update says so, once`,
      (await said(tab)) && (await toasts(tab)).length === 1,
      JSON.stringify(await toasts(tab)),
    );
    await untouched(tab);
    check(`${label}: …and the panel never reloads by itself`, loads.length === 1);
    await tab.close();
  }
  // a build from before 1.17 running: the new one says so itself, only where the server serves it
  {
    const { tab, loads } = await open(context, '/lovelace/0?older=1');
    check(
      `${label}: an older build running and this one served: this one says so`,
      await said(tab),
    );
    await untouched(tab);
    check(`${label}: …and reloads by itself once`, await until(async () => loads.length === 2));
    await untouched(tab);
    check(`${label}: …never twice`, loads.length === 2, loads.join(' → '));
    await tab.close();
    server.build = NEW;
    server.stuck = true;
    const stale = await context.newPage();
    await stale.goto(`${BASE}/lovelace/0?older=1`);
    await stale.waitForTimeout(1500);
    check(
      `${label}: …and says nothing where it is not the served one`,
      (await toasts(stale)).length === 0,
    );
    await stale.close();
  }
}

// Chromium and WebKit (which names no file when a module fails to load); WebKit where it is installed (CI installs
// Chromium alone: its runs say they left WebKit out, and a machine with it runs both)
const hasWebkit = existsSync(webkit.executablePath());
if (!hasWebkit) console.log('· WebKit is not installed here: its pass is left out');
for (const [engine, launcher] of [
  ['chromium', () => chromium.launch(launchOptions)],
  ...(hasWebkit ? [['webkit', () => webkit.launch()]] : []),
]) {
  const browser = await launcher();
  await suite(engine, await browser.newContext(), engine);
  await browser.close();
}

// an Android-like WebView: a phone's profile that persists, and Home Assistant's worker answering from its cache
{
  const profile = join(scratch, 'webview');
  const phone = {
    ...launchOptions,
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 Home Assistant/2026.11',
  };
  const context = await chromium.launchPersistentContext(profile, phone);
  const { tab, loads } = await open(context, '/lovelace/0?worker=1');
  await tab.waitForFunction(() => window.navigator.serviceWorker.controller !== null);
  // the worker answers the page and the old build's files from now on
  await tab.reload();
  await runs(tab, loads, 2, OLD);
  server.build = NEW;
  await tab.evaluate(() => window.location.reload());
  check(
    'webview: a plain reload brings the old build back from the worker’s cache',
    await runs(tab, loads, 3, OLD),
  );
  check('webview: …which says "Fluvy was updated · Reload"', await said(tab));
  await reload(tab, 'tap');
  check(
    'webview: Reload runs the new build past the worker’s cache',
    await runs(tab, loads, 4, NEW),
    NEW.folder,
  );
  await untouched(tab);
  check('webview: …and stays', loads.length === 4 && (await toasts(tab)).length === 0);
  await context.close();
  const again = await chromium.launchPersistentContext(profile, phone);
  const reopened = await again.newPage();
  await reopened.goto(`${BASE}/lovelace/0?worker=1`);
  check(
    'webview: the app opened again runs the new build',
    await until(
      async () => (await reopened.evaluate(() => window.__fluvy?.version)) === NEW.version,
    ),
  );
  await again.close();
}

http.close();
await rm(scratch, { recursive: true, force: true });
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
