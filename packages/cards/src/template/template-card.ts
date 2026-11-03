import {
  isUsable,
  relativeTime,
  strings,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceCardConfig,
} from '@fluvy/core';
import type { TemplateResult } from 'lit';

import {
  FluvyTileCard,
  type TileCardConfig,
  type TileItem,
  type TileLevel,
  type TileLook,
  type TileSize,
} from '../tile/tile-card.js';
import type { CardEditor } from '../shared/base.js';
import type { Tint } from '../shared/colour.js';
import type { AliasSpec, Secondary } from '../shared/config.js';
import type { OptionWord } from '../shared/form.js';
import { changedAt } from '../shared/since.js';
import { isTemplate, PENDING_LINE, TemplateTexts } from '../shared/templates.js';
import { templateHeight } from '../template-family.js';
import { activeOf, colourOf, iconRefOf, type TemplateColour } from './values.js';

const s = strings('template');

/** When the tile shows as on: as its entity is (`auto`, the default), always, never, or as a template answers. */
export type Active = 'auto' | 'always' | 'never' | (string & {});

export interface TemplateCardConfig extends FluvyCardConfig {
  /**
   * The line under the name: the entity's state (the default, with one), its area, when it last changed, none (the
   * default without one), or words of your own — a template among them.
   */
  secondary?: Secondary;
  /** Where the entity's last change is read from (#67): a timestamp sensor, or `attribute:<name>` of its own; else Home Assistant's. */
  since?: string;
  active?: Active;
  /** `always`: the card's colour shows at rest too, a wash of it and its hairline (`on`, the default: only when on). */
  tint?: Tint;
  /** `compact` (the default): one 76 row. `mini`: 108, its icon over its name. `large`: 168, a switch and a foot. */
  variant?: TileSize;
  /** Sensors as small readouts in a large tile's foot. */
  readouts?: readonly string[];
}

export const VARIANTS: readonly TileSize[] = ['compact', 'mini', 'large'];
/** What `secondary` takes as a keyword; any other text is the person's own words. */
export const KEYWORDS = [
  'state',
  'area',
  'last-changed',
  'none',
] as const satisfies readonly OptionWord[];
const keyword = (text: string): boolean => (KEYWORDS as readonly string[]).includes(text);

/**
 * What a Mushroom template card says that Fluvy has no part for, let go once the editor saves: a tile fills its cell
 * already (`fill_container`) and keeps its line to one (`multiline_secondary`); a double tap is not one of its gestures;
 * Home Assistant knows the entities a template reads (`entity_id`).
 */
const LET_GO: readonly string[] = [
  'fill_container',
  'multiline_secondary',
  'double_tap_action',
  'entity_id',
  // Mushroom's later layout switch, once read (`true`, the mini tile) or saying nothing (`false`)
  'vertical',
];

/** The fields a template may fill: each keeps its last answer while Home Assistant works out the next. */
type Field = 'name' | 'icon' | 'secondary' | 'active' | 'color';

/**
 * The template card (#59): a tile whose name, line, icon, colour and fill are Home Assistant templates — or words of
 * its own, as any tile's are — with an entity, or with none. It is the tile card's tile (compact, mini or large), and
 * only says otherwise what the tile shows (`look`, `tileLine`): its switch, ruler and flip still follow the entity,
 * its fill follows `active`. A template is rendered by Home Assistant, live (`TemplateTexts`, one subscription per
 * template); until it answers, the tile shows what its entity would (its glyph, its palette, its state) and a blank
 * line where the words will land, so nothing moves when they do; a template that fails shows nothing of itself. A
 * tile of nothing (no entity) wears the live skin, toggles nothing, and is a button only for an action that runs
 * without an entity (navigate, a URL, an action, Assist). Mushroom's template card pastes in: `primary` is the name,
 * `icon_color` the colour, `layout: vertical` (or `vertical: true`) the mini tile; its `picture` and badge are not
 * drawn.
 */
export class FluvyTemplateCard extends FluvyTileCard {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: LovelaceCardConfig): number {
    return templateHeight(config);
  }

  static override editor(): Promise<CardEditor> {
    return import('./template-editor.js');
  }
  /**
   * Mushroom's template card, as it is pasted: its words and its colour by their names here, its layout as a variant
   * (`layout: vertical`, or its later `vertical: true`, the mini tile), and what Fluvy has no part for let go
   * (`LET_GO`); its picture and its badge stay in the config, not drawn. `active: true` is always and `false` never, as
   * YAML may say.
   */
  static override aliases: AliasSpec = {
    keys: [
      { from: 'primary', to: 'name' },
      { from: 'icon_color', to: 'color' },
      {
        from: 'layout',
        to: 'variant',
        when: (value) => value === 'vertical' || value === 'horizontal' || value === 'default',
        map: (value) => (value === 'vertical' ? 'mini' : 'compact'),
      },
      { from: 'vertical', to: 'variant', when: (value) => value === true, map: () => 'mini' },
    ],
    upgrade: (config) => {
      let next = config;
      if (LET_GO.some((key) => key in next))
        next = Object.fromEntries(Object.entries(next).filter(([key]) => !LET_GO.includes(key)));
      if (typeof next['active'] === 'boolean')
        next = { ...next, active: next['active'] ? 'always' : 'never' };
      return next;
    },
  };

  static override getStubConfig(_hass: unknown, entities: readonly string[]): TemplateCardConfig {
    const entity = entities.find((id) => /^(light|switch)\./.test(id)) ?? entities[0];
    return entity
      ? {
          type: 'custom:fluvy-template-card',
          entity,
          name: "{{ state_attr(entity, 'friendly_name') }}",
        }
      : { type: 'custom:fluvy-template-card', name: '{{ user }}', icon: 'mdi:account' };
  }

  private readonly texts = new TemplateTexts(this);
  /** Each field's last answer, shown while the next is on its way. */
  private readonly answers = new Map<Field, string>();

  private get own(): TemplateCardConfig {
    return this.config as TemplateCardConfig;
  }

  /** A card of nothing is a card too: no entity is required. */
  protected override prepare(config: TileCardConfig): TileCardConfig {
    return config;
  }

  protected override size(): TileSize {
    const variant = this.own.variant;
    return variant && VARIANTS.includes(variant) ? variant : 'compact';
  }

  protected override renderCard(): TemplateResult {
    return this.renderTile(this.item(), this.size());
  }

  /**
   * A field as it stands: as written, or what its template answered — the last answer while Home Assistant has not
   * given the current one (the template edited, the card back on the page); undefined before the first.
   */
  private answer(field: Field, text: unknown): string | undefined {
    if (text === undefined || text === null) return undefined;
    if (typeof text !== 'string' || !isTemplate(text)) return String(text);
    const line = this.texts.line(text, this.own.entity);
    if (line !== PENDING_LINE) this.answers.set(field, line);
    return this.answers.get(field);
  }

  /** The card's colour: as written, or what its template answers — a tone, or a colour on the card's palette. */
  private colour(): TemplateColour {
    const written = this.own.color;
    const color = this.answer('color', written);
    if (!isTemplate(written ?? '')) return color ? { color } : {};
    return colourOf(color ?? '', (choice) => this.accents.pick(choice));
  }

  /**
   * The config as the tile it draws: its templates answered; a name still to come, or one its template could not give,
   * a blank line of its height, so a tile's anatomy holds (a large tile's line never climbs into the name's place).
   */
  private item(): TileItem {
    const config = this.own;
    const name = this.answer('name', config.name);
    const icon = this.answer('icon', config.icon);
    const glyph = icon && isTemplate(config.icon ?? '') ? iconRefOf(icon) : icon;
    const { tone = config.tone, color } = this.colour();
    return {
      entity: config.entity ?? '',
      ...(config.name === undefined ? {} : { name: name || PENDING_LINE }),
      ...(glyph ? { icon: glyph } : {}),
      ...(tone ? { tone } : {}),
      ...(color ? { color } : {}),
      ...(this.size() === 'large' && config.readouts ? { readouts: config.readouts } : {}),
      ...(config.tap_action ? { tap_action: config.tap_action } : {}),
      ...(config.hold_action ? { hold_action: config.hold_action } : {}),
    };
  }

  /** Whether the tile shows as on: always, never, as its template answers, else as its entity is (`lit`). */
  private active(lit: boolean): boolean {
    const { active } = this.own;
    if (active === 'always' || active === 'never') return active === 'always';
    if (active && isTemplate(active)) {
      const answer = this.answer('active', active);
      if (answer !== undefined) return activeOf(answer);
    }
    return lit;
  }

  /** What the line under the name says: a keyword, or words of the person's own (a template's among them). */
  private secondary(): Secondary {
    // YAML may write a figure where words were meant (`secondary: 2`): they are its words
    return String(this.own.secondary ?? (this.own.entity ? 'state' : 'none'));
  }

  protected override look(item: TileItem, view: EntityView, lit: boolean): TileLook {
    const look = super.look(item, view, lit);
    const entity = Boolean(this.own.entity);
    // a tile of nothing is never out of reach: the live skin, its own icon or the template's (the code braces, never
    // the three dots a "more" round wears), its fill as it is asked
    const usable = look.usable || !entity;
    return {
      ...look,
      label: look.name.trim() || (entity ? view.name : s(this.hass, 'card')),
      glyph: entity ? look.glyph : (item.icon ?? 'code'),
      usable,
      on: usable && this.active(lit),
      // an entity out of reach says so on its line, whatever was asked: that is a state, fitted as one. An unknown one
      // is not out of reach (a button never pressed, its normal state): its line is the one asked for
      words: !keyword(this.secondary()) && (!entity || isUsable(view)),
    };
  }

  protected override tileLine(
    item: TileItem,
    view: EntityView,
    on: boolean,
    level: TileLevel | null,
    valueInHead: boolean,
    small = false,
  ): string {
    const entity = Boolean(this.own.entity);
    const secondary = this.secondary();
    if (entity && (secondary === 'state' || !isUsable(view)))
      return super.tileLine(item, view, on, level, valueInHead, small);
    if (secondary === 'state' || secondary === 'none') return '';
    const at = changedAt(this.hass, view, this.own.since);
    const changed = at ? relativeTime(this.hass, at) : '';
    if (secondary === 'area') return view.areaName || changed;
    if (secondary === 'last-changed') return changed;
    return isTemplate(secondary)
      ? (this.answer('secondary', secondary) ?? PENDING_LINE)
      : secondary;
  }
}
