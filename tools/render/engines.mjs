#!/usr/bin/env node
/**
 * Where a one-line label sits in its control, in Chromium and in WebKit (Safari's engine, and the one Home
 * Assistant's iPhone app draws with), at 1×, 2× and 3×: the middle of the words less the middle of the control's box,
 * in CSS px (+ low, − high). The ink is the words' alone: each control is shot as it is and again with its words
 * transparent (`-webkit-text-fill-color`, which leaves an icon's fill and mask as they are), and the rows that differ
 * are the words. Their middle is their capitals' (`--metric caps`, the default: half a cap height over the baseline,
 * the last heavy row of ink, so neither a descender nor a letter taller than a capital moves it) or their ink's
 * (`--metric ink`: from its first row of some weight to the baseline, for a script without capitals).
 *
 * Not a gate (CI has no WebKit libraries): a tool to see the two engines side by side, over the controls whose labels
 * `fluvy/labels.css` trims (#122); docs/development.md says how to run WebKit on a machine without root.
 *
 *   PLAYGROUND=http://127.0.0.1:5183/ node tools/render/engines.mjs [--only tabs-pills,chips] [--dpr 1,2,3]
 *     [--engines chromium,webkit] [--count 3] [--lang ja] [--metric ink]
 *   node tools/render/engines.mjs --page 'sheet=climate&width=360' --box '.fv-chip__pill'
 *
 * A control is a playground page and the selector of its boxes (Playwright's CSS, which reaches into shadow roots);
 * the first `--count` boxes that hold words are read, and a cell lists the offsets they give (two where boxes sit on
 * different fractions of a pixel).
 */
import { Buffer } from 'node:buffer';
import { inflateSync } from 'node:zlib';
import { chromium, webkit } from 'playwright';
import { launchOptions, parseArgs, PLAYGROUND } from './lib.mjs';

/** The controls read by default: a page each, and the box its words are centred in. */
const TABS = 'dashboard=home&width=360&icons=mixed';
/** The Activity page at an evening of its own, so its states and filters are there whatever the hour. */
const ACTIVITY = 'activity=1&live=0&at=2026-09-17T21:47:12';
const CONTROLS = [
  { name: 'tabs-pills', query: `${TABS}&tabs=pills&content=names`, box: 'ha-tab-group-tab' },
  { name: 'tabs-pills-both', query: `${TABS}&tabs=pills&content=both`, box: 'ha-tab-group-tab' },
  { name: 'tabs-fluvy', query: `${TABS}&tabs=fluvy&content=names`, box: 'ha-tab-group-tab' },
  { name: 'tabs-fluvy-both', query: `${TABS}&tabs=fluvy&content=both`, box: 'ha-tab-group-tab' },
  { name: 'chips', query: 'sheet=climate', box: '.fv-chip__pill' },
  { name: 'chips-names', query: 'sheet=lights', box: '.fv-chip__pill:has(.fv-chip__name)' },
  { name: 'badges', query: 'sheet=climate', box: '.fv-badge' },
  { name: 'buttons', query: 'sheet=devices-security', box: 'fluvy-keypad .fv-btn' },
  { name: 'buttons-44', query: 'sheet=devices-security', box: '.dv-open .fv-btn' },
  { name: 'row-buttons', query: 'sheet=inputs', box: '.in-value' },
  { name: 'select', query: 'panel=preferences', box: '.fv-select' },
  { name: 'panel-tabs', query: 'panel=appearance', box: '.pn-tabs .fv-chip__pill' },
  { name: 'panel-buttons', query: 'panel=preferences', box: '.pn-pair .fv-btn' },
  { name: 'date-pill', query: 'sheet=period', box: '.ep-date' },
  { name: 'today-pill', query: 'history=1&moment=week', box: '.fv-btn--pill' },
  { name: 'room-badge', query: 'sheet=rooms', box: '.am-area__badge' },
  { name: 'activity-state', query: ACTIVITY, box: '.av-state' },
  { name: 'activity-filters', query: ACTIVITY, box: '.av-filters .fv-chip__pill' },
  { name: 'chips-card', query: 'sheet=home-extras', box: 'fluvy-chips-card .fv-chip__pill' },
  { name: 'sheet-buttons', query: 'sheet=automations', box: 'fluvy-schedule-sheet .fv-btn' },
  { name: 'days', query: 'sheet=calendar', box: '.fv-day' },
];

const args = parseArgs(process.argv.slice(2), {
  only: '',
  dpr: '1,2,3',
  engines: 'chromium,webkit',
  count: '3',
  metric: 'caps',
  lang: 'en',
  page: '',
  box: '',
});
const list = (value) => value.split(',').filter(Boolean);
const ENGINES = { chromium, webkit };
const engines = list(args.engines);
const ratios = list(args.dpr).map(Number);
const count = Number(args.count);
const controls = args.page
  ? [{ name: args.box, query: args.page, box: args.box }]
  : CONTROLS.filter((control) => !args.only || list(args.only).includes(control.name));
if (
  !controls.length ||
  engines.some((engine) => !ENGINES[engine]) ||
  !['caps', 'ink'].includes(args.metric)
) {
  console.error(
    `--only takes ${CONTROLS.map((c) => c.name).join(', ')}; --engines chromium, webkit; --metric caps, ink`,
  );
  process.exit(2);
}

/** A screenshot's pixels: an 8-bit RGB or RGBA PNG, not interlaced (what a browser's screenshot is). */
function pixels(png) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const channels = { 2: 3, 6: 4 }[png[25]];
  if (png[24] !== 8 || !channels || png[28])
    throw new Error('not an 8-bit, non-interlaced RGB(A) PNG');
  const parts = [];
  for (let at = 8; at < png.length; at += 12 + png.readUInt32BE(at))
    if (png.toString('latin1', at + 4, at + 8) === 'IDAT')
      parts.push(png.subarray(at + 8, at + 8 + png.readUInt32BE(at)));
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const data = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? data[y * stride + x - channels] : 0;
      const b = y ? data[(y - 1) * stride + x] : 0;
      const c = x >= channels && y ? data[(y - 1) * stride + x - channels] : 0;
      const p = a + b - c;
      const paeth =
        Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
          ? a
          : Math.abs(p - b) <= Math.abs(p - c)
            ? b
            : c;
      const predictor = [0, a, b, (a + b) >> 1, paeth][filter];
      data[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  return { width, height, channels, data };
}

/** The words' ink in each row: how far the shot with words is from the shot without, summed across the row. */
function inkRows(withWords, without) {
  const { width, height, channels, data } = withWords;
  const rows = new Array(height).fill(0);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      for (let k = 0; k < 3; k++) {
        const at = (y * width + x) * channels + k;
        rows[y] += Math.abs(data[at] - without.data[at]);
      }
  return rows;
}

/**
 * The cap height of the words in a box, in CSS px: `1cap` in their font, the height `text-box` trims to. The words are
 * the box's first text, or the name its `::after` writes (a view tab's).
 */
const capHeight = (box) =>
  box.evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, (node) =>
      node.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
    );
    const words = walker.nextNode()?.parentElement;
    const style = words ? getComputedStyle(words) : getComputedStyle(el, '::after');
    const probe = document.createElement('span');
    for (const name of [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'fontOpticalSizing',
      'fontVariationSettings',
    ])
      probe.style[name] = style[name];
    Object.assign(probe.style, {
      position: 'absolute',
      visibility: 'hidden',
      display: 'block',
      height: '1cap',
    });
    document.body.append(probe);
    const cap = probe.getBoundingClientRect().height;
    probe.remove();
    return cap;
  });

/** A box's offset at `dpr`: the words' middle (by `metric`) less the box's, in CSS px; null when it holds no words. */
async function offset(page, box, dpr, metric) {
  await box.scrollIntoViewIfNeeded();
  const rect = await box.boundingBox();
  if (!rect?.height) return null;
  const top = Math.floor(rect.y);
  const clip = {
    x: Math.floor(rect.x),
    y: top,
    width: Math.ceil(rect.x + rect.width) - Math.floor(rect.x),
    height: Math.ceil(rect.y + rect.height) - top,
  };
  const shot = async () => pixels(await page.screenshot({ clip, animations: 'disabled' }));
  const withWords = await shot();
  await box.evaluate((el) => el.style.setProperty('-webkit-text-fill-color', 'transparent'));
  const without = await shot();
  await box.evaluate((el) => el.style.removeProperty('-webkit-text-fill-color'));
  const rows = inkRows(withWords, without);
  const peak = Math.max(...rows);
  if (!peak) return null;
  const baseline = top + (rows.findLastIndex((ink) => ink > peak * 0.5) + 1) / dpr;
  const middle =
    metric === 'ink'
      ? (top + rows.findIndex((ink) => ink > peak * 0.1) / dpr + baseline) / 2
      : baseline - (await capHeight(box)) / 2;
  return middle - (rect.y + rect.height / 2);
}

/** The offsets of a control's boxes, by `${control} ${dpr} ${engine}`. */
const results = new Map();
for (const engine of engines) {
  const browser = await ENGINES[engine].launch(engine === 'chromium' ? launchOptions : {});
  for (const control of controls)
    for (const dpr of ratios) {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: dpr,
        reducedMotion: 'reduce',
      });
      await page.goto(`${PLAYGROUND}?${control.query}&lang=${args.lang}`);
      await page.waitForSelector('html[data-ready="1"]');
      await page.waitForTimeout(600);
      const seen = [];
      for (const box of await page.locator(control.box).all()) {
        if (seen.length === count) break;
        if (!(await box.isVisible())) continue;
        const value = await offset(page, box, dpr, args.metric);
        if (value !== null) seen.push(value);
      }
      results.set(`${control.name} ${dpr} ${engine}`, seen);
      await page.close();
    }
  await browser.close();
}

const signed = (value) => `${value >= -0.005 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;
const cell = (offsets) => (offsets.length ? [...new Set(offsets.map(signed))].join(' ') : 'none');
const COLUMN = 28;
const width = Math.max(...controls.map((c) => c.name.length));
console.log(
  `${''.padEnd(width)}   ${ratios.map((dpr) => `${dpr}× ${engines.join(' / ')}`.padEnd(COLUMN)).join('')}`,
);
for (const { name } of controls)
  console.log(
    `${name.padEnd(width)}   ${ratios
      .map((dpr) =>
        engines
          .map((engine) => cell(results.get(`${name} ${dpr} ${engine}`)))
          .join(' / ')
          .padEnd(COLUMN),
      )
      .join('')}`,
  );
