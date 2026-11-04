#!/usr/bin/env node
/**
 * Interaction tests for the Vehicle card (#84) on the playground's `vehicle` sheet: each integration's car found by its
 * own words; the rounds act on the car — unlocking, opening the boot and stopping a charge ask first in Home Assistant's
 * dialog, locking and the climate act at once, a hold opens what a round reads — and the charge cannot start unplugged;
 * the head, the battery and a row answer their taps; every frame at a card's width holds its declared height; the
 * strip's round gives way in half a section before a word would be cut; a car out of reach keeps its rounds where they
 * stand when they read; and in every language no round's word runs past its cell, nor the line or the head's line past
 * their column. Real cards on the playground's simulated hass. Exit code 1 on any failure.
 *   PLAYGROUND=http://127.0.0.1:5196/ node interactions-vehicle.mjs
 */
import { everyLanguage } from './lib.mjs';
import { calls, frame, moreInfo, reset, settle, startSuite, tapHead } from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;

/** The `n`th vehicle card of a frame. */
const card = (page, title, n = 0) => frame(page, title).locator('fluvy-vehicle-card').nth(n);
/** What a card says: its badge, its line, its rounds (label and word), its rows, its height and what it declares. */
const read = (locator) =>
  locator.evaluate((el) => {
    const root = el.shadowRoot;
    const t = (node) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
    return {
      badge: t(root.querySelector('.fv-badge')),
      sub: t(root.querySelector('.fv-card__sub')),
      line: t(root.querySelector('.vh-line')),
      rounds: [...root.querySelectorAll('.vh-control')].map((b) => ({
        label: b.getAttribute('aria-label'),
        word: t(b.querySelector('.vh-control__word')),
        still: b.disabled || b.getAttribute('aria-disabled') === 'true',
      })),
      rows: [...root.querySelectorAll('.vh-rows .fv-row')].map(t),
      height: Math.round(root.querySelector('[data-card]').getBoundingClientRect().height),
      declared: el.constructor.layoutHeight(el.config),
    };
  });
/** Whether any word of a card runs past its box: a round's word past its cell, the line or a head's line past theirs. */
const overflows = (locator) =>
  locator.evaluate((el) => {
    const root = el.shadowRoot;
    const out = [];
    for (const word of root.querySelectorAll('.vh-control__word')) {
      const cell = word.closest('.vh-control').getBoundingClientRect();
      const box = word.getBoundingClientRect();
      if (box.left < cell.left - 0.5 || box.right > cell.right + 0.5) out.push(word.textContent);
    }
    for (const line of root.querySelectorAll('.vh-line, .fv-card__sub, .fv-row__sub'))
      if (line.scrollWidth > line.clientWidth + 1) out.push(line.textContent);
    return out;
  });

const page = await suite.sheet('vehicle');
await page.evaluate(() => {
  window.__handed = [];
  document.body.addEventListener('hass-action', (event) => window.__handed.push(event.detail));
});
const handed = () => page.evaluate(() => window.__handed.splice(0));

/* ---------- each integration's car, by its own words ---------- */
{
  const tesla = await read(card(page, 'Teslemetry · charging at home'));
  check(
    'Teslemetry: charging at 7.2 kW to its limit, when it will be there and how long from now; its own lock, never its cable’s latch',
    tesla.badge === 'Charging · 7.2 kW' &&
      /^80 % at \d{1,2}:\d{2} · 1 h 12 min left · \+46 km\/h$/.test(tesla.line) &&
      tesla.rounds[0]?.label === 'Lock · Locked',
    JSON.stringify(tesla),
  );
  check(
    'a 360 card holds four rounds with their words: the lock, the climate, the charge, the boot',
    tesla.rounds.map((r) => r.word).join('|') === 'Locked|Off|Charging|Boot',
    JSON.stringify(tesla.rounds),
  );
  const tessie = await read(card(page, 'Tessie · driving'));
  check(
    'Tessie: driving at 64 km/h, the climate cooling to 20 °C',
    tessie.badge === 'Driving · 64 km/h' && tessie.rounds[1]?.word === '20 °C',
    JSON.stringify(tessie),
  );
  const asleep = await read(card(page, 'Tesla Fleet · asleep on a cold night'));
  check(
    'Tesla Fleet: asleep, its cabin cold while the climate is off — said on the line and under the climate',
    asleep.badge === 'Asleep' &&
      asleep.line === 'Cold inside · 2 °C' &&
      asleep.rounds[1]?.word === '2 °C',
    JSON.stringify(asleep),
  );
  const kia = await read(card(page, 'Kia · plugged in, not charging, unlocked'));
  check(
    'Kia: plugged in, its own battery (never its 12 V one), a window left open on the line, an hour and a half since it said anything',
    kia.badge === 'Plugged in' &&
      kia.line === 'Window open' &&
      kia.sub === 'Updated 2 h ago' &&
      kia.rounds[0]?.word === 'Unlocked',
    JSON.stringify(kia),
  );
  const hyundai = await read(card(page, 'Hyundai · charging away from home'));
  check(
    'Hyundai: its time to full a duration — full at its end, 1 h 35 min left — and its badge over its address at 360',
    /^Full at \d{1,2}:\d{2} · 1 h 35 min left$/.test(hyundai.line) &&
      hyundai.badge === 'Charging · 10.5 kW' &&
      hyundai.sub === '',
    JSON.stringify(hyundai),
  );
  const bmw = await read(card(page, 'BMW CarData · a few entities'));
  check(
    'BMW CarData: read by its names — its lock a sensor’s word, its charge idle, its limit on the line',
    bmw.rounds[0]?.word === 'Locked' && bmw.line === 'Limit 80 %' && bmw.badge === 'Parked',
    JSON.stringify(bmw),
  );
  const custom = await read(card(page, 'tesla_custom · its charge port’s latch, never its lock'));
  check(
    'tesla_custom: its doors’ lock, never its charge port’s latch first in its registry',
    custom.rounds.length === 1 && custom.rounds[0]?.label === 'Lock · Unlocked',
    JSON.stringify(custom.rounds),
  );
  const gone = await read(card(page, 'Out of reach'));
  check(
    'out of reach: the badge says so, every round still, the rows dashes',
    gone.badge === 'Unavailable' &&
      gone.rounds.length > 0 &&
      gone.rounds.every((r) => r.still && r.word === '—') &&
      gone.rows.every((row) => row.endsWith('—')),
    JSON.stringify(gone),
  );
}

/* ---------- the rounds act on the car, asking first where it matters ---------- */
{
  const tesla = card(page, 'Teslemetry · charging at home');
  await reset(page);
  await tesla.locator('.vh-control').nth(0).click();
  await settle(page, 200);
  let asked = await handed();
  let done = await calls(page);
  check(
    'unlocking asks first: Home Assistant’s dialog, nothing called yet',
    done.length === 0 &&
      asked.length === 1 &&
      asked[0].config.tap_action.perform_action === 'lock.unlock' &&
      asked[0].config.tap_action.confirmation?.text === 'Unlock the car?',
    JSON.stringify({ asked, done }),
  );
  await tesla.locator('.vh-control').nth(2).click();
  await settle(page, 200);
  asked = await handed();
  check(
    'stopping a charge asks first',
    asked.length === 1 &&
      asked[0].config.tap_action.perform_action === 'switch.turn_off' &&
      asked[0].config.tap_action.confirmation?.text === 'Stop charging?',
    JSON.stringify(asked),
  );
  await tesla.locator('.vh-control').nth(3).click();
  await settle(page, 200);
  asked = await handed();
  check(
    'opening the boot asks first',
    asked.length === 1 &&
      asked[0].config.tap_action.perform_action === 'cover.open_cover' &&
      asked[0].config.tap_action.confirmation?.text === 'Open the boot?',
    JSON.stringify(asked),
  );
  await reset(page);
  await tesla.locator('.vh-control').nth(1).click();
  await settle(page, 200);
  done = await calls(page);
  check(
    'the climate turns on at once',
    done.length === 1 &&
      done[0].s === 'climate.turn_on' &&
      done[0].t?.entity_id === 'climate.model_y_climate',
    JSON.stringify(done),
  );
  await reset(page);
  const lock = tesla.locator('.vh-control').nth(0);
  const box = await lock.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  await settle(page, 200);
  check(
    'a hold on a round opens what it reads',
    (await moreInfo(page)).at(-1) === 'lock.model_y_lock' && (await calls(page)).length === 0,
    JSON.stringify(await moreInfo(page)),
  );
  const kia = card(page, 'Kia · plugged in, not charging, unlocked');
  await reset(page);
  await kia.locator('.vh-control').nth(0).click();
  await settle(page, 200);
  done = await calls(page);
  check(
    'locking acts at once',
    done.length === 1 && done[0].s === 'lock.lock' && done[0].t?.entity_id === 'lock.ev6_door_lock',
    JSON.stringify(done),
  );
  await reset(page);
  await kia.locator('.vh-control').nth(2).click();
  await settle(page, 200);
  done = await calls(page);
  check(
    'a charge that stopped plugged in starts at once',
    done.length === 1 &&
      done[0].s === 'switch.turn_on' &&
      done[0].t?.entity_id === 'switch.ev6_ev_charging',
    JSON.stringify(done),
  );
  const parked = await read(card(page, 'Tesla Fleet · parked at work, sentry on'));
  check(
    'the charge cannot start unplugged: its round is still, and says why',
    parked.rounds[2]?.still === true && parked.rounds[2]?.label?.endsWith('Not plugged in'),
    JSON.stringify(parked.rounds[2]),
  );
}

/* ---------- the head, the battery and a row answer their taps ---------- */
{
  const tesla = card(page, 'Teslemetry · charging at home');
  await reset(page);
  await tapHead(tesla);
  await settle(page, 200);
  check(
    'the head opens the battery’s details',
    (await moreInfo(page)).at(-1) === 'sensor.model_y_battery_level',
    JSON.stringify(await moreInfo(page)),
  );
  await reset(page);
  await tesla.locator('.vh-hero .fv-tile__tap').click();
  await settle(page, 200);
  check(
    'the battery opens its details',
    (await moreInfo(page)).at(-1) === 'sensor.model_y_battery_level',
    JSON.stringify(await moreInfo(page)),
  );
  await reset(page);
  await tesla.locator('.vh-rows .fv-row').first().click();
  await settle(page, 200);
  check(
    'the location row opens the car’s tracker',
    (await moreInfo(page)).at(-1) === 'device_tracker.model_y_location',
    JSON.stringify(await moreInfo(page)),
  );
}

/* ---------- every card holds its declared height ---------- */
{
  const heights = await page.evaluate(() =>
    [...document.querySelectorAll('[data-frame]')].flatMap((frame) =>
      [...frame.querySelectorAll('fluvy-vehicle-card')]
        .filter((el) => !el.dataset.cols && Math.round(el.getBoundingClientRect().width) === 360)
        .map((el) => ({
          frame: frame.dataset.frame,
          drawn: Math.round(
            el.shadowRoot.querySelector('[data-card]').getBoundingClientRect().height,
          ),
          declared: el.constructor.layoutHeight(el.config),
        })),
    ),
  );
  const off = heights.filter((h) => Math.abs(h.drawn - h.declared) > 0.5);
  check(
    'every card at a 360 column draws the height it declares',
    heights.length > 10 && off.length === 0,
    JSON.stringify(off),
  );
}
await page.close();

/* ---------- in half a section, the strip’s round gives way before a word is cut ---------- */
{
  const half = await suite.sheet('vehicle');
  const strips = frame(half, 'Strips · half a section').locator('fluvy-vehicle-card');
  const seen = await strips.evaluateAll((els) =>
    els.map((el) => ({
      width: Math.round(el.getBoundingClientRect().width),
      round: Boolean(el.shadowRoot.querySelector('.vh-card--mini > .vh-control')),
    })),
  );
  check(
    'a 152 strip has no round: its name and its charge have the row',
    seen.length === 3 && seen.every((s) => s.width === 152 && !s.round),
    JSON.stringify(seen),
  );
  await half.close();
}

/* ---------- the rounds lie by every word they can say, out of reach as when they read ---------- */
{
  const narrow = await suite.sheet('vehicle', { width: 266 });
  const gone = await read(card(narrow, 'Out of reach'));
  const parked = await read(card(narrow, 'Tesla Fleet · parked at work, sentry on'));
  check(
    'out of reach, a 266 card’s rounds give way where a parked car’s do: their dashes laid out as their words',
    gone.rounds.length === 3 && parked.rounds.length === 3,
    JSON.stringify({ gone: gone.rounds.length, parked: parked.rounds.length }),
  );
  await narrow.close();
}

/* ---------- no word runs past its box, in any language ---------- */
for (const lang of await everyLanguage()) {
  const at = await suite.sheet('vehicle', { lang });
  const bad = [];
  for (const el of await at.locator('fluvy-vehicle-card').all()) bad.push(...(await overflows(el)));
  check(
    `${lang}: every round’s word in its cell, every line in its column`,
    bad.length === 0,
    bad.join(' | '),
  );
  await at.close();
}

await suite.finish();
