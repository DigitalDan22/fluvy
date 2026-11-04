import type { HassConnection, HomeAssistant } from '@fluvy/core';
import { isGlyph, type IconRef } from '@fluvy/ui';
import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { release, type Subscription } from './subscription.js';

/** Whether a row's text is a Home Assistant template, rather than a keyword or words of its own. */
export const isTemplate = (text: string): boolean => text.includes('{{') || text.includes('{%');

/** A value as a line of text: nothing for none, a list or a dict as JSON, anything else as it is said. */
export const asText = (value: unknown): string =>
  value === null || value === undefined
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);

/**
 * An icon a template's answer names: an id with its set (`mdi:lightbulb`, `fluvy:door-open`) or a Fluvy glyph's name
 * (`bulb`); nothing for any other text, which is never handed to an icon as it is.
 */
export function iconRefOf(text: string): IconRef | undefined {
  const word = text.trim();
  return /^[\w-]+:[\w-]+$/.test(word) || isGlyph(word) ? (word as IconRef) : undefined;
}

/** A blank line of a sub's height (a non-breaking space): what a row shows for a template Home Assistant has not answered yet. */
export const PENDING_LINE = '\u00a0';

/**
 * What `render_template` sends: the result each time it changes, or an error (and it keeps listening). An error comes
 * with its level: `ERROR` (the template failed: no result follows), or `WARNING` (under `strict: false`, a name the
 * template reads that is not defined, `{{ room }}`, is said as a warning while it renders, and its result follows:
 * Home Assistant's `handle_render_template` hands its `log_fn` the logging level's name).
 */
interface Rendered {
  readonly result?: unknown;
  readonly error?: string;
  readonly level?: string;
}

/** One template for one row: what it last rendered to, and the subscription that keeps it current. */
interface Feed {
  text: string;
  /** Home Assistant has spoken (a result, an error, a refusal): `text` is what it said, '' included. */
  answered: boolean;
  subscription?: Subscription;
}

/** The card that asks: its `hass` (the connection, the person's name) and whether it is on the page. */
type Host = ReactiveControllerHost & {
  readonly hass?: HomeAssistant | undefined;
  readonly isConnected: boolean;
};

const keyOf = (template: string, entityId: string | undefined): string =>
  `${entityId ?? ''}\n${template}`;

/**
 * A row's text rendered by Home Assistant, live. During its render a card asks `text(template, entityId)` and gets
 * what the template last rendered to ('' before the first answer, and after an error: never the template itself) —
 * or `line()`, a row's own line, which holds a blank line while Home Assistant has not answered yet, so the title
 * does not move when the words land; asking is what keeps a template subscribed. After the render, what was asked for is reconciled with what is
 * live: a new pair is subscribed to (`render_template`, one subscription however many rows ask for the same pair),
 * a pair no row asked for is released, and every new result draws the card again. Everything is released when the
 * card leaves the page or `hass.connection` changes; the texts are kept, so a card that comes back does not blink.
 * One instance per card: `private readonly texts = new TemplateTexts(this)`.
 */
export class TemplateTexts implements ReactiveController {
  private readonly feeds = new Map<string, Feed>();
  /** What this render asked for, by key: the template and the row's entity. */
  private readonly asked = new Map<string, readonly [template: string, entityId?: string]>();
  private connection: HassConnection | undefined;

  constructor(private readonly host: Host) {
    host.addController(this);
  }

  /** The text a template last rendered to for a row, '' until Home Assistant answers (what a line of parts is built from). */
  text(template: string, entityId?: string): string {
    return this.ask(template, entityId)?.text ?? '';
  }

  /**
   * The same as a row's own line: a blank line of the sub's height while Home Assistant has not answered yet, so the
   * title does not move when the words land; an answered '' — a template refused too — is no line at all.
   */
  line(template: string, entityId?: string): string {
    const feed = this.ask(template, entityId);
    return feed?.answered ? feed.text : PENDING_LINE;
  }

  /** A row's own line as it shows it: a template rendered (held while pending), anything else as written. */
  resolve(text: string, entityId?: string): string {
    return isTemplate(text) ? this.line(text, entityId) : text;
  }

  /** Notes that this render asks for the pair, and finds its feed when it has one. */
  private ask(template: string, entityId: string | undefined): Feed | undefined {
    const key = keyOf(template, entityId);
    this.asked.set(key, entityId === undefined ? [template] : [template, entityId]);
    return this.feeds.get(key);
  }

  hostConnected(): void {
    this.host.requestUpdate(); // back on the page: the render asks again, and `hostUpdated` subscribes
  }

  hostDisconnected(): void {
    this.releaseAll();
  }

  hostUpdate(): void {
    this.asked.clear();
  }

  hostUpdated(): void {
    const connection = this.host.isConnected ? this.host.hass?.connection : undefined;
    if (connection !== this.connection) {
      this.releaseAll();
      this.connection = connection;
    }
    for (const [key, feed] of this.feeds)
      if (!this.asked.has(key)) {
        if (feed.subscription) release(feed.subscription);
        this.feeds.delete(key);
      }
    if (!connection) return;
    for (const [key, [template, entityId]] of this.asked) {
      const feed = this.feeds.get(key) ?? { text: '', answered: false };
      this.feeds.set(key, feed);
      if (!feed.subscription) this.subscribe(connection, feed, template, entityId);
    }
  }

  private subscribe(
    connection: HassConnection,
    feed: Feed,
    template: string,
    entityId: string | undefined,
  ): void {
    const subscription: Subscription = { cancelled: false };
    feed.subscription = subscription;
    const answer = (text: string): void => {
      if (subscription.cancelled) return;
      const changed = !feed.answered || feed.text !== text; // the first answer always draws: a held line lets go
      feed.answered = true;
      feed.text = text;
      if (changed) this.host.requestUpdate();
    };
    connection
      .subscribeMessage<Rendered>(
        // a warning is not an answer: the result it comes before is, and the line holds what it last said meanwhile
        (message) => {
          if (message.level !== 'WARNING')
            answer(message.error === undefined ? asText(message.result) : '');
        },
        {
          type: 'render_template',
          template,
          variables: { entity: entityId, user: this.host.hass?.user?.name },
          entity_ids: entityId ? [entityId] : undefined,
          timeout: 3,
          report_errors: true,
          strict: false,
        },
      )
      .then((unsubscribe) => {
        subscription.unsubscribe = unsubscribe;
        if (subscription.cancelled) release(subscription); // the row left while the socket was answering
      })
      .catch(() => answer('')); // a template Home Assistant refuses: no line, no noise
  }

  /** Every subscription released; the texts stay for the next render. */
  private releaseAll(): void {
    for (const feed of this.feeds.values()) {
      if (feed.subscription) release(feed.subscription);
      delete feed.subscription;
    }
  }
}
