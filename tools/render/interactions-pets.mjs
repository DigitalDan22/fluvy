#!/usr/bin/env node
/**
 * Pet devices (#112) on the playground's `pets` sheet (real cards, simulated hass): a PetKit feeder, fountain and
 * litter box and a PETLIBRO feeder. Exit code 1 on any failure.
 *   PLAYGROUND=http://127.0.0.1:5183/ node interactions-pets.mjs
 * What it proves: a feeder's round gives a meal only after Home Assistant's dialog has asked, saying how much (PetKit's
 * amount written to its text, PETLIBRO's button pressed); a litter box's clean asks first too, its deodorizing does
 * not, and its round is a resume while a cat has paused its clean; a tile opens what it says and a part's hold resets
 * it after asking; the buttons' row a card asks for presses each its own; a pet device out of reach keeps its card's
 * height and its parts, its round disabled; the rows of half a section never cut what a device says; the four whole
 * cards of a dashboard's band end level.
 */
import { calls, frame, moreInfo, reset, settle, startSuite } from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;

const card = (page, title, n = 0) =>
  frame(page, title).locator('fluvy-appliance-card, fluvy-appliances-card').nth(n);

const page = await suite.sheet('pets');
await page.evaluate(() => {
  window.__handed = [];
  document.body.addEventListener('hass-action', (event) => window.__handed.push(event.detail));
});
const handed = () => page.evaluate(() => window.__handed.splice(0));
/** What a card's round does: its label and whether it is disabled. */
const round = (c) =>
  c.evaluate((el) => {
    const button = el.shadowRoot.querySelector('.ap-power');
    return { label: button?.getAttribute('aria-label') ?? '', disabled: Boolean(button?.disabled) };
  });

/* ---------- a meal now, asked first ---------- */
{
  await reset(page);
  await handed();
  await card(page, 'Pets · at rest', 0).locator('.ap-power').click();
  await card(page, 'Pets · at rest', 3).locator('.ap-power').click();
  await settle(page, 150);
  const asked = await handed();
  const done = await calls(page);
  const actions = asked.map((detail) => detail.config?.tap_action);
  check(
    'a feeder’s round gives a meal only after asking how much: PetKit’s amount written to its text, PETLIBRO’s button',
    done.length === 0 &&
      actions[0]?.perform_action === 'text.set_value' &&
      actions[0]?.data?.value === '10' &&
      /Feed 10 g now\?/.test(actions[0]?.confirmation?.text ?? '') &&
      actions[1]?.perform_action === 'button.press' &&
      actions[1]?.target?.entity_id === 'button.granary_manual_feed' &&
      Boolean(actions[1]?.confirmation),
    JSON.stringify(actions),
  );
}

/* ---------- a litter box: clean asked first, deodorizing not, a paused clean resumed ---------- */
{
  await reset(page);
  const own = card(page, 'Pets · their own', 1);
  await own.locator('.ap-actions [data-action="clean"]').click();
  await own.locator('.ap-actions [data-action="deodorize"]').click();
  await settle(page, 150);
  const asked = (await handed()).map((detail) => detail.config?.tap_action);
  const done = await calls(page);
  check(
    'a litter box’s clean asks first (no pet inside); its deodorizing is pressed at once',
    asked.length === 1 &&
      asked[0]?.perform_action === 'button.press' &&
      asked[0]?.target?.entity_id === 'button.katzenklo_scoop' &&
      /no pet is inside/.test(asked[0]?.confirmation?.text ?? '') &&
      done.length === 1 &&
      done[0].s === 'button.press' &&
      done[0].d.entity_id === 'button.katzenklo_deodorize',
    JSON.stringify({ asked, done }),
  );
  const paused = await round(card(page, 'Pets · failed, paused', 2));
  const working = await round(card(page, 'Pets · at work', 2));
  check(
    'a litter box’s round resumes a clean a cat has paused, and pauses one under way',
    paused.label === 'Resume' && !paused.disabled && working.label === 'Pause' && !working.disabled,
    JSON.stringify({ paused, working }),
  );
}

/* ---------- a tile opens, a part's hold resets ---------- */
{
  await reset(page);
  await card(page, 'Pets · at rest', 1).locator('.ap-tile').nth(1).click();
  await settle(page, 150);
  const opened = await moreInfo(page);
  await handed();
  await card(page, 'Pets · at rest', 1)
    .locator('.ap-tile')
    .nth(1)
    .evaluate((el) => el.fvHold?.());
  await settle(page, 100);
  const asked = (await handed()).map((detail) => detail.config?.tap_action);
  check(
    'a tile opens what it says; a filter’s hold resets it after asking',
    opened.length === 1 &&
      asked.length === 1 &&
      asked[0]?.perform_action === 'button.press' &&
      asked[0]?.target?.entity_id === 'button.trinkbrunnen_reset_filter' &&
      Boolean(asked[0]?.confirmation),
    JSON.stringify({ opened, asked }),
  );
}

/* ---------- out of reach: the same size, the same parts, its round disabled ---------- */
{
  const size = (c) =>
    c.evaluate((el) => ({
      height: Math.round(el.shadowRoot.querySelector('article').getBoundingClientRect().height),
      parts: [...el.shadowRoot.querySelector('article').children].map((child) => child.className),
      tiles: el.shadowRoot.querySelectorAll('.ap-tile').length,
      rows: el.shadowRoot.querySelectorAll('.ap-item').length,
    }));
  const pairs = [];
  for (let n = 0; n < 4; n++)
    pairs.push([
      await size(card(page, 'Pets · at rest', n)),
      await size(card(page, 'Pets · out of reach', n)),
      await round(card(page, 'Pets · out of reach', n)),
    ]);
  check(
    'out of reach, every pet device keeps its card’s height, its tiles and its rows, its round disabled',
    pairs.every(
      ([live, gone, button]) =>
        live.height === gone.height &&
        live.tiles === gone.tiles &&
        live.rows === gone.rows &&
        live.parts.length === gone.parts.length &&
        button.disabled,
    ),
    JSON.stringify(pairs),
  );
}

/* ---------- never cut: the rows of half a section, a dashboard's band ---------- */
{
  const lines = await frame(page, 'Pets · rows, half a section')
    .locator('fluvy-appliance-card')
    .evaluateAll((cards) =>
      cards.map((el) => {
        const sub = el.shadowRoot.querySelector('.fv-row__sub');
        return {
          text: sub?.textContent ?? '',
          fits: sub ? sub.scrollWidth <= sub.clientWidth + 1 : false,
        };
      }),
    );
  check(
    'the rows of half a section say what each does whole: never an ellipsis',
    lines.length === 4 && lines.every((line) => line.fits && !line.text.includes('…')),
    JSON.stringify(lines),
  );
  const band = await frame(page, 'Pets · a desktop’s band')
    .locator('fluvy-appliance-card')
    .evaluateAll((cards) =>
      cards.map((el) =>
        Math.round(el.shadowRoot.querySelector('article').getBoundingClientRect().height),
      ),
    );
  check(
    'the four whole cards of a dashboard’s band end level',
    band.length === 4 && band.every((height) => height === band[0]),
    JSON.stringify(band),
  );
}

await suite.finish();
