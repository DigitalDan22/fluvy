import type { HomeAssistant, LovelaceCard, LovelaceGridOptions } from '@fluvy/core';
import type { StatusColours } from '@fluvy/tokens/runtime';
import type { MockPeriod } from './collection.js';
import { createHass, type MockHouse, type MockOptions, type StateSeed } from './hass.js';
import { mergeWs, NOW, type FrameSpec, type SheetSpec } from './scenes.js';
import type { WsTable } from './ws.js';

/**
 * The house the sheets are drawn on, and a frame of theirs mounted on it: what the playground and the public demo both
 * draw with, so a card looks the same on either. The house holds everything the sheets bring — their states (the last
 * sheet's seed of an id wins), registries, history, statistics, repairs and the integrations' words, stored data, their
 * WebSocket and REST answers, the Energy date pickers' collections — and a frame keeps its own width, gap, columns,
 * status colours and view of the house.
 */

export type { MockHouse };

export interface HouseOptions {
  readonly dark: boolean;
  readonly language: string;
  /** Home Assistant's 12-hour clock; the 24-hour one unsaid. */
  readonly clock?: '12' | undefined;
  /** The range the Energy date pickers' collections start on (today unsaid). */
  readonly period?: MockPeriod | undefined;
  /** A house in °F and miles, whatever its sheets say (a sheet that stands alone may say so itself). */
  readonly units?: 'imperial' | undefined;
  /** How long a template takes to answer, in ms. */
  readonly templateDelay?: number | undefined;
  /** The page's own WebSocket answers (the settings panel's), asked after the sheets'. */
  readonly ws?: WsTable | undefined;
}

/** Every sheet's piece of one kind, merged into one record: a later sheet's key wins. */
const merged = <T extends object>(
  sheets: readonly SheetSpec[],
  pick: (sheet: SheetSpec) => T | undefined,
): T => Object.assign({}, ...sheets.map(pick)) as T;

/** The house of these sheets, at the sheets' moment (Thursday 17 September 2026, 21:47). */
export function createHouse(sheets: readonly SheetSpec[], options: HouseOptions): MockHouse {
  const states = new Map<string, StateSeed>();
  for (const sheet of sheets) for (const seed of sheet.states) states.set(seed[0], seed);
  const registry: NonNullable<MockOptions['registry']> = {
    entities: merged(sheets, (sheet) => sheet.registry?.entities),
    devices: merged(sheets, (sheet) => sheet.registry?.devices),
    areas: merged(sheets, (sheet) => sheet.registry?.areas),
    floors: merged(sheets, (sheet) => sheet.registry?.floors),
  };
  const imperial =
    options.units === 'imperial' || (sheets.length === 1 && sheets[0]?.units === 'imperial');
  return createHass([...states.values()], {
    dark: options.dark,
    language: options.language,
    ...(options.clock ? { clock: options.clock } : {}),
    now: NOW,
    registry,
    history: merged(sheets, (sheet) => sheet.history),
    statistics: merged(sheets, (sheet) => sheet.statistics),
    issues: sheets.flatMap((sheet) => sheet.issues ?? []),
    translations: merged(sheets, (sheet) => sheet.translations),
    data: {
      user: merged(sheets, (sheet) => sheet.data?.user),
      system: merged(sheets, (sheet) => sheet.data?.system),
    },
    ws: mergeWs([...sheets.map((sheet) => sheet.ws), options.ws]),
    collections: sheets.flatMap((sheet) => sheet.collections ?? []),
    ...(options.period ? { period: options.period } : {}),
    ...(options.templateDelay !== undefined ? { templateDelay: options.templateDelay } : {}),
    ...(imperial ? { units: 'imperial' as const } : {}),
    api: (method, path, body, house) => {
      for (const sheet of sheets) {
        const answer = sheet.api?.(method, path, body, house);
        if (answer !== undefined) return answer;
      }
      return [];
    },
  });
}

/** A card on the page, with the house as its frame shows it (a frame may answer some questions its own way). */
export interface MountedCard {
  readonly card: LovelaceCard;
  readonly view: (hass: HomeAssistant) => HomeAssistant;
}

export interface FrameOptions {
  /** The section's width, for a frame that names none; unsaid, the frame takes its column's (the demo's lanes). */
  readonly width?: number | undefined;
  /** A frame of a width of its own never wider than its column: it takes the column's where that is narrower. */
  readonly fit?: boolean | undefined;
  /** Puts the frame in status colours of its own (`FrameSpec.statuses`), in the look the page wears. */
  readonly wearStatuses?: ((frame: HTMLElement, own: StatusColours) => void) | undefined;
}

/**
 * The columns Home Assistant gives a card asked for `cols`: held to its own grid options' minimum and maximum. In a
 * frame of columns of its own (a grid card's), only its maximum holds it, and none past the frame's.
 */
function columnsOf(card: LovelaceCard, cols: number | undefined, total = 12): number {
  if (!cols) return total;
  let grid: LovelaceGridOptions | undefined;
  try {
    grid = card.getGridOptions?.();
  } catch {
    grid = undefined; // a card that cannot say (an error in its place) takes what it was given
  }
  if (total !== 12) return Math.min(cols, total);
  return Math.min(Math.max(cols, grid?.min_columns ?? 1), grid?.max_columns ?? 12);
}

/**
 * A sheet's frame as one dashboard section of its cards (`.pg-frame`), each given its config, its columns and the
 * house as the frame shows it. Marked `data-frame="<sheet>/<title>"` (`data-stress` for a frame the measurer leaves
 * out) and `data-span`, its narrowest card's columns: what the measurer's card probes pick frames by.
 */
export function mountFrame(
  name: string,
  frame: FrameSpec,
  hass: HomeAssistant,
  options: FrameOptions = {},
): { readonly el: HTMLElement; readonly cards: readonly MountedCard[] } {
  const el = document.createElement('section');
  el.className = 'pg-frame';
  el.dataset[frame.measure === false ? 'stress' : 'frame'] = `${name}/${frame.title}`;
  const width = frame.width ?? options.width;
  // content-box: the column's width less the frame's 16 px sides
  if (width !== undefined)
    el.style.width =
      options.fit && frame.width !== undefined ? `min(${width}px, 100% - 32px)` : `${width}px`;
  if (frame.gap !== undefined) el.style.gap = `${frame.gap}px`;
  if (frame.backdrop) el.style.setProperty('--pg-backdrop', frame.backdrop);
  if (frame.heights) el.dataset['heights'] = frame.heights.join(',');
  if (frame.statuses) options.wearStatuses?.(el, frame.statuses);
  const total = frame.columns ?? 12;
  if (frame.columns) el.style.gridTemplateColumns = `repeat(${total}, minmax(0, 1fr))`;
  const cards: MountedCard[] = [];
  // the narrowest card's columns (a half section is 6)
  let span = 12;
  for (const { cols, ...config } of frame.cards) {
    const tag = String(config.type).replace(/^custom:/, '');
    const card = document.createElement(tag) as LovelaceCard;
    try {
      card.setConfig(config);
    } catch (error) {
      card.textContent = String(error);
    }
    const view = frame.hass ?? ((house: HomeAssistant) => house);
    card.hass = view(hass);
    const given = columnsOf(card, cols, total);
    if (given < 12) {
      card.dataset['cols'] = String(given);
      card.style.gridColumn = `span ${given}`;
    } else if (total !== 12) card.style.gridColumn = `span ${given}`;
    span = Math.min(span, given);
    cards.push({ card, view });
    el.append(card);
  }
  el.dataset['span'] = String(span);
  return { el, cards };
}
