#!/usr/bin/env node
/**
 * A dashboard's view tabs as the house chooses them (discussion #20), on the playground's `?dashboard=` (Home
 * Assistant 2026.9's header markup, the shell's sheets, the bundle's marks). Exit code 1 on any failure.
 *   PLAYGROUND=http://127.0.0.1:5184/ node interactions-dashboard.mjs
 * What it proves: Fluvy's tabs write each view's name (Home Assistant gives an icon tab only an aria-label) in the
 * tabs' ink, the open one in the text's ink with the accent under exactly its name, the dashboard's name before them;
 * pills are 36 tall in the 56 bar, the open one filled; icons alone or with the name; hidden tabs leave the name and
 * the actions at the end; Home Assistant's own style, the edit mode, a subview, a single view and a dashboard that
 * does not wear the look keep Home Assistant's header; a subview's tab stays hidden; on a phone there is no name,
 * the row scrolls under the finger, fades where it goes on, and its last tab clears the fade. The sidebar's counts
 * (Settings, the notifications) keep their figures under Fluvy's glyphs (#86); no view of the automatic dashboard
 * reaches past a phone's edge, from its first frame on (#104).
 */
import { startSuite } from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;

const open = (query, width = 1280) =>
  suite.page(`dashboard=home&width=360&${query}`, { viewport: { width, height: 700 } });

/** The header as the tests read it: the root's marks, the title, every shown tab. */
const header = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('hui-root');
    const sr = root.shadowRoot;
    const css = (el, pseudo) => getComputedStyle(el, pseudo);
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    };
    const toolbar = sr.querySelector('.toolbar');
    const group = sr.querySelector('ha-tab-group');
    const measure = document.createElement('canvas').getContext('2d');
    const tabs = [...sr.querySelectorAll('ha-tab-group-tab')].map((tab) => {
      const s = css(tab);
      const after = css(tab, '::after').content;
      const icon = tab.querySelector('ha-icon');
      measure.font = s.font;
      const name = tab.getAttribute('aria-label') ?? '';
      return {
        name,
        hidden: s.display === 'none',
        active: tab.hasAttribute('active'),
        box: box(tab),
        after,
        text: tab.textContent.trim(),
        color: s.color,
        bg: s.backgroundColor,
        image: s.backgroundImage,
        shadow: s.boxShadow,
        font: `${s.fontWeight} ${s.fontSize}`,
        padding: parseFloat(s.paddingLeft) + parseFloat(s.paddingRight),
        icon: icon ? (css(icon).display === 'none' ? 0 : box(icon).w) : null,
        nameWidth: measure.measureText(name).width,
      };
    });
    const nav = group?.shadowRoot.querySelector('.nav');
    const probe = document.createElement('span');
    probe.style.color = 'var(--fluvy-text)';
    root.append(probe);
    const ink = css(probe).color;
    probe.style.color = 'var(--fluvy-text-secondary)';
    const secondary = css(probe).color;
    probe.style.color = 'var(--fluvy-selected, var(--fluvy-text))';
    const selected = css(probe).color;
    probe.remove();
    return {
      marks: [...root.attributes].map((a) => a.name).filter((n) => n.startsWith('fluvy')),
      style: root.getAttribute('fluvy-tabs'),
      // the name before the tabs, as drawn ('none' when there is none or it is not drawn)
      title:
        toolbar && css(toolbar, '::before').display !== 'none'
          ? css(toolbar, '::before').content
          : 'none',
      toolbar: toolbar ? box(toolbar) : null,
      group: group ? { display: css(group).display, box: box(group) } : null,
      nav: nav
        ? {
            scroll: nav.scrollWidth,
            client: nav.clientWidth,
            mask: css(group.shadowRoot.querySelector('[part~="nav"]')).maskImage,
            box: box(nav),
          }
        : null,
      actions: box(sr.querySelector('.action-items')),
      menu: box(sr.querySelector('ha-menu-button')),
      mainTitle: sr.querySelector('.main-title')?.textContent.trim() ?? null,
      tabs,
      ink,
      secondary,
      selected,
    };
  });

const shown = (h) => h.tabs.filter((t) => !t.hidden);

/* ---------- Fluvy's tabs, on a wide screen ---------- */
{
  const page = await open('tabs=fluvy');
  const h = await header(page);
  const tabs = shown(h);
  const active = tabs.find((t) => t.active);
  const nameX = await page.evaluate(() => {
    const toolbar = document.querySelector('hui-root').shadowRoot.querySelector('.toolbar');
    return (
      toolbar.getBoundingClientRect().x +
      12 +
      parseFloat(getComputedStyle(toolbar, '::before').marginLeft)
    );
  });
  check(
    'fluvy: the root is marked, the dashboard’s name stands before the tabs, on the view’s column (24 in)',
    h.style === 'fluvy' &&
      h.title === '"Home"' &&
      tabs[0].box.x > h.toolbar.x + 60 &&
      nameX === h.toolbar.x + 24,
    JSON.stringify({ marks: h.marks, title: h.title, first: tabs[0]?.box.x, nameX }),
  );
  check(
    'fluvy: every icon tab writes its view’s name (from its aria-label) and hides the icon; 14/600',
    tabs.length === 6 &&
      tabs.every((t) => t.after === `"${t.name}"` && t.icon === 0 && t.font === '600 14px'),
    JSON.stringify(tabs.map((t) => [t.name, t.after, t.icon, t.font])),
  );
  check(
    'fluvy: the open tab in the text’s ink, the others in the secondary ink',
    active.color === h.ink && tabs.filter((t) => !t.active).every((t) => t.color === h.secondary),
    JSON.stringify({ active: active.color, ink: h.ink, rest: tabs.map((t) => t.color) }),
  );
  check(
    'fluvy: the accent line under the open tab is exactly as wide as its name, at the header’s foot',
    /linear-gradient/.test(active.image) &&
      Math.abs(active.box.w - active.padding - active.nameWidth) < 1.5 &&
      Math.abs(active.box.bottom - h.toolbar.bottom) < 1 &&
      tabs.filter((t) => !t.active).every((t) => t.image === 'none'),
    JSON.stringify({ w: active.box.w, pad: active.padding, name: active.nameWidth }),
  );
  check(
    'fluvy: a subview’s tab stays hidden; no menu button on a wide screen; the actions at the end',
    h.tabs.find((t) => t.name === 'Kitchen')?.hidden === true &&
      h.menu.w === 0 &&
      Math.abs(h.actions.right - (h.toolbar.right - 12)) < 1,
    JSON.stringify({ menu: h.menu, actions: h.actions.right, toolbar: h.toolbar.right }),
  );
  // a tap moves the open tab, and the line with it
  const sr = page.locator('hui-root');
  await sr.locator('ha-tab-group-tab[aria-label="Climate"]').click();
  await page.waitForTimeout(250);
  const after = shown(await header(page));
  const climate = after.find((t) => t.name === 'Climate');
  check(
    'fluvy: a tap opens the view: the line moves under its name',
    climate.active &&
      /linear-gradient/.test(climate.image) &&
      after.filter((t) => t.active).length === 1,
    JSON.stringify(after.map((t) => [t.name, t.active])),
  );
  await page.close();
}

/* ---------- a row longer than the header ---------- */
{
  const page = await open('tabs=fluvy&views=10&long=1', 1024);
  const width = await page.evaluate(() => {
    const toolbar = document.querySelector('hui-root').shadowRoot.querySelector('.toolbar');
    return parseFloat(getComputedStyle(toolbar, '::before').width);
  });
  const name = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('2d');
    c.font = '600 20px Inter';
    return c.measureText('Home').width;
  });
  check(
    'overflow: the dashboard’s name keeps its width (the row scrolls, the name does not give way)',
    width >= name - 1,
    JSON.stringify({ width, name }),
  );
  await page.close();
}

/* ---------- this device's size: the name keeps the view's column ---------- */
{
  const page = await open('tabs=fluvy&zoom=125');
  const at = await page.evaluate(() => {
    const toolbar = document.querySelector('hui-root').shadowRoot.querySelector('.toolbar');
    return parseFloat(getComputedStyle(toolbar, '::before').marginLeft);
  });
  check(
    '125 %: the name’s margin grows with the view’s 24 (24 × 1.25 − 12 = 18)',
    at === 18,
    String(at),
  );
  await page.close();
}

/* ---------- the corner: the sidebar's head and the header, as the house chose them ---------- */
{
  const corner = (page) =>
    page.evaluate(() => {
      const sidebar = document.querySelector('ha-sidebar').shadowRoot;
      const menu = sidebar.querySelector('.menu');
      const button = menu.querySelector('ha-icon-button');
      const title = menu.querySelector('.title');
      const root = document.querySelector('hui-root').shadowRoot;
      const probe = document.createElement('span');
      probe.style.color = 'var(--fluvy-page)';
      document.body.append(probe);
      const pageColour = getComputedStyle(probe).color;
      probe.remove();
      return {
        logo: getComputedStyle(button).backgroundImage.slice(0, 26),
        glyph: getComputedStyle(button).getPropertyValue('--icon-primary-color').trim() || 'shown',
        title: getComputedStyle(title).fontSize,
        menuLine: getComputedStyle(menu).borderBottomColor,
        headerLine: getComputedStyle(root.querySelector('.toolbar')).borderBottomWidth,
        headerBg: getComputedStyle(root.querySelector('.header')).backgroundColor,
        pageColour,
      };
    });
  const plain = await corner(await open('frame=1'));
  check(
    'the corner as Home Assistant draws it: the menu glyph, the name at 20, a hairline under the sidebar’s head and the header, the header a bar',
    plain.logo === 'none' &&
      plain.glyph === 'shown' &&
      plain.title === '20px' &&
      plain.menuLine !== 'rgba(0, 0, 0, 0)' &&
      plain.headerLine === '1px' &&
      plain.headerBg !== plain.pageColour,
    JSON.stringify(plain),
  );
  const render = await corner(await open('frame=1&logo=1&flat=1&header=page'));
  check(
    'as Fluvy’s screenshots: Home Assistant’s logo for the menu glyph (the button kept), the name at 16, no hairlines, the header on the page',
    /^url\("data:image\/svg/.test(render.logo) &&
      render.glyph === 'transparent' &&
      render.title === '16px' &&
      render.menuLine === 'rgba(0, 0, 0, 0)' &&
      render.headerLine === '0px' &&
      render.headerBg === render.pageColour,
    JSON.stringify(render),
  );
  const actions = (page) =>
    page.evaluate(() => {
      const items = document.querySelector('hui-root').shadowRoot.querySelector('.action-items');
      const menu = items.querySelector('#dashboardmenu');
      return {
        buttons: items.querySelectorAll('.button').length,
        menu: !!menu,
        // the dots on the button's ::after: its own hover and focus ring stay whole
        mask: menu ? getComputedStyle(menu, '::after').maskImage.slice(0, 26) : '',
        own: menu ? getComputedStyle(menu).maskImage : '',
      };
    });
  const four = await actions(await open('frame=1'));
  const one = await actions(await open('frame=1&actions=menu'));
  check(
    'the actions in one menu: on a wide screen Home Assistant draws its phone’s one menu, shown as Fluvy’s “…”; else its four buttons',
    four.buttons === 4 &&
      !four.menu &&
      one.buttons === 1 &&
      one.menu &&
      /^url\("data:image\/svg/.test(one.mask) &&
      one.own === 'none',
    JSON.stringify({ four, one }),
  );
  const edit = await corner(await open('frame=1&flat=1&header=page&edit=1'));
  check(
    'the edit mode keeps Home Assistant’s header (its bar and line) whatever the corner',
    edit.headerLine === '1px' && edit.headerBg !== edit.pageColour,
    JSON.stringify(edit),
  );
}

/* ---------- the sidebar as Home Assistant draws it, and the app in Fluvy's floating frame ---------- */
{
  const app = (page) =>
    page.evaluate(() => {
      const box = (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, right: r.right, bottom: r.bottom };
      };
      const words = (el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return box(range);
      };
      const sidebar = document.querySelector('ha-sidebar');
      const sr = sidebar.shadowRoot;
      const main = document.querySelector('home-assistant').shadowRoot.firstElementChild;
      const layer = getComputedStyle(main, '::after');
      const root = document.querySelector('hui-root').shadowRoot;
      return {
        sidebar: box(sidebar),
        glyph: box(sr.querySelector('.menu ha-icon')),
        title: words(sr.querySelector('.title')),
        rows: [...sr.querySelectorAll('ha-list-item-button')].map((row) => ({
          name: row.querySelector('.item-text').textContent.trim(),
          icon: box(row.querySelector('[slot="start"]')),
          words: words(row.querySelector('.item-text')),
          bottom: box(row).bottom,
        })),
        layer: { content: layer.content, inset: layer.inset, radius: layer.borderRadius },
        toolbar: box(root.querySelector('.toolbar')),
        actions: box(root.querySelector('.action-items')),
        frame: box(document.querySelector('.pg-frame')),
        width: window.innerWidth,
        height: window.innerHeight,
      };
    });
  /** The rows on the head's columns, `edge` in from the window: the icons under the glyph, the words 16 after them. */
  const columns = (a, edge) => {
    const person = a.rows.at(-1);
    return (
      Math.abs(a.glyph.x - (edge + 16)) < 0.5 &&
      Math.abs(a.title.x - (edge + 55)) < 0.5 &&
      a.rows
        .slice(0, -1)
        .every(
          (row) =>
            Math.abs(row.icon.x - (edge + 16)) < 0.5 && Math.abs(row.words.x - (edge + 56)) < 0.5,
        ) &&
      person.icon.w === 40 &&
      Math.abs(person.icon.x + 20 - (edge + 28)) < 0.5
    );
  };
  const plain = await app(await open('frame=1&logo=1'));
  check(
    'the sidebar as Home Assistant draws it: the dashboard open, its panels, then Settings, the notifications and the person',
    plain.rows.map((row) => row.name).join() ===
      'Home,Energy,Map,Activity,History,Media,To-do lists,Settings,Notifications,Marta',
    plain.rows.map((row) => row.name).join(),
  );
  check(
    'every icon under the menu button’s glyph (16 in), every name 16 after it (56), the person’s badge centred on the icons; the foot 12 above the bottom',
    plain.sidebar.w === 256 &&
      columns(plain, 0) &&
      Math.abs(plain.rows.at(-1).bottom - (plain.height - 12)) < 0.5,
    JSON.stringify({ glyph: plain.glyph.x, title: plain.title.x, rows: plain.rows }),
  );
  const floating = await app(await open('frame=1&logo=1&floating=1'));
  check(
    'the floating frame: the page painted round a 24 opening 16 inside the window, the sidebar, the header and the view stepping in by its insets',
    floating.layer.content === '""' &&
      floating.layer.inset === '16px' &&
      floating.layer.radius === '24px' &&
      floating.sidebar.w === 272 &&
      columns(floating, 16) &&
      Math.abs(floating.rows.at(-1).bottom - (floating.height - 28)) < 0.5 &&
      floating.toolbar.y === 16 &&
      Math.abs(floating.actions.right - (floating.width - 28)) < 0.5 &&
      floating.frame.y === 16 + 56 + 16,
    JSON.stringify({ ...floating, rows: undefined }),
  );
  const under = await app(await open('frame=1&logo=1&floating=1', 1000));
  check(
    'under 1024 the app keeps the whole window, as the shell’s frame does',
    under.layer.content === 'none' && under.sidebar.w === 256 && columns(under, 0),
    JSON.stringify({ layer: under.layer, sidebar: under.sidebar.w }),
  );
}

/* ---------- the counts of Settings and the notifications under Fluvy's glyphs (#86) ---------- */
{
  const counts = (page) =>
    page.evaluate(() => {
      const sr = document.querySelector('ha-sidebar').shadowRoot;
      const probe = document.createElement('span');
      sr.append(probe);
      probe.style.color = 'var(--accent-color)';
      const accent = getComputedStyle(probe).color;
      probe.style.color = 'var(--text-accent-color)';
      const onAccent = getComputedStyle(probe).color;
      probe.remove();
      return ['sidebar-config', 'sidebar-notifications'].map((id) => {
        const row = sr.getElementById(id);
        const badge = (slot) => {
          const el = row.querySelector(`.badge[slot="${slot}"]`);
          const s = getComputedStyle(el);
          return { text: el.textContent.trim(), mask: s.maskImage, opacity: s.opacity };
        };
        const start = row.querySelector('.badge[slot="start"]');
        return {
          glyph: getComputedStyle(row.querySelector('ha-svg-icon')).maskImage.startsWith('url('),
          inks:
            getComputedStyle(start).backgroundColor === accent &&
            getComputedStyle(start).color === onAccent,
          start: badge('start'),
          end: badge('end'),
        };
      });
    });
  const rail = await counts(await open('frame=1&rail=1&counts=1'));
  check(
    'the sidebar on its icons: Settings and the notifications keep Fluvy’s glyphs, each count on its icon’s corner in its figures on the accent, never the glyph again (#86)',
    rail.map((row) => row.start.text).join() === '5,2' &&
      rail.every(
        (row) =>
          row.glyph &&
          row.inks &&
          row.start.mask === 'none' &&
          row.start.opacity === '1' &&
          row.end.opacity === '0',
      ),
    JSON.stringify(rail),
  );
  const wide = await counts(await open('frame=1&counts=1'));
  check(
    'the open sidebar: the counts after the names, the ones on the icons put away',
    wide.every(
      (row) =>
        row.glyph &&
        row.end.mask === 'none' &&
        row.end.opacity === '1' &&
        row.start.opacity === '0',
    ),
    JSON.stringify(wide),
  );
}

/* ---------- what each tab shows ---------- */
{
  const icons = await header(await open('tabs=fluvy&content=icons'));
  check(
    'icons: the icons alone, at 24, no name written',
    shown(icons).every((t) => t.after === 'none' && t.icon === 24),
    JSON.stringify(shown(icons).map((t) => [t.after, t.icon])),
  );
  const both = await header(await open('tabs=fluvy&content=both'));
  check(
    'both: the icon at 20 and the name after it',
    shown(both).every((t) => t.after === `"${t.name}"` && t.icon === 20),
    JSON.stringify(shown(both).map((t) => [t.after, t.icon])),
  );
  const mixed = await header(await open('tabs=fluvy&icons=mixed&views=8'));
  const tabs = shown(mixed);
  check(
    'a view without an icon keeps the name Home Assistant writes; every tab’s name sits 12 in from its edges',
    tabs.length === 8 &&
      tabs.every((t) =>
        t.icon === null ? t.text === t.name && t.after === 'none' : t.after === `"${t.name}"`,
      ) &&
      tabs.every((t) => Math.abs(t.box.w - t.padding - t.nameWidth) < 1.5),
    JSON.stringify(
      tabs.map((t) => [t.name, t.icon, t.after, Math.round(t.box.w - t.padding - t.nameWidth)]),
    ),
  );
}

/* ---------- views without icons, asked for icons ---------- */
{
  const page = await open('tabs=pills&content=icons&icons=0&views=8');
  await page.waitForTimeout(300); // the table of names comes on demand
  const icons = await page.evaluate(() =>
    [
      ...document
        .querySelector('hui-root')
        .shadowRoot.querySelectorAll('ha-tab-group-tab:not(.hide-tab)'),
    ].map((t) => ({
      name: t.getAttribute('aria-label'),
      marked: t.hasAttribute('fluvy-icon'),
      mask: getComputedStyle(t, '::before').maskImage.slice(0, 30),
      icon: Math.round(parseFloat(getComputedStyle(t, '::before').width)),
      text: getComputedStyle(t.shadowRoot.querySelector('[part="base"]')).display,
      w: Math.round(t.getBoundingClientRect().width),
    })),
  );
  check(
    'a view without an icon, in a row of icons: the icon its name says (24, in the tab’s ink), its words put away',
    icons.length === 8 &&
      icons.every(
        (t) =>
          t.marked &&
          /^url\("data:image\/svg/.test(t.mask) &&
          t.icon === 24 &&
          t.text === 'none' &&
          t.w === 56,
      ),
    JSON.stringify(icons),
  );
  const both = await open('tabs=fluvy&content=both&icons=0');
  await both.waitForTimeout(300);
  const pairs = await both.evaluate(() =>
    [
      ...document
        .querySelector('hui-root')
        .shadowRoot.querySelectorAll('ha-tab-group-tab:not(.hide-tab)'),
    ].map((t) => [
      Math.round(parseFloat(getComputedStyle(t, '::before').width)),
      t.textContent.trim(),
    ]),
  );
  check(
    'both: the icon its name says at 20, the name Home Assistant wrote beside it',
    pairs.every(([w, text]) => w === 20 && text.length > 0),
    JSON.stringify(pairs),
  );
  const names = await header(await open('tabs=fluvy&content=names&icons=0'));
  check(
    'names: a view without an icon is its name, nothing drawn before it',
    shown(names).every((t) => t.text === t.name),
    JSON.stringify(shown(names).map((t) => t.text)),
  );
}

/* ---------- pills ---------- */
{
  const h = await header(await open('tabs=pills&content=both'));
  const tabs = shown(h);
  const active = tabs.find((t) => t.active);
  const gaps = tabs.slice(1).map((t, i) => Math.round(t.box.x - tabs[i].box.right));
  check(
    'pills: 36 tall, centred in the 56 bar, 8 apart',
    tabs.every((t) => t.box.h === 36 && Math.abs(t.box.y - (h.toolbar.y + 10)) < 0.5) &&
      gaps.every((g) => g === 8),
    JSON.stringify({ heights: tabs.map((t) => t.box.h), y: tabs[0].box.y, top: h.toolbar.y, gaps }),
  );
  check(
    'pills: the open one filled in the selected ink, the others on the card with a hairline',
    active.bg === h.selected &&
      active.shadow === 'none' &&
      tabs.filter((t) => !t.active).every((t) => t.shadow !== 'none' && t.bg !== h.selected),
    JSON.stringify({ active: [active.bg, active.shadow], selected: h.selected }),
  );
}

/* ---------- hidden ---------- */
{
  const h = await header(await open('tabs=hidden'));
  check(
    'hidden: no tabs; the dashboard’s name, the actions at the end',
    h.group.display === 'none' &&
      h.title === '"Home"' &&
      Math.abs(h.actions.right - (h.toolbar.right - 12)) < 1,
    JSON.stringify({ group: h.group, title: h.title }),
  );
  const bare = await header(await open('tabs=hidden&tabtitle=0'));
  check(
    'hidden without the name: the bar holds the actions alone, at its end',
    bare.group.display === 'none' &&
      bare.title === 'none' &&
      Math.abs(bare.actions.right - (bare.toolbar.right - 12)) < 1,
    JSON.stringify({ title: bare.title }),
  );
  const notitle = await header(await open('tabs=fluvy&tabtitle=0'));
  check(
    'no title: the tabs begin the bar',
    notitle.title === 'none' && Math.abs(shown(notitle)[0].box.x - (notitle.toolbar.x + 12)) < 1,
    JSON.stringify({ title: notitle.title, first: shown(notitle)[0].box.x }),
  );
}

/* ---------- Home Assistant's own header, untouched ---------- */
{
  const h = await header(await open('tabs=ha'));
  const tabs = shown(h);
  check(
    'original with the name: the name before Home Assistant’s own tabs, which stay untouched (56, icons, no word)',
    h.style === null &&
      h.title === '"Home"' &&
      tabs.every((t) => t.box.w === 56 && t.after === 'none') &&
      tabs[0].box.x > h.toolbar.x + 60,
    JSON.stringify({ marks: h.marks, title: h.title, first: tabs[0]?.box.x }),
  );
}
for (const [query, why] of [
  ['tabs=ha&tabtitle=0', 'the original tabs without the name'],
  ['edit=1', 'the edit mode'],
  ['scope=other', 'a dashboard that does not wear the look'],
]) {
  const h = await header(await open(query));
  const tabs = shown(h);
  check(
    `${why}: no marks, Home Assistant’s icon tabs (56 wide, no name written, no title)`,
    h.marks.length === 0 &&
      h.title === 'none' &&
      tabs.length >= 6 &&
      tabs.every((t) => t.box.w === 56 && t.after === 'none'),
    JSON.stringify({ marks: h.marks, w: tabs.map((t) => t.box.w) }),
  );
}
for (const [query, why, title] of [
  ['subview=1', 'a subview', 'Kitchen'],
  ['views=1', 'a single view', 'Home'],
]) {
  const h = await header(await open(query));
  check(
    `${why}: Home Assistant’s own title, nothing written before it`,
    h.mainTitle === title && h.title === 'none' && h.group === null,
    JSON.stringify({ main: h.mainTitle, title: h.title }),
  );
}

/* ---------- a phone ---------- */
{
  const page = await open('tabs=fluvy&views=8', 390);
  const h = await header(page);
  check(
    'phone: no dashboard name (the tabs keep the room), the menu button first',
    h.title === 'none' && h.menu.w === 48 && h.menu.x < shown(h)[0].box.x,
    JSON.stringify({ title: h.title, menu: h.menu, first: shown(h)[0].box.x }),
  );
  const fades = () =>
    page.evaluate(() => {
      const root = document.querySelector('hui-root');
      return [
        root.style.getPropertyValue('--fluvy-tabs-fade-start'),
        root.style.getPropertyValue('--fluvy-tabs-fade-end'),
      ].join(' ');
    });
  check(
    'phone: the row scrolls and fades out at its end only, at rest',
    h.nav.scroll > h.nav.client &&
      /linear-gradient/.test(h.nav.mask) &&
      (await fades()) === '0px 24px',
    JSON.stringify({ nav: h.nav, fades: await fades() }),
  );
  await page.evaluate(() => {
    const nav = document
      .querySelector('hui-root')
      .shadowRoot.querySelector('ha-tab-group')
      .shadowRoot.querySelector('.nav');
    nav.scrollLeft = 120;
  });
  await page.waitForTimeout(200);
  check(
    'phone: scrolled into the row, it fades at both ends',
    (await fades()) === '24px 24px',
    await fades(),
  );
  await page.evaluate(() => {
    const nav = document
      .querySelector('hui-root')
      .shadowRoot.querySelector('ha-tab-group')
      .shadowRoot.querySelector('.nav');
    nav.scrollLeft = nav.scrollWidth;
  });
  await page.waitForTimeout(200);
  const end = await header(page);
  const last = shown(end).at(-1);
  check(
    'phone: scrolled to its end, the end fade goes and the last tab sits whole before 24 px of room',
    last.box.right <= end.nav.box.right - 24 + 0.5 && (await fades()) === '24px 0px',
    JSON.stringify({ last: last.box.right, nav: end.nav.box.right, fades: await fades() }),
  );
  const hidden = await header(await open('tabs=hidden', 390));
  check(
    'phone, hidden tabs: the name after the menu button',
    hidden.title === '"Home"' && hidden.group.display === 'none',
    JSON.stringify({ title: hidden.title }),
  );
}

/* ---------- the automatic dashboard on a phone: nothing past the screen's edge (#104) ---------- */
{
  /**
   * Each view (`tabs`: the tabs' alone) drawn afresh, as a tab opens it, and how far the page reached past the screen's
   * edge: right after its cards first drew, in every frame while they settle, and at rest. The views that did, each with
   * how far.
   */
  const sweep = (page, tabs) =>
    page.evaluate(async (tabs) => {
      const se = document.scrollingElement;
      const past = [];
      for (const { path, tab } of await window.fluvyAutomaticViews()) {
        if (tabs && !tab) continue;
        let widest = 0;
        let watching = true;
        const watch = () => {
          widest = Math.max(widest, se.scrollWidth - se.clientWidth);
          if (watching) requestAnimationFrame(watch);
        };
        requestAnimationFrame(watch);
        await window.fluvyAutomaticView(path);
        widest = Math.max(widest, se.scrollWidth - se.clientWidth);
        await new Promise((resolve) => setTimeout(resolve, 500));
        watching = false;
        widest = Math.max(widest, se.scrollWidth - se.clientWidth);
        if (widest > 0) past.push(`${path} +${widest}`);
      }
      return past;
    }, tabs);
  const phone = (width, query) =>
    suite.page(`dashboard=auto&width=${width}&${query}`, {
      viewport: { width, height: 780 },
      wait: 300,
    });
  for (const width of [360, 390, 412])
    await Promise.all(
      ['light', 'dark'].flatMap((mode) =>
        [false, true].map(async (frame) => {
          const page = await phone(width, `mode=${mode}${frame ? '&frame=1&floating=1' : ''}`);
          const past = await sweep(page, true);
          check(
            `a phone ${width} wide, ${mode}, ${frame ? 'the house’s frame on' : 'no frame'}: no tab of the automatic dashboard reaches past the screen, from its first frame (#104)`,
            past.length === 0,
            past.join(', '),
          );
          await page.close();
        }),
      ),
    );
  // every view, its rooms, its appliances and its lists too, at the narrowest
  const page = await phone(360, 'mode=light');
  const past = await sweep(page, false);
  check(
    'a phone 360 wide: no view of the automatic dashboard (its rooms, its appliances, its lists) reaches past the screen',
    past.length === 0,
    past.join(', '),
  );
  await page.close();
}

await suite.finish();
