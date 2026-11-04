import type { HassConnection, HomeAssistant } from '@fluvy/core';
import type { ReactiveController } from 'lit';
import { describe, expect, it } from 'vitest';
import { asText, iconRefOf, isTemplate, PENDING_LINE, TemplateTexts } from './templates.js';

/** One `render_template` subscription the fake socket holds: what was asked, where to answer, whether it is over. */
interface Open {
  readonly message: Record<string, unknown>;
  readonly answer: (event: unknown) => void;
  /** Lets the subscribe call answer (at once, unless the socket holds its answers). */
  readonly open: () => void;
  released: boolean;
}

/** A socket that records its subscriptions; a template that says `refused` is rejected, as Home Assistant would. */
function socket({ hold = false } = {}) {
  const open: Open[] = [];
  const connection = {
    subscribeMessage: (callback: (event: unknown) => void, message: Record<string, unknown>) =>
      new Promise<() => void>((resolve, reject) => {
        if (String(message['template']).includes('refused')) {
          reject(new Error('TemplateError: refused'));
          return;
        }
        const entry: Open = {
          message,
          answer: callback,
          released: false,
          open: () =>
            resolve(() => {
              entry.released = true;
            }),
        };
        open.push(entry);
        if (!hold) entry.open();
      }),
  } as unknown as HassConnection;
  return { connection, open, live: () => open.filter((entry) => !entry.released) };
}

/** A card as the controller sees it: it counts the renders asked for, and runs one render with the lifecycle round it. */
class Host {
  readonly controllers: ReactiveController[] = [];
  readonly updateComplete = Promise.resolve(true);
  updates = 0;
  isConnected = true;
  hass: HomeAssistant | undefined;

  constructor(connection: HassConnection) {
    this.hass = {
      connection,
      user: { id: 'u1', name: 'Marta', is_admin: false },
    } as unknown as HomeAssistant;
  }
  addController(controller: ReactiveController): void {
    this.controllers.push(controller);
  }
  removeController(): void {}
  requestUpdate(): void {
    this.updates += 1;
  }
  /** One render: `ask` is the card's render, reading the controller. */
  render<T>(ask: () => T): T {
    for (const controller of this.controllers) controller.hostUpdate?.();
    const out = ask();
    for (const controller of this.controllers) controller.hostUpdated?.();
    return out;
  }
  connect(): void {
    this.isConnected = true;
    for (const controller of this.controllers) controller.hostConnected?.();
  }
  disconnect(): void {
    this.isConnected = false;
    for (const controller of this.controllers) controller.hostDisconnected?.();
  }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const T = "{{ states('sensor.t') | round(1) }} °C";

/** A controller on a fresh socket, after one render that asked `T` for `sensor.t`. */
async function shown({ hold = false } = {}) {
  const wire = socket({ hold });
  const host = new Host(wire.connection);
  const texts = new TemplateTexts(host);
  host.render(() => texts.text(T, 'sensor.t'));
  await flush();
  return { ...wire, host, texts, read: () => host.render(() => texts.text(T, 'sensor.t')) };
}

describe('isTemplate / asText', () => {
  it('knows a template by its braces, and says a value as one line', () => {
    expect(isTemplate("{{ states('a') }}")).toBe(true);
    expect(isTemplate('{% if x %}y{% endif %}')).toBe(true);
    expect(isTemplate('last-changed')).toBe(false);
    expect(asText(null)).toBe('');
    expect(asText(undefined)).toBe('');
    expect(asText(22.5)).toBe('22.5');
    expect(asText(true)).toBe('true');
    expect(asText(['a', 1])).toBe('["a",1]');
  });
});

describe('TemplateTexts', () => {
  it('subscribes once for two rows that ask the same template for the same entity', async () => {
    const { connection, open } = socket();
    const host = new Host(connection);
    const texts = new TemplateTexts(host);
    const first = host.render(() => [
      texts.text(T, 'climate.a'),
      texts.text(T, 'climate.a'),
      texts.text(T, 'climate.b'),
      texts.text('{{ user }}'),
    ]);
    expect(first).toEqual(['', '', '', '']); // never the template itself
    await flush();
    expect(open).toHaveLength(3);
    expect(open[0]!.message).toEqual({
      type: 'render_template',
      template: T,
      variables: { entity: 'climate.a', user: 'Marta' },
      entity_ids: ['climate.a'],
      timeout: 3,
      report_errors: true,
      strict: false,
    });
    expect(open[2]!.message['entity_ids']).toBeUndefined();
    expect(open[2]!.message['variables']).toEqual({ entity: undefined, user: 'Marta' });
  });

  it('shows what Home Assistant renders, as text, and draws the card again for each new result', async () => {
    const { open, host, read } = await shown();
    const before = host.updates;
    open[0]!.answer({ result: 22.5, listeners: {} });
    expect(host.updates).toBe(before + 1);
    expect(read()).toBe('22.5');
    open[0]!.answer({ result: 22.5, listeners: {} });
    expect(host.updates).toBe(before + 1); // the same text: nothing to draw
    open[0]!.answer({ result: null, listeners: {} });
    expect(read()).toBe('');
    open[0]!.answer({ result: { a: 1 }, listeners: {} });
    expect(read()).toBe('{"a":1}');
    expect(open[0]!.released).toBe(false);
  });

  it('says nothing on an error and keeps listening; a template Home Assistant refuses says nothing', async () => {
    const { open, host, texts, read } = await shown();
    open[0]!.answer({ result: 'Open', listeners: {} });
    expect(read()).toBe('Open');
    open[0]!.answer({ error: "UndefinedError: 'x' is undefined", level: 'ERROR' });
    expect(read()).toBe('');
    open[0]!.answer({ result: 'Closed', listeners: {} });
    expect(read()).toBe('Closed');
    expect(open[0]!.released).toBe(false);

    const before = host.updates;
    host.render(() => texts.text('{{ refused }}'));
    await flush();
    expect(host.render(() => texts.text('{{ refused }}'))).toBe('');
    expect(host.updates).toBe(before + 1); // the held line lets go: one redraw, then quiet
    expect(open).toHaveLength(1); // the refused one never opened
  });

  it('takes a warning for no answer: the line holds, and the result that follows it is the answer', async () => {
    const { open, host, texts } = await shown();
    const read = (): string[] =>
      host.render(() => [texts.text(T, 'sensor.t'), texts.line(T, 'sensor.t')]);
    // Home Assistant says a name the template reads that is not defined as a warning, before the result
    const before = host.updates;
    open[0]!.answer({ error: "'room' is undefined", level: 'WARNING' });
    expect(host.updates).toBe(before); // nothing to draw: still pending
    expect(read()).toEqual(['', PENDING_LINE]);
    open[0]!.answer({ result: '22.5', listeners: {} });
    expect(read()).toEqual(['22.5', '22.5']);
    // a warning on a later render keeps what the line said until its result lands
    open[0]!.answer({ error: "'room' is undefined", level: 'WARNING' });
    expect(read()).toEqual(['22.5', '22.5']);
    open[0]!.answer({ result: '23', listeners: {} });
    expect(read()).toEqual(['23', '23']);
    open[0]!.answer({ error: "UndefinedError: 'x' is undefined", level: 'ERROR' });
    expect(read()).toEqual(['', '']); // an error is an answer: nothing
  });

  it('holds a row’s line while Home Assistant has not answered, and lets it go on an answered nothing', async () => {
    const { connection, open } = socket();
    const host = new Host(connection);
    const texts = new TemplateTexts(host);
    const read = (): string[] =>
      host.render(() => [
        texts.text(T, 'a'),
        texts.line(T, 'a'),
        texts.resolve(T, 'a'),
        texts.resolve('Study', 'a'),
        texts.line('{{ refused }}'),
      ]);
    // before the socket has even been asked, a line is pending too
    expect(read()).toEqual(['', PENDING_LINE, PENDING_LINE, 'Study', PENDING_LINE]);
    await flush();
    expect(read()).toEqual(['', PENDING_LINE, PENDING_LINE, 'Study', '']); // refused: answered with nothing
    const before = host.updates;
    open[0]!.answer({ result: null, listeners: {} });
    expect(host.updates).toBe(before + 1); // an answered nothing is a change: the held line goes
    expect(read()).toEqual(['', '', '', 'Study', '']);
    open[0]!.answer({ result: 'Open', listeners: {} });
    expect(read().slice(0, 3)).toEqual(['Open', 'Open', 'Open']);
    open[0]!.answer({ error: "UndefinedError: 'x' is undefined", level: 'ERROR' });
    expect(read().slice(0, 3)).toEqual(['', '', '']); // an error ends with nothing, not with a blank
  });

  it('releases a template no row asks for any more, and keeps the others', async () => {
    const { connection, open, live } = socket();
    const host = new Host(connection);
    const texts = new TemplateTexts(host);
    host.render(() => [texts.text(T, 'a'), texts.text(T, 'b')]);
    await flush();
    expect(live()).toHaveLength(2);
    host.render(() => texts.text(T, 'a'));
    await flush();
    expect(open[1]!.released).toBe(true);
    expect(open[0]!.released).toBe(false);
    host.render(() => texts.text(T, 'a'));
    await flush();
    expect(open).toHaveLength(2); // asked again: no second subscription
  });

  it('releases everything when the card leaves the page, keeps the text, and asks again when it comes back', async () => {
    const { open, live, host, read } = await shown();
    open[0]!.answer({ result: 22.5, listeners: {} });
    host.disconnect();
    expect(live()).toHaveLength(0);
    expect(read()).toBe('22.5'); // off the page, what it showed stays
    await flush();
    expect(open).toHaveLength(1); // a render off the page subscribes to nothing
    const before = host.updates;
    host.connect();
    expect(host.updates).toBe(before + 1); // back: a render, so it can ask again
    read();
    await flush();
    expect(live()).toHaveLength(1);
    expect(open).toHaveLength(2);
  });

  it('releases a subscription Home Assistant confirms after the card left', async () => {
    const { open, host } = await shown({ hold: true });
    host.disconnect();
    expect(open[0]!.released).toBe(false); // nothing to release yet: the socket has not answered
    open[0]!.open();
    await flush();
    expect(open[0]!.released).toBe(true);
  });

  it('subscribes again on a new connection, and shows the last text meanwhile', async () => {
    const { open, host, read } = await shown();
    open[0]!.answer({ result: 22.5, listeners: {} });
    const next = socket();
    host.hass = { ...host.hass, connection: next.connection } as HomeAssistant;
    expect(read()).toBe('22.5');
    await flush();
    expect(open[0]!.released).toBe(true);
    expect(next.live()).toHaveLength(1);
    next.open[0]!.answer({ result: 23, listeners: {} });
    expect(read()).toBe('23');
  });
});

describe('iconRefOf: an icon by its set, or a glyph’s name', () => {
  it('takes an id with its set, and a Fluvy glyph', () => {
    expect(iconRefOf('mdi:lightbulb-on')).toBe('mdi:lightbulb-on');
    expect(iconRefOf(' fluvy:door-open ')).toBe('fluvy:door-open');
    expect(iconRefOf('bulb')).toBe('bulb');
  });

  it('gives nothing for anything else: words, an empty answer, an id without its set', () => {
    expect(iconRefOf('')).toBeUndefined();
    expect(iconRefOf('lightbulb')).toBeUndefined();
    expect(iconRefOf('mdi:')).toBeUndefined();
    expect(iconRefOf('the light is on')).toBeUndefined();
    expect(iconRefOf('mdi:light bulb')).toBeUndefined();
  });
});
