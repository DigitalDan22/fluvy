import { afterEach, describe, expect, it } from 'vitest';
import { startShell, type ShellEnv, type ShellHandle } from '../shell/index.js';
import { SHEETS } from '../shell/registry.js';
import { WALL_BACK_ATTRIBUTE, WALL_HEADER_ATTRIBUTE } from '../look/attributes.js';

/* A page in miniature: roots with light children, elements with open shadow roots, Lit-like classes. */

class FakeSheet {
  css = '';
  replaceSync(text: string): void {
    this.css = text;
  }
}

class FakeRoot {
  adoptedStyleSheets: unknown[] = [];
  readonly children: FakeElement[] = [];
  constructor(private readonly marks: string[] = []) {}
  querySelectorAll(): FakeElement[] {
    const out: FakeElement[] = [];
    const walk = (list: FakeElement[]): void => {
      for (const el of list) {
        out.push(el);
        walk(el.children);
      }
    };
    walk(this.children);
    return out;
  }
  querySelector(selector: string): object | null {
    return this.marks.includes(selector) ? {} : null;
  }
  add(...elements: FakeElement[]): this {
    this.children.push(...elements);
    return this;
  }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  constructor(
    readonly localName: string,
    readonly shadowRoot: FakeRoot | null = null,
  ) {}
}

function page() {
  const style = new Map<string, string>();
  const attributes = new Map<string, string>();
  const input = new FakeElement('ha-input', new FakeRoot(['wa-input']));
  const app = new FakeElement('home-assistant', new FakeRoot().add(input));
  const document = Object.assign(new FakeRoot().add(app), {
    documentElement: {
      style: { getPropertyValue: (name: string) => style.get(name) ?? '' },
      hasAttribute: (name: string) => attributes.has(name),
      getAttribute: (name: string) => attributes.get(name) ?? null,
    },
  });
  const classes = new Map<string, { elementStyles: unknown[] }>([
    ['ha-input', { elementStyles: ['theirs'] }],
    ['home-assistant', { elementStyles: [] }],
  ]);
  let observed: (() => void) | undefined;
  let disconnected = false;
  const env = {
    document,
    customElements: {
      get: (tag: string) => classes.get(tag),
      whenDefined: (tag: string) => (classes.has(tag) ? Promise.resolve() : new Promise(() => {})),
    },
    createSheet: () => new FakeSheet(),
    MutationObserver: class {
      constructor(callback: () => void) {
        observed = callback;
      }
      observe(): void {}
      disconnect(): void {
        disconnected = true;
      }
    },
  } as unknown as ShellEnv;
  const theme = (on: boolean): void => {
    if (on) style.set('--fluvy-theme', '1');
    else style.delete('--fluvy-theme');
    observed?.();
  };
  /** The look engine covering the whole app (`<html fluvy-look>`) instead of the theme's inline sentinel. */
  const look = (on: boolean): void => {
    if (on) attributes.set('fluvy-look', '');
    else attributes.delete('fluvy-look');
    observed?.();
  };
  /** This device is a wall panel on a wall dashboard (`<html fluvy-wall>`). */
  const wall = (on: boolean): void => {
    if (on) attributes.set('fluvy-wall', '');
    else attributes.delete('fluvy-wall');
    observed?.();
  };
  /** A house's choice on `<html>` (the corner: `fluvy-sidebar-logo`, `fluvy-flat`; a list: `fluvy-sidebar-separators`). */
  const mark = (name: string, on: boolean, value = ''): void => {
    if (on) attributes.set(name, value);
    else attributes.delete(name);
    observed?.();
  };
  return {
    env,
    document,
    input,
    classes,
    theme,
    look,
    wall,
    mark,
    isDisconnected: () => disconnected,
  };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const sheetOf = (handle: ShellHandle, id: string) =>
  handle.report().sheets.find((s) => s.id === id)!;

let running: ShellHandle | undefined;
afterEach(() => {
  running?.stop();
  running = undefined;
});

describe('shell registry', () => {
  it('names every sheet once, targets the document or an element tag, and carries css', () => {
    expect(new Set(SHEETS.map((s) => s.id)).size).toBe(SHEETS.length);
    for (const sheet of SHEETS) {
      expect(
        sheet.target === 'document' || /^[a-z][a-z0-9._]*-[a-z0-9._-]*$/.test(sheet.target),
        sheet.target,
      ).toBe(true);
      expect(sheet.css.trim().length).toBeGreaterThan(0);
      expect(sheet.css).not.toMatch(/undefined|\[object/);
    }
  });

  it('never sets a dialog’s or a sheet’s height to zero: Home Assistant takes a dialog’s maximum from its minimum (#73)', () => {
    const zero = /--[\w-]*(?:dialog|sheet)[\w-]*height\s*:\s*0(?![.\d])/;
    // what 1.10.0 shipped for the Create automation chooser, which opened 0 px tall
    expect('ha-adaptive-dialog { --ha-dialog-min-height: 0px; }').toMatch(zero);
    for (const sheet of SHEETS) expect(sheet.css, sheet.id).not.toMatch(zero);
  });

  it('ends every keyframes it redefines opaque, so a dialog that has shown is never left see-through', () => {
    const redefined = SHEETS.flatMap((sheet) =>
      [...sheet.css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?\})\s*\}/g)].map(
        ([, name, frames]) => ({ name: `${sheet.id} ${name}`, frames: frames as string }),
      ),
    );
    expect(redefined.length).toBeGreaterThan(0);
    for (const { name, frames } of redefined.filter((k) => k.frames.includes('opacity')))
      expect(/(?:\bto|100%)\s*\{([^}]*)\}/.exec(frames)?.[1], name).toMatch(/opacity:\s*1\s*;/);
  });
});

describe('shell lifecycle', () => {
  it("attaches every sheet once, empty while the fluvy theme is not the page's theme", async () => {
    const { env, document, input, classes } = page();
    running = startShell(env)!;
    await settle();
    // the page's sheet and the wall's page sheet, both on the document
    expect(document.adoptedStyleSheets).toHaveLength(2);
    expect((document.adoptedStyleSheets[0] as FakeSheet).css).toBe('');
    expect((document.adoptedStyleSheets[1] as FakeSheet).css).toBe('');
    const inputClass = classes.get('ha-input')!.elementStyles;
    expect(inputClass).toHaveLength(2);
    expect(inputClass[0]).toBe('theirs'); // ours goes last: it wins at equal specificity
    expect(input.shadowRoot!.adoptedStyleSheets).toContain(inputClass[1]); // the live instance got it too
    expect(running.report().active).toBe(false);
  });

  it('fills the wall sheets on the wall attribute alone, whatever the theme, and empties them without it', async () => {
    const { env, document, wall, theme } = page();
    running = startShell(env)!;
    await settle();
    const pageSheet = document.adoptedStyleSheets[0] as FakeSheet;
    const wallSheet = document.adoptedStyleSheets[1] as FakeSheet;
    wall(true);
    expect(wallSheet.css).toBe(SHEETS.find((s) => s.id === 'wall:page')!.css);
    expect(pageSheet.css).toBe(''); // the theme is not on: the rest stay empty
    theme(true);
    expect(pageSheet.css).toBe(SHEETS.find((s) => s.id === 'page')!.css);
    expect(wallSheet.css).not.toBe('');
    wall(false);
    expect(wallSheet.css).toBe('');
    expect(pageSheet.css).not.toBe('');
    expect(running.report().sheets.filter((s) => s.id.startsWith('wall:'))).toHaveLength(5);
  });

  it('fills a wall’s way back from a subview on the house’s choice, and only on a wall', async () => {
    const { env, classes, wall, mark } = page();
    classes.set('hui-root', { elementStyles: [] });
    running = startShell(env)!;
    await settle();
    const root = classes.get('hui-root');
    const filled = (id: string): boolean => {
      const spec = SHEETS.find((s) => s.id === id)!;
      return (root?.elementStyles ?? []).some((sheet) => (sheet as FakeSheet).css === spec.css);
    };
    mark(WALL_BACK_ATTRIBUTE, true);
    await settle();
    expect(filled('wall:subview-back')).toBe(false); // not a wall yet
    wall(true);
    await settle();
    expect(filled('wall:subview-back')).toBe(true);
    expect(filled('wall:subview-header')).toBe(false);
    mark(WALL_BACK_ATTRIBUTE, false);
    mark(WALL_HEADER_ATTRIBUTE, true);
    await settle();
    expect(filled('wall:subview-back')).toBe(false);
    expect(filled('wall:subview-header')).toBe(true);
    // its rules hang on a subview alone: a wall's own views keep no header
    for (const id of ['wall:subview-back', 'wall:subview-header'])
      for (const rule of SHEETS.find((s) => s.id === id)!
        .css.split('\n')
        .filter((r) => r.endsWith('{')))
        expect(rule).toMatch(/^:host\(\[fluvy-subview\]\)/);
  });

  it('fills the view tabs’ sheet whatever the theme: its rules hang on our marks alone', async () => {
    const { env, classes, theme } = page();
    classes.set('hui-root', { elementStyles: [] });
    running = startShell(env)!;
    await settle();
    const spec = SHEETS.find((s) => s.id === 'view-tabs')!;
    expect(spec.choice).toBe('always');
    const root = classes.get('hui-root');
    const filled = (): boolean =>
      (root?.elementStyles ?? []).some((sheet) => (sheet as FakeSheet).css === spec.css);
    expect(filled()).toBe(true);
    theme(true);
    expect(filled()).toBe(true);
    theme(false);
    expect(filled()).toBe(true);
    // every rule is scoped to a mark (the tabs, the corner): a root without one is Home Assistant's
    for (const rule of spec.css.split('\n'))
      expect(rule).toMatch(/^:host\(\[fluvy-(tab|flat|header-page|actions-menu)/);
  });

  it('fills the device size’s sheet whatever the theme: without our variable it zooms nothing', () => {
    const spec = SHEETS.find((s) => s.id === 'device-zoom')!;
    expect(spec.choice).toBe('always');
    // each rule is the variable (absent: 1, the view's own size) or the edit mode's 1
    for (const rule of spec.css.split('\n'))
      expect(rule).toMatch(/\{ zoom: (var\(--fluvy-zoom, 1\)|1); \}$/);
  });

  it('fills a choice’s sheets only while the house makes it, and only with the theme', async () => {
    const { env, classes, theme, mark } = page();
    classes.set('ha-sidebar', { elementStyles: [] });
    running = startShell(env)!;
    await settle();
    const css = (id: string): string => SHEETS.find((s) => s.id === id)!.css;
    const filled = (id: string): boolean =>
      (classes.get('ha-sidebar')?.elementStyles ?? []).some(
        (sheet) => (sheet as FakeSheet).css === css(id),
      );
    theme(true);
    expect(filled('sidebar-logo')).toBe(false);
    mark('fluvy-sidebar-logo', true);
    expect(filled('sidebar-logo')).toBe(true);
    expect(filled('sidebar-flat')).toBe(false);
    mark('fluvy-flat', true);
    expect(filled('sidebar-flat')).toBe(true);
    // another theme takes the sidebar back whatever the choices
    theme(false);
    expect(filled('sidebar-logo')).toBe(false);
    theme(true);
    mark('fluvy-sidebar-logo', false);
    expect(filled('sidebar-logo')).toBe(false);
    expect(filled('sidebar-flat')).toBe(true);
  });

  it('draws a line after each sidebar item the house chose, and again when the list changes', async () => {
    const { env, classes, theme, mark } = page();
    classes.set('ha-sidebar', { elementStyles: [] });
    running = startShell(env)!;
    await settle();
    /** The sidebar's separators as drawn now: the one sheet that grows an item's margin for its line. */
    const lines = (): string =>
      (classes.get('ha-sidebar')?.elementStyles ?? [])
        .map((sheet) => (sheet as FakeSheet).css)
        .find((css) => css.includes('margin-block-end: 21px')) ?? '';
    theme(true);
    expect(lines()).toBe('');
    mark('fluvy-sidebar-separators', true, 'fluvy-home');
    expect(lines()).toContain(':is(#sidebar-panel-fluvy-home)::after');
    // the same attribute, another list: the sheet follows its value
    mark('fluvy-sidebar-separators', true, 'fluvy-home lovelace');
    expect(lines()).toContain(':is(#sidebar-panel-fluvy-home, #sidebar-panel-lovelace)::after');
    // another theme takes the sidebar back
    theme(false);
    expect(lines()).toBe('');
    theme(true);
    mark('fluvy-sidebar-separators', false);
    expect(lines()).toBe('');
  });

  it('fills the sheets when the theme arrives and empties them when it leaves', async () => {
    const { env, document, classes, theme } = page();
    running = startShell(env)!;
    await settle();
    theme(true);
    const pageSheet = document.adoptedStyleSheets[0] as FakeSheet;
    const inputSheet = classes.get('ha-input')!.elementStyles[1] as FakeSheet;
    expect(pageSheet.css).toBe(SHEETS.find((s) => s.id === 'page')!.css);
    expect(inputSheet.css).toBe(SHEETS.find((s) => s.id === 'input')!.css);
    theme(false);
    expect(pageSheet.css).toBe('');
    expect(inputSheet.css).toBe('');
  });

  it('also fills them while the look engine covers the whole app, without any theme', async () => {
    const { env, document, look } = page();
    running = startShell(env)!;
    await settle();
    look(true);
    const pageSheet = document.adoptedStyleSheets[0] as FakeSheet;
    expect(pageSheet.css).toBe(SHEETS.find((s) => s.id === 'page')!.css);
    expect(running.report().active).toBe(true);
    look(false);
    expect(pageSheet.css).toBe('');
  });

  it('reports what it styles and whether Home Assistant still draws the probed parts', async () => {
    const { env, theme } = page();
    running = startShell(env)!;
    await settle();
    theme(true);
    expect(running.report().active).toBe(true);
    expect(sheetOf(running, 'input')).toMatchObject({ attached: true, instances: 1, probe: true });
    expect(sheetOf(running, 'frame')).toMatchObject({ attached: true, instances: 1, probe: false }); // no home-assistant-main in this page
    expect(sheetOf(running, 'sidebar')).toMatchObject({
      attached: false,
      instances: 0,
      probe: null,
    }); // not defined here
  });

  it('starts once, and stop() empties the sheets and lets go of the observer', async () => {
    const { env, document, theme, isDisconnected } = page();
    running = startShell(env)!;
    expect(startShell(env)).toBe(running);
    await settle();
    theme(true);
    running.stop();
    expect((document.adoptedStyleSheets[0] as FakeSheet).css).toBe('');
    expect(isDisconnected()).toBe(true);
    running = startShell(env)!;
    expect(running).toBeDefined();
  });
});
