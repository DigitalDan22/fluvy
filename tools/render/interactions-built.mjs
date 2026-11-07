#!/usr/bin/env node
/**
 * The built bundle, not the playground: what a page says before the settings panel or the Activity page was ever
 * opened. The playground registers every part of English at start; the bundle registers a lazy family's part only
 * when the family's chunk lands, so this is where a word said outside its chunk shows — as a key. Serves
 * `custom_components/fluvy/frontend` (run `pnpm build` first) on a dashboard's address under a bare stand-in Home
 * Assistant, in English, in German and in the newest languages (Polish, Simplified Chinese), and proves:
 * - a language's chunk lands and its catalogue is read (the chunk's `default`): every word below is the language's own;
 * - a wall's pieces (its way back, its corner both ways, its toast both ways) say their words, and the panel's chunk
 *   never loaded;
 * - the schedule sheet's details say "Open in Home Assistant" and "Traces", and the Activity page's chunk never
 *   loaded;
 * - a card every page carries keeps its editor's form in the forms chunk: no dashboard fetches it, and the card's
 *   editor brings it, worded;
 * - on a page that wears another theme, the patches leave Home Assistant's stand-in elements as Home Assistant draws
 *   them (a chart's font and colour, an icon's path, no attribute of ours, no Inter or sheet in HACS's frame, the
 *   page's chrome), and once Home Assistant applies the Fluvy theme they take Fluvy's;
 * - where the house's look covers every page, the page's background and theme colour and the frame's mark follow Home
 *   Assistant's theme as Home Assistant applies it: Fluvy's on the Fluvy theme, the other theme's (or Home Assistant's
 *   first colour) once it leaves, though Home Assistant wrote them while Fluvy's sheet was still on;
 * - a view Home Assistant themed with the theme named Fluvy before the bundle arrived (Linen's colours written on it)
 *   wears the house's palette, light and dark, and one in another theme keeps its own (#72).
 *
 *   node interactions-built.mjs        (`pnpm visual` runs it with the suites)
 */
import { mdiPencil } from '@mdi/js';
import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/suite.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FRONTEND = join(ROOT, 'custom_components', 'fluvy', 'frontend');
const LOCALES = join(ROOT, 'packages', 'core', 'src', 'i18n', 'locales');
const TYPES = { '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2' };

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const manifest = await readJson(join(FRONTEND, 'manifest.json')).catch(() => {
  console.error(`${FRONTEND}: no build (run pnpm build)`);
  process.exit(1);
});
/** A chunk's file by its name (`chunks/wall-<hash>.js`). */
const chunk = (name) =>
  Object.keys(manifest.files).find((file) =>
    new RegExp(`^chunks/${name}-[\\w-]{8}\\.js$`).test(file),
  );

/** The words each language must say: English from all its parts, every other language from its catalogue. */
const english = {};
for (const part of await readdir(join(LOCALES, 'en')))
  Object.assign(english, await readJson(join(LOCALES, 'en', part)));
const LANGUAGES = ['en', 'de', 'pl', 'zh-Hans'];
const WORDS = { en: english };
for (const lang of LANGUAGES.slice(1)) WORDS[lang] = await readJson(join(LOCALES, `${lang}.json`));

/** Another theme, as Home Assistant applies it inline on `<html>`: its font, its primary, its page and bar colours. */
const OTHER_THEME =
  '--ha-font-family-body: Georgia, serif; --primary-color: #ff9800; --primary-background-color: #fafafa; --app-theme-color: #ff9800';
/** The Fluvy theme, as Home Assistant applies it: its sentinel, its primary, its page and bar colours. */
const FLUVY_THEME =
  '--fluvy-theme: 1; --primary-color: #856529; --primary-background-color: #f6f1e7; --app-theme-color: #fffaf0';
/**
 * A dashboard's page: Home Assistant's app element and the bundle, in the language asked for (`?lang=`), with Home
 * Assistant's theme colour, and another theme on it with `?theme=other`.
 */
const page = (lang, other) =>
  `<!doctype html><html lang="${lang}" style="${other ? OTHER_THEME : ''}"><head><meta charset="utf-8"><meta name="theme-color" content="#03a9f4"></head><body><home-assistant></home-assistant><script type="module" src="/fluvy.js"></script></body></html>`;
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname.startsWith('/lovelace/')) {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(
      page(url.searchParams.get('lang') ?? 'en', url.searchParams.get('theme') === 'other'),
    );
    return;
  }
  const file = join(FRONTEND, normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await launch();
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/**
 * In the page, before the bundle: the bare Home Assistant a piece needs (a language, an administrator, one
 * automation), and every word a piece shows — its text and its labels, through the shadow roots.
 */
function standIn() {
  window.standInHass = (language) => ({
    language,
    locale: { language, number_format: 'language', time_format: 'language' },
    config: { time_zone: 'UTC', unit_system: { temperature: '°C' } },
    user: { is_admin: true, name: 'Ada' },
    states: {
      'automation.morning': {
        entity_id: 'automation.morning',
        state: 'on',
        attributes: { friendly_name: 'Morning', id: 'morning' },
        last_changed: '2026-10-17T06:00:00Z',
        last_updated: '2026-10-17T06:00:00Z',
        context: { id: '', parent_id: null, user_id: null },
      },
    },
    entities: {},
    devices: {},
    areas: {},
    themes: { darkMode: false },
    localize: (key) => key,
  });
  window.shownWords = () => {
    const out = [];
    const walk = (root) => {
      for (let node = root.firstChild; node; node = node.nextSibling) {
        // 3: a text, 1: an element
        if (node.nodeType === 3) out.push(node.textContent.trim());
        if (node.nodeType !== 1) continue;
        for (const name of ['aria-label', 'title'])
          if (node.hasAttribute(name)) out.push(node.getAttribute(name));
        if (node.shadowRoot) walk(node.shadowRoot);
        walk(node);
      }
    };
    walk(document.body);
    return out.filter(Boolean);
  };
}

for (const lang of LANGUAGES) {
  const tab = await browser.newPage();
  const errors = [];
  tab.on('pageerror', (error) => errors.push(String(error)));
  await tab.addInitScript(standIn);
  await tab.goto(`${BASE}/lovelace/home?lang=${lang}`);
  // the bundle running (`window.__fluvy`), its families defined, the language it speaks here
  await tab.waitForFunction(() => Boolean(window.__fluvy), null, { timeout: 15000 });
  await tab.waitForFunction(() => Boolean(window.customElements.get('fluvy-automations-card')));
  if (lang !== 'en')
    await tab.waitForFunction(
      (name) => performance.getEntriesByType('resource').some((e) => e.name.includes(name)),
      `/chunks/lang-${lang}-`,
    );
  await tab.waitForTimeout(300);
  const fetched = () =>
    tab.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
  const formsAtStart = (await fetched()).some((name) => name.includes('/chunks/forms-'));

  // the wall's pieces, as the controller mounts them on a device that is a wall
  const wall = await tab.evaluate(
    async ({ file, lang }) => {
      await import(`/${file}`);
      const hass = window.standInHass(lang);
      const make = (tag, props) => Object.assign(document.createElement(tag), { hass, ...props });
      document.body.replaceChildren(
        make('fluvy-wall-back', {}),
        make('fluvy-wall-corner', { mode: 'button' }),
        make('fluvy-wall-corner', { mode: 'hold' }),
        make('fluvy-wall-toast', { kind: 'paused' }),
        make('fluvy-wall-toast', { kind: 'left' }),
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      return window.shownWords();
    },
    { file: chunk('wall'), lang },
  );
  const words = WORDS[lang];
  const wallWords = ['back', 'leave_tap', 'leave', 'paused', 'resume', 'left', 'return'].map(
    (key) => words.wall[key],
  );
  const missing = wallWords.filter((word) => !wall.includes(word));
  check(`${lang}: a wall's pieces say their words`, missing.length === 0, missing.join(', '));
  check(
    `${lang}: …without the settings panel's chunk`,
    !(await fetched()).some((name) => name.includes('/chunks/panel-')),
  );

  // the schedule sheet's details of an automation, as the automations card opens them
  const sheet = await tab.evaluate(
    async ({ file, lang }) => {
      await import(`/${file}`);
      const element = Object.assign(document.createElement('fluvy-schedule-sheet'), {
        hass: window.standInHass(lang),
      });
      document.body.replaceChildren(element);
      await element.updateComplete;
      const nothing = () => undefined;
      element.open({
        entity: 'automation.morning',
        alias: 'Morning',
        configId: 'morning',
        run: nothing,
        toggle: nothing,
      });
      await new Promise((resolve) => setTimeout(resolve, 400));
      return window.shownWords();
    },
    { file: chunk('automations-sheet'), lang },
  );
  const links = [words.automations.open_in_ha, words.common.trace];
  check(
    `${lang}: the schedule sheet's details say ${links.map((w) => `"${w}"`).join(' and ')}`,
    links.every((word) => sheet.includes(word)),
    sheet.slice(0, 12).join(' · '),
  );
  check(
    `${lang}: …without the Activity page's chunk`,
    !(await fetched()).some((name) => name.includes('/chunks/activity-')),
  );

  // the tile card's editor, as Home Assistant asks for it: the rows editor with the card's form, its fields worded
  check(`${lang}: a dashboard never fetches the cards' forms`, !formsAtStart);
  const editor = await tab.evaluate(async () => {
    const element = await window.customElements.get('fluvy-tile-card').getConfigElement();
    const { schema, computeLabel } = element.spec;
    return {
      tag: element.localName,
      fields: schema.length,
      size: computeLabel({ name: 'size' }, (key) => key),
    };
  });
  check(
    `${lang}: a card's editor brings its form, worded`,
    editor.tag === 'fluvy-rows-editor' && editor.fields > 0 && editor.size === words.editor.size,
    JSON.stringify(editor),
  );
  check(
    `${lang}: …from the forms chunk`,
    (await fetched()).some((name) => name.includes('/chunks/forms-')),
  );
  check(`${lang}: no page error`, errors.length === 0, errors.join(' | '));
  await tab.close();
}

/**
 * In the page, before the bundle: Home Assistant's elements the patches wrap, as far as the wrapped methods go — a
 * chart's theme and series, an icon's path, the more-info marquee, a settings list, a dashboard's root, the custom
 * panel that writes HACS's frame — and `exercise()`, which runs each of them as Home Assistant does and says what came
 * out and what of Fluvy's is on the page (attributes, the frame's fonts and sheets, the page's chrome).
 */
function haStandIns(pencil) {
  const define = (tag, klass) => window.customElements.define(tag, klass);
  const { HTMLElement } = window;
  define(
    'ha-chart-base',
    class extends HTMLElement {
      _createTheme() {
        return { textStyle: { fontFamily: 'Roboto, sans-serif' } };
      }
      _getSeries() {
        return [{ type: 'line', color: '#009ac7' }];
      }
    },
  );
  // (Lit's own `willUpdate`, which Home Assistant's icon inherits)
  define(
    'ha-svg-icon',
    class extends HTMLElement {
      willUpdate() {}
    },
  );
  define(
    'ha-marquee-text',
    class extends HTMLElement {
      _maxOffset = 40;
      _setupAnimation() {}
    },
  );
  define(
    'ha-config-navigation-list',
    class extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: 'open' }).innerHTML =
          '<ha-list-item-button><div class="icon-background"></div></ha-list-item-button>';
        this.shadowRoot.firstElementChild.href = '/config/areas';
      }
      updated() {}
    },
  );
  define(
    'hui-root',
    class extends HTMLElement {
      lovelace = { editMode: false, config: { views: [{ subview: true, title: 'Lamp' }] } };
      _curView = 0;
      updated() {}
    },
  );
  define(
    'ha-panel-custom',
    class extends HTMLElement {
      _createPanel() {
        this.append(document.createElement('iframe'));
      }
    },
  );
  window.exercise = () => {
    const one = (tag) =>
      document.querySelector(tag) ?? document.body.appendChild(document.createElement(tag));
    const chart = one('ha-chart-base');
    const icon = one('ha-svg-icon');
    const marquee = one('ha-marquee-text');
    const list = one('ha-config-navigation-list');
    const root = one('hui-root');
    const panel = one('ha-panel-custom');
    if (!panel.querySelector('iframe')) panel._createPanel();
    icon.path = pencil;
    icon.willUpdate(new Map([['path', undefined]]));
    marquee._setupAnimation();
    list.updated();
    root.updated();
    const frame = panel.querySelector('iframe').contentDocument;
    const ours = [];
    const walk = (node) => {
      for (const element of node.querySelectorAll('*')) {
        for (const { name } of element.attributes)
          if (/^(data-)?fluvy-|^overflowing$/.test(name))
            ours.push(`${element.localName}[${name}]`);
        if (element.shadowRoot) walk(element.shadowRoot);
      }
    };
    walk(document.body);
    return {
      font: chart._createTheme(getComputedStyle(document.documentElement)).textStyle.fontFamily,
      series: chart._getSeries()[0].color,
      icon: icon.path === pencil ? 'material' : 'ours',
      kept: icon.__fluvyMdi !== undefined,
      ours,
      frameFonts: [...frame.fonts].map((face) => face.family),
      frameSheets: frame.adoptedStyleSheets.length,
      background: document.documentElement.style.backgroundColor,
      themeColor: document.querySelector('meta[name=theme-color]').content,
    };
  };
}

{
  const tab = await browser.newPage();
  const errors = [];
  tab.on('pageerror', (error) => errors.push(String(error)));
  await tab.addInitScript(standIn);
  await tab.addInitScript(haStandIns, mdiPencil);
  await tab.goto(`${BASE}/lovelace/home?lang=en&theme=other`);
  await tab.waitForFunction(() => Boolean(window.__fluvy), null, { timeout: 15000 });
  await tab.waitForTimeout(300);
  const report = await tab.evaluate(() => window.__fluvy.shell.report());
  check(
    'another theme: every one of the shell’s wraps took',
    Object.values(report.patches).every((done) => done === true),
    JSON.stringify(report.patches),
  );
  const plain = await tab.evaluate(() => window.exercise());
  check(
    'another theme: the chart keeps Home Assistant’s font and blue',
    plain.font === 'Roboto, sans-serif' && plain.series === '#009ac7',
    `${plain.font} · ${plain.series}`,
  );
  check(
    'another theme: the icon keeps its Material path, looked up by nothing of ours',
    plain.icon === 'material' && !plain.kept,
  );
  check(
    'another theme: no attribute of Fluvy’s on Home Assistant’s elements',
    plain.ours.length === 0,
    plain.ours.join(', '),
  );
  check(
    'another theme: HACS’s frame gets neither Inter nor a sheet of ours',
    !plain.frameFonts.includes('Inter') && plain.frameSheets === 0,
    `${plain.frameFonts.join(', ')} · ${plain.frameSheets} sheets`,
  );
  check(
    'another theme: the page’s chrome is Home Assistant’s',
    plain.background === '' && plain.themeColor === '#03a9f4',
    `${plain.background} · ${plain.themeColor}`,
  );
  /** The font files the page fetched (`fonts/` beside the bundle). */
  const fonts = async () =>
    (await tab.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name))).filter(
      (name) => name.includes('/fonts/'),
    );
  check('another theme: the page fetches no font of ours', (await fonts()).length === 0);
  // Home Assistant applies the Fluvy theme: its sentinel, its font and its primary inline on <html>
  await tab.evaluate(() => {
    const style = document.documentElement.style;
    style.setProperty('--fluvy-theme', '1');
    style.setProperty('--ha-font-family-body', 'Inter, sans-serif');
    style.setProperty('--primary-color', '#856529');
  });
  await tab.waitForTimeout(600);
  const worn = await tab.evaluate(() => window.exercise());
  const fetchedFonts = await fonts();
  check(
    'the Fluvy theme: the page fetches Inter, both faces',
    ['inter-variable.woff2', 'inter-italic-variable.woff2'].every((file) =>
      fetchedFonts.some((name) => name.endsWith(`/fonts/${file}`)),
    ),
    fetchedFonts.join(', '),
  );
  check(
    'the Fluvy theme: the chart takes the page’s font and primary',
    worn.font === 'Inter, sans-serif' && worn.series === '#856529',
    `${worn.font} · ${worn.series}`,
  );
  check('the Fluvy theme: the icon draws Fluvy’s glyph', worn.icon === 'ours');
  check(
    'the Fluvy theme: the marquee, the list and the root carry their marks',
    ['ha-marquee-text[overflowing]', 'div[data-fluvy-glyph]', 'hui-root[fluvy-subview]'].every(
      (mark) => worn.ours.includes(mark),
    ),
    worn.ours.join(', '),
  );
  check(
    'the Fluvy theme: HACS’s frame gets Inter and its shell',
    worn.frameFonts.includes('Inter') && worn.frameSheets > 0,
    `${worn.frameFonts.join(', ')} · ${worn.frameSheets} sheets`,
  );
  check('the patches: no page error', errors.length === 0, errors.join(' | '));
  await tab.close();
}

/**
 * Home Assistant's `_applyTheme` (frontend `src/state/themes-mixin.ts`), in its order: the theme's name on the app, its
 * variables inline on `<html>`, then at once — before Fluvy hears of it — the page's background and the browser's theme
 * colour from what the page computes, the meta's first colour kept for a theme that names none.
 */
function applyTheme([name, css]) {
  const app = document.querySelector('home-assistant');
  app.hass = { ...app.hass, themes: { ...app.hass.themes, theme: name } };
  document.documentElement.setAttribute('style', css);
  const computed = getComputedStyle(document.documentElement);
  document.documentElement.style.backgroundColor = computed.getPropertyValue(
    '--primary-background-color',
  );
  const meta = document.querySelector('meta[name=theme-color]');
  if (!meta.hasAttribute('default-content'))
    meta.setAttribute('default-content', meta.getAttribute('content'));
  meta.setAttribute(
    'content',
    computed.getPropertyValue('--app-theme-color').trim() || meta.getAttribute('default-content'),
  );
}

{
  const tab = await browser.newPage();
  const errors = [];
  tab.on('pageerror', (error) => errors.push(String(error)));
  await tab.addInitScript(standIn);
  // the house: the look on every page, no frame; Home Assistant's app on another theme before the bundle runs
  await tab.addInitScript(() => {
    localStorage.setItem(
      'fluvy:settings',
      JSON.stringify({ house: { scope: 'everywhere', frame: false }, personal: {} }),
    );
    document.addEventListener('readystatechange', () => {
      const app = document.querySelector('home-assistant');
      if (app && !app.hass)
        app.hass = { ...window.standInHass('en'), themes: { theme: 'other', darkMode: false } };
    });
  });
  await tab.goto(`${BASE}/lovelace/home?lang=en&theme=other`);
  await tab.waitForFunction(() => Boolean(window.__fluvy), null, { timeout: 15000 });
  await tab.waitForTimeout(300);
  /** What the page shows of Fluvy, and its chrome beside the colours it computes now. */
  const read = () =>
    tab.evaluate(() => {
      const root = document.documentElement;
      const computed = getComputedStyle(root);
      // the page's colour as a background writes it
      const page = document.createElement('i').style;
      page.backgroundColor = computed.getPropertyValue('--primary-background-color');
      return {
        look: root.hasAttribute('fluvy-look'),
        noFrame: document.querySelector('home-assistant').hasAttribute('fluvy-no-frame'),
        background: root.style.backgroundColor,
        page: page.backgroundColor,
        themeColor: document.querySelector('meta[name=theme-color]').content,
        bar: computed.getPropertyValue('--app-theme-color').trim(),
      };
    });
  const apply = async (name, css) => {
    await tab.evaluate(applyTheme, [name, css]);
    await tab.waitForTimeout(400);
    return read();
  };
  const other = await read();
  check(
    'everywhere, on another theme: no look, no frame mark, Home Assistant’s chrome',
    !other.look && !other.noFrame && other.background === '' && other.themeColor === '#03a9f4',
    JSON.stringify(other),
  );
  const fluvy = await apply('Fluvy', FLUVY_THEME);
  check(
    'everywhere, the Fluvy theme: the look, the frame off as the house says, the look’s chrome',
    fluvy.look &&
      fluvy.noFrame &&
      fluvy.background === fluvy.page &&
      fluvy.background !== 'rgb(246, 241, 231)' &&
      fluvy.themeColor === fluvy.bar,
    JSON.stringify(fluvy),
  );
  const left = await apply('other', OTHER_THEME);
  check(
    'everywhere, back to another theme: its background and theme colour, no mark of ours',
    !left.look &&
      !left.noFrame &&
      left.background === 'rgb(250, 250, 250)' &&
      left.themeColor === '#ff9800',
    JSON.stringify(left),
  );
  await apply('Fluvy', FLUVY_THEME);
  const plain = await apply('default', '');
  check(
    'everywhere, then Home Assistant’s default theme: no background of ours, its first theme colour',
    !plain.look && plain.background === '' && plain.themeColor === '#03a9f4',
    JSON.stringify(plain),
  );
  check('the chrome: no page error', errors.length === 0, errors.join(' | '));
  await tab.close();
}

{
  const tab = await browser.newPage();
  const errors = [];
  tab.on('pageerror', (error) => errors.push(String(error)));
  await tab.addInitScript(standIn);
  // the house: Volt on every page; Home Assistant's app on the Fluvy theme, and two views it themed before the bundle
  // arrived as it themes a view (its record, then the theme's variables inline: the Fluvy file's Linen), one of them in
  // a theme of the person's own made from the same file
  await tab.addInitScript(() => {
    localStorage.setItem(
      'fluvy:settings',
      JSON.stringify({ house: { scope: 'everywhere', palette: 'volt' }, personal: {} }),
    );
    document.addEventListener('readystatechange', () => {
      const app = document.querySelector('home-assistant');
      if (!app || app.hass) return;
      app.hass = { ...window.standInHass('en'), themes: { theme: 'Fluvy', darkMode: false } };
      document.documentElement.setAttribute('style', '--fluvy-theme: 1; --primary-color: #856529');
      window.themeView = (view, name, dark) => {
        const linen = dark ? '#cebb9c' : '#856529';
        const vars = { '--fluvy-theme': '1', '--fluvy-palette': 'linen', '--fluvy-accent': linen };
        view.__themes = { cacheKey: dark ? `${name}__dark` : name, keys: {} };
        for (const [key, value] of Object.entries(vars)) view.style.setProperty(key, value);
      };
      for (const name of ['Fluvy', 'Sandstone']) {
        const view = document.createElement('hui-view-container');
        view.dataset.theme = name;
        view.attachShadow({ mode: 'open' }).innerHTML = '<slot></slot>';
        view.append(document.createElement('div'));
        window.themeView(view, name, false);
        document.body.append(view);
      }
    });
  });
  await tab.goto(`${BASE}/lovelace/home?lang=en`);
  await tab.waitForFunction(() => Boolean(window.__fluvy), null, { timeout: 15000 });
  await tab.waitForTimeout(300);
  /** What the page and the place of a card in each view read. */
  const read = () =>
    tab.evaluate(() => {
      const of = (element) => {
        const style = getComputedStyle(element);
        return ['--fluvy-palette', '--fluvy-accent'].map((name) =>
          style.getPropertyValue(name).trim(),
        );
      };
      const view = (name) => document.querySelector(`hui-view-container[data-theme="${name}"]`);
      return {
        page: of(document.documentElement),
        fluvy: of(view('Fluvy').firstElementChild),
        marked: view('Fluvy').hasAttribute('fluvy-themed'),
        other: of(view('Sandstone').firstElementChild),
        otherMarked: view('Sandstone').hasAttribute('fluvy-themed'),
      };
    });
  let views = await read();
  check(
    'a view themed Fluvy before the bundle arrived wears the house’s Volt, one in another theme keeps its Linen',
    views.marked &&
      views.page[0] === 'volt' &&
      views.fluvy.join() === views.page.join() &&
      !views.otherMarked &&
      views.other.join() === 'linen,#856529',
    JSON.stringify(views),
  );
  // Home Assistant goes dark: the page's theme again, then each view's
  await tab.evaluate(() => {
    const app = document.querySelector('home-assistant');
    app.hass = { ...app.hass, themes: { theme: 'Fluvy', darkMode: true } };
    document.documentElement.style.setProperty('--primary-color', '#cebb9c');
    for (const view of document.querySelectorAll('hui-view-container'))
      window.themeView(view, view.dataset.theme, true);
  });
  await tab.waitForTimeout(300);
  const light = views.page[1];
  views = await read();
  check(
    '…and in dark mode, the view themed Fluvy wears the house’s dark Volt, the other its dark Linen',
    views.marked &&
      views.page[1] !== light &&
      views.fluvy.join() === views.page.join() &&
      views.other.join() === 'linen,#cebb9c',
    JSON.stringify(views),
  );
  check('the themed views: no page error', errors.length === 0, errors.join(' | '));
  await tab.close();
}

await browser.close();
server.close();
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
