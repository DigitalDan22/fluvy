#!/usr/bin/env node
/**
 * Interaction tests for the Items card (#66): the issue's three aircraft as rows at 360, 211 and 152 — the nearest
 * first, the climb and descent arrows, "On ground" — each card at the height it declares; a photo that never arrives
 * falls back to the glyph; the head counts the aircraft from the sensor's state; the tiles give their arrows away
 * before their photos, and have them back once the photos have gone (half a section); every variant keeps one height
 * at every card width from half a section to a phone's and in every language, whether the sensor lists three aircraft,
 * one, none or is out of reach — the height it declares, but for the tiles one a row under a 288 column; compact rows
 * in half a section (152, 172) keep the three callsigns whole in every language, each name's box 48 at least, the
 * value giving way (its arrow, its unit, then under the name, the row its 48); the lines under the names are never
 * cut at 211 in German, Japanese and Portuguese (their segments give way, or the values go under the names); a tap
 * opens the item's sheet, which keeps its flight, and Close, Escape and the scrim close it.
 * Real cards on the playground's simulated hass.
 * Exit code 1 on any failure.
 *   PLAYGROUND=http://127.0.0.1:5183/ node interactions-items.mjs
 */
import { everyLanguage } from './lib.mjs';
import { frame, settle, startSuite } from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;

/** The card of a frame (the first, or the nth). */
const cardOf = (page, title, n = 0) => frame(page, title).locator('fluvy-items-card').nth(n);

/** What a card's rows say: their names, their values, whether each value carries an arrow. */
const rows = (card) =>
  card.evaluate((el) =>
    [...el.shadowRoot.querySelectorAll('.fv-row')].map((row) => ({
      name: row.querySelector('.fv-row__title')?.textContent.trim() ?? '',
      sub: row.querySelector('.fv-row__sub')?.textContent.trim() ?? '',
      value: row.querySelector('.fv-row__value')?.textContent.trim() ?? '',
      arrow: Boolean(row.querySelector('.fv-row__value svg')),
      picture: Boolean(row.querySelector('.it-pic img')),
      glyph: Boolean(row.querySelector('.fv-ico')),
      cut:
        (row.querySelector('.fv-row__sub')?.scrollWidth ?? 0) >
        (row.querySelector('.fv-row__sub')?.clientWidth ?? 0) + 0.5,
    })),
  );

/** The card's height, and the one it declares (`layoutHeight`, read as the dashboard reads it). */
const heights = (card) =>
  card.evaluate((el) => ({
    drawn: Math.round(el.getBoundingClientRect().height),
    declared: el.constructor.layoutHeight(el.config),
  }));

/**
 * The page, its boxes measured at rest: no entrance — a card mid-way through its rise (a scale) is not its height, and
 * on a loaded machine the suite's waits end long before a staggered rise does (its layout is the declared one all
 * along: `offsetHeight` says so from the first frame).
 */
const atRest = async (page) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return page;
};

/* ---------- the rows: nearest first, the arrows, the photo that fails, the count, the heights ---------- */
{
  const page = await atRest(await suite.sheet('items'));
  const card = cardOf(page, 'Items · flights');
  await card.scrollIntoViewIfNeeded();
  await settle(page, 900);
  const drawn = await rows(card);
  check(
    'items: the three aircraft, nearest first, each named by its callsign over its route (the aircraft where it holds)',
    drawn.map((row) => row.name).join() === 'KLM1412,VLG8012,RYR4PV' &&
      drawn.map((row) => row.sub.split(' · ')[0]).join() === 'AMS → BCN,LHR → BCN,BCN → DUB',
    JSON.stringify(drawn),
  );
  check(
    'items: on the ground in words, descending and climbing with their arrows and altitudes in feet',
    drawn[0].value === 'On ground' &&
      !drawn[0].arrow &&
      drawn[1].value === '4,200 ft' &&
      drawn[1].arrow &&
      drawn[2].value === '12,500 ft' &&
      drawn[2].arrow,
    JSON.stringify(drawn.map((row) => [row.value, row.arrow])),
  );
  check(
    'items: two photos in their circles, the one that never arrives giving way to the glyph',
    drawn[0].picture && drawn[1].picture && !drawn[2].picture && drawn[2].glyph,
    JSON.stringify(drawn.map((row) => [row.picture, row.glyph])),
  );
  const head = await card.evaluate((el) => ({
    title: el.shadowRoot.querySelector('.fv-card__title')?.textContent.trim(),
    sub: el.shadowRoot.querySelector('.fv-card__sub')?.textContent.trim(),
  }));
  check(
    'items: the head counts the aircraft from the sensor’s state',
    head.title === 'Flights nearby' && head.sub === '3 aircraft',
    JSON.stringify(head),
  );
  for (const title of [
    'Items · flights',
    'Items · compact',
    'Items · tiles',
    'Items · a mapping',
    'Items · two rows',
    'Items · one aircraft',
    'Items · empty',
    'Items · empty · one row',
    'Items · out of reach',
  ]) {
    const one = cardOf(page, title);
    await one.scrollIntoViewIfNeeded();
    const { drawn: h, declared } = await heights(one);
    check(
      `items: ${title} draws the height it declares (${declared})`,
      Math.abs(h - declared) <= 8,
      `${h}`,
    );
  }
  // the list cut to its rows, the head still counting them all
  const two = cardOf(page, 'Items · two rows');
  const cut = await rows(two);
  const sub = await two.evaluate((el) =>
    el.shadowRoot.querySelector('.fv-card__sub')?.textContent.trim(),
  );
  check(
    'items: more aircraft than rows: the highest two, the head counting all three',
    cut.map((row) => row.name).join() === 'RYR4PV,VLG8012' && sub === '3 aircraft',
    JSON.stringify({ cut: cut.map((row) => row.name), sub }),
  );
  // the tiles two a row: the photos (one never arrives: its glyph), their arrows given away for them
  const tiles = await cardOf(page, 'Items · tiles').evaluate((el) => ({
    photos: el.shadowRoot.querySelectorAll('.it-tile .it-pic img').length,
    glyphs: el.shadowRoot.querySelectorAll('.it-tile > .fv-ico').length,
    arrows: el.shadowRoot.querySelectorAll('.fv-tile__state > svg').length,
  }));
  check(
    'items: two tiles a row keep their photos (the glyph for the one that never arrives) and give their arrows away',
    tiles.photos === 2 && tiles.glyphs === 1 && tiles.arrows === 0,
    JSON.stringify(tiles),
  );
  // a sensor out of reach keeps its rows, dashes at rest
  const gone = await rows(cardOf(page, 'Items · out of reach'));
  check(
    'items: out of reach, the rows it declares with dashes in resting rings',
    gone.length === 3 && gone.every((row) => row.value === '—' && row.glyph),
    JSON.stringify(gone),
  );
  await page.close();
}

/* ---------- out of reach, a flights card keeps its anatomy and its words ---------- */
{
  const page = await suite.sheet('items');
  /** A card's head and rows as its anatomy says them: the title, the head's glyph, the rows' glyphs and values. */
  const anatomy = (card) =>
    card.evaluate((el) => {
      const root = el.shadowRoot;
      const glyphOf = (circle) => circle?.querySelector('ha-icon')?.icon ?? (circle ? 'glyph' : '');
      return {
        title: root.querySelector('.fv-card__title')?.textContent.trim(),
        head: glyphOf(root.querySelector('.fv-card__head > .fv-ico')),
        rows: [...root.querySelectorAll('.fv-row')].map(
          (row) =>
            `${glyphOf(row.querySelector('.fv-ico'))} ${row.querySelector('.fv-row__value')?.textContent.trim()}`,
        ),
        height: Math.round(root.querySelector('[data-card]').getBoundingClientRect().height),
      };
    });
  const one = cardOf(page, 'Items · one aircraft');
  await one.scrollIntoViewIfNeeded();
  const live = await anatomy(one);
  // the sensor goes out of reach as Home Assistant writes it: its list gone with its state
  await page.evaluate(() =>
    window.fluvyMock.set('sensor.it_one', 'unavailable', { flights: undefined }),
  );
  await settle(page, 600);
  const away = await anatomy(one);
  check(
    'items: a flights card whose sensor goes out of reach keeps its words, its plane and its height, its rows at rest',
    live.title === 'Flights nearby' &&
      away.title === live.title &&
      away.head === 'mdi:airplane' &&
      away.rows.length === 3 &&
      away.rows.every((row) => row === 'mdi:airplane —') &&
      away.height === live.height,
    JSON.stringify({ live, away }),
  );
  const named = await anatomy(cardOf(page, 'Items · out of reach · flights'));
  const plain = await anatomy(cardOf(page, 'Items · out of reach'));
  check(
    'items: out of reach, the flights the config names keep their anatomy; a list nothing is known of stays a plain list',
    named.title === 'Flights nearby' &&
      named.rows.every((row) => row === 'mdi:airplane —') &&
      plain.title === 'FlightRadar24 Current in area' &&
      plain.rows.every((row) => row === 'glyph —'),
    JSON.stringify({ named, plain }),
  );
  await page.close();
}

/* ---------- the rows at 211 and 152: whole, the line giving way before it is cut ---------- */
{
  for (const [width, title, expected] of [
    [211, 'Items · flights', 3],
    [320, 'Items · half a section', 3],
  ]) {
    const page = await suite.sheet('items', { width });
    const card = cardOf(page, title);
    await card.scrollIntoViewIfNeeded();
    await settle(page, 900);
    const drawn = await rows(card);
    const measured = await card.evaluate((el) => Math.round(el.getBoundingClientRect().width));
    check(
      `items: at ${measured} the ${expected} rows keep their names and values whole, no line cut`,
      drawn.length === expected &&
        drawn.every((row) => row.name && row.value && !row.cut) &&
        measured === (width === 320 ? 152 : 211),
      JSON.stringify({ measured, drawn }),
    );
    if (width === 320) {
      // the tiles one a row: the words take the tile, the arrows are back
      const tiles = await cardOf(page, 'Items · half a section · tiles').evaluate((el) => ({
        circles: el.shadowRoot.querySelectorAll('.it-tile .it-pic, .it-tile > .fv-ico').length,
        arrows: el.shadowRoot.querySelectorAll('.fv-tile__state > svg').length,
      }));
      check(
        'items: tiles in half a section give their circles to the words and have their arrows back',
        tiles.circles === 0 && tiles.arrows === 2,
        JSON.stringify(tiles),
      );
    }
    await page.close();
  }
}

/* ---------- the height the config declares, whatever the list holds, at every width and in every language ---------- */
{
  const WIDTHS = [152, 172, 211, 266, 328, 360];
  const faults = [];
  const cuts = [];
  let seen = 0;
  for (const lang of await everyLanguage()) {
    const page = await atRest(await suite.sheet('items', { lang }));
    // three aircraft, one, none, the sensor out of reach, and more aircraft than rows: each variant at each width
    const drawn = await page.evaluate(async (widths) => {
      const stage = document.createElement('div');
      document.body.append(stage);
      const cards = [];
      for (const width of widths)
        for (const variant of ['rows', 'compact', 'tiles'])
          for (const [entity, max] of [
            ['sensor.it_flights', 3],
            ['sensor.it_one', 3],
            ['sensor.it_none', 3],
            ['sensor.it_gone', 3],
            ['sensor.it_flights', 2],
          ]) {
            const box = document.createElement('div');
            box.style.width = `${width}px`;
            const card = document.createElement('fluvy-items-card');
            card.setConfig({ type: 'custom:fluvy-items-card', entity, variant, max_rows: max });
            card.hass = window.fluvyMock.hass();
            box.append(card);
            stage.append(box);
            cards.push({ card, width, variant, entity, max });
          }
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return cards.map(({ card, width, variant, entity, max }) => {
        const title = card.shadowRoot.querySelector('.fv-card__title');
        const words = title?.querySelector('.fv-card__tap') ?? title;
        return {
          width,
          variant,
          entity,
          max,
          drawn: Math.round(
            card.shadowRoot.querySelector('[data-card]').getBoundingClientRect().height,
          ),
          declared: card.constructor.layoutHeight(card.config),
          title: words?.textContent.trim() ?? '',
          cut: Boolean(words && words.scrollWidth > words.clientWidth + 1),
        };
      });
    }, WIDTHS);
    seen += drawn.length;
    // the preset's heading is the card's words: its short form where the full one would be cut, never an ellipsis
    for (const one of drawn)
      if (one.entity !== 'sensor.it_gone' && one.cut)
        cuts.push(`${lang} @ ${one.width}: "${one.title}"`);
    for (const width of WIDTHS)
      for (const variant of ['rows', 'compact', 'tiles'])
        for (const max of [3, 2]) {
          const set = drawn.filter(
            (one) => one.width === width && one.variant === variant && one.max === max,
          );
          const heights = new Set(set.map((one) => one.drawn));
          // the tiles lay one a row under a 288 column: there the box holds as many rows, whatever the list holds
          const declared = variant !== 'tiles' || width >= 328;
          if (heights.size > 1 || (declared && set.some((one) => one.drawn !== one.declared)))
            faults.push(
              `${lang} ${variant} @ ${width} max ${max}: ${set.map((one) => `${one.entity.slice(10)}=${one.drawn}/${one.declared}`).join(' ')}`,
            );
        }
    await page.close();
  }
  check(
    'items: three aircraft, one, none or out of reach, every variant keeps one height at every width — the declared one but for the tiles one a row under 288',
    faults.length === 0 && seen > 0,
    faults.slice(0, 6).join(' | ') || `${seen} cards`,
  );
  check(
    'items: the flights’ heading never ends in an ellipsis: "Flights nearby" where it holds, "Flights" where it would not',
    cuts.length === 0 && seen > 0,
    [...new Set(cuts)].slice(0, 8).join(' | '),
  );
}

/* ---------- compact rows at half a section: every name keeps its least, the value giving way ---------- */
{
  const short = [];
  let names = 0;
  for (const lang of await everyLanguage()) {
    const page = await atRest(await suite.sheet('items', { lang }));
    const drawn = await page.evaluate(async () => {
      const stage = document.createElement('div');
      document.body.append(stage);
      const cards = [152, 172].map((width) => {
        const box = document.createElement('div');
        box.style.width = `${width}px`;
        const card = document.createElement('fluvy-items-card');
        card.setConfig({
          type: 'custom:fluvy-items-card',
          entity: 'sensor.it_flights',
          variant: 'compact',
          max_rows: 3,
        });
        card.hass = window.fluvyMock.hass();
        box.append(card);
        stage.append(box);
        return { card, width };
      });
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return cards.flatMap(({ card, width }) =>
        [...card.shadowRoot.querySelectorAll('.fv-row--compact')].map((row) => {
          const name = row.querySelector('.fv-row__title');
          // its first four letters and the ellipsis, in its own face
          const probe = name.cloneNode(false);
          probe.textContent = `${name.textContent.trim().slice(0, 4)}…`;
          probe.style.cssText = 'position:absolute;visibility:hidden;width:max-content';
          row.append(probe);
          const least = probe.getBoundingClientRect().width;
          probe.remove();
          return {
            width,
            name: name.textContent.trim(),
            box: Math.round(name.getBoundingClientRect().width),
            least: Math.ceil(least),
            cut: name.scrollWidth > name.clientWidth + 0.5,
            value: row.querySelector('.fv-row__value')?.textContent.trim() ?? '',
            height: Math.round(row.getBoundingClientRect().height),
          };
        }),
      );
    });
    names += drawn.length;
    // never under 48 nor cut below its first four letters; the three callsigns, under 96, whole
    for (const one of drawn)
      if (one.box < 48 || one.box < one.least || one.cut || one.height !== 48)
        short.push(`${lang} @ ${one.width}: ${one.name} ${one.box} (${one.value}, ${one.height})`);
    await page.close();
  }
  check(
    'items: compact at 152 and 172, every language, the three callsigns whole in boxes of 48 and more, each row its 48 — the value giving way (arrow, unit, under the name)',
    short.length === 0 && names === (await everyLanguage()).length * 6,
    short.slice(0, 6).join(' | ') || `${names} names`,
  );
}

/* ---------- the lines in German, Japanese and Portuguese at 211: the head's and the rows', never cut ---------- */
{
  for (const lang of ['de', 'ja', 'pt-PT']) {
    const page = await suite.sheet('items', { width: 211, lang });
    for (const [title, expected] of [
      ['Items · flights', 3],
      ['Items · a mapping', 4],
    ]) {
      const card = cardOf(page, title);
      await card.scrollIntoViewIfNeeded();
      await settle(page, 900);
      const drawn = await rows(card);
      const head = await card.evaluate((el) => {
        const sub = el.shadowRoot.querySelector('.fv-card__sub');
        return {
          sub: sub?.textContent.trim(),
          cut: sub ? sub.scrollWidth > sub.clientWidth : true,
        };
      });
      check(
        `items: ${title}: the head's line and the lines under the names hold whole at 211 (${lang})`,
        drawn.length === expected && drawn.every((row) => !row.cut) && head.sub && !head.cut,
        JSON.stringify({ head, rows: drawn.map((row) => [row.sub, row.cut]) }),
      );
    }
    await page.close();
  }
}

/* ---------- the sheet: a tap opens it, its fields in order, its link; Close, Escape and the scrim close it ---------- */
{
  const page = await suite.sheet('items');
  const card = cardOf(page, 'Items · flights');
  await card.scrollIntoViewIfNeeded();
  await settle(page, 600);
  await card.locator('.fv-row--tap').nth(1).click();
  const dialog = card.locator('fluvy-items-sheet dialog');
  await dialog.waitFor();
  await settle(page, 500);
  const sheet = await dialog.evaluate((el) => ({
    title: el.querySelector('.fv-sheet__title')?.textContent.trim(),
    labels: [...el.querySelectorAll('.is-field__label')].map((label) => label.textContent.trim()),
    values: [...el.querySelectorAll('.is-field__value')].map((value) => value.textContent.trim()),
    link: el.querySelector('.fv-sheet__head .fv-round')?.getAttribute('aria-label'),
    picture: Boolean(el.querySelector('.is-pic img')),
  }));
  check(
    'items: a tap on a row opens its sheet: the flight’s fields in order, its photo and its link',
    sheet.title === 'VLG8012' &&
      sheet.labels.join() ===
        'Airline,Flight number,Callsign,Route,Aircraft,Registration,Altitude,Ground speed,Vertical speed,Heading,Distance,Position,Departure,Arrival' &&
      sheet.values[6] === '4,200 ft' &&
      sheet.values[7] === '210 kt' &&
      sheet.values[8] === '-1,100 ft/min' &&
      sheet.values[9] === '95°' &&
      sheet.values[10] === '8.7 km' &&
      sheet.link === 'Open on Flightradar24' &&
      sheet.picture,
    JSON.stringify(sheet),
  );
  await dialog.locator('.is-actions .fv-btn').last().click();
  await settle(page, 400);
  check(
    'items: Close closes the sheet',
    (await card.locator('fluvy-items-sheet dialog').count()) === 0,
  );
  await card.locator('.fv-row--tap').nth(0).click();
  await dialog.waitFor();
  await settle(page, 500);
  await page.keyboard.press('Escape');
  await settle(page, 400);
  check(
    'items: Escape closes the sheet',
    (await card.locator('fluvy-items-sheet dialog').count()) === 0,
  );
  await card.locator('.fv-row--tap').nth(0).click();
  await dialog.waitFor();
  await settle(page, 500);
  await dialog.click({ position: { x: 10, y: 10 } });
  await settle(page, 400);
  check(
    'items: the scrim closes the sheet',
    (await card.locator('fluvy-items-sheet dialog').count()) === 0,
  );
  // the sheet drawn in the flow: the first aircraft's
  const docked = cardOf(page, 'Items · sheet').locator('fluvy-items-sheet');
  await docked.scrollIntoViewIfNeeded();
  await settle(page, 500);
  check(
    'items: the docked sheet shows the nearest aircraft',
    (await docked.evaluate((el) =>
      el.shadowRoot.querySelector('.fv-sheet__title')?.textContent.trim(),
    )) === 'KLM1412',
  );
  await page.close();
}

await suite.finish();
