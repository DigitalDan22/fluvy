import { resolveEntity, strings, type EntityView, type HomeAssistant } from '@fluvy/core';
import { glyph, type GlyphName } from '@fluvy/ui';
import { css, html, nothing, type TemplateResult } from 'lit';

import { motionOf } from '../shared/motion.js';
import { stateWord } from '../shared/domain.js';

const s = strings('cameras');
const c = strings('camera');

/**
 * What a camera's line says under its name: `auto` its motion sensor's word where it has one (the camera's own
 * `motion`, else the one on its device), else its own state; `motion` and `state` the one asked for; `none` nothing.
 */
export type CameraStatus = 'auto' | 'motion' | 'state' | 'none';

/** A camera's line: its glyph, its words, and whether it says that someone is there now. */
export interface StatusLine {
  readonly glyph: GlyphName;
  readonly text: string;
  /** Its shorter words, where the whole would not hold (read in full all the same). */
  readonly short?: string;
  readonly motion: boolean;
}

/**
 * The camera's own state in words: online while it waits, recording, streaming, else as Home Assistant says it; out of
 * reach, "Offline" (unavailable) or the state's word — what its plate says too — beside the ban glyph, or quiet
 * (`unavailable`) the camera's own.
 */
export function stateLine(
  hass: HomeAssistant | undefined,
  view: EntityView,
  quiet = false,
): StatusLine {
  const away: GlyphName = quiet ? 'camera' : 'ban';
  if (view.status === 'unavailable')
    return { glyph: away, text: s(hass, 'offline'), motion: false };
  if (view.status !== 'ok') return { glyph: away, text: stateWord(hass, view), motion: false };
  const own = view.state === 'recording' || view.state === 'streaming' ? view.state : 'online';
  return { glyph: 'wifi', text: s(hass, own), motion: false };
}

/**
 * The motion sensor a camera's line reads: the one named (`motion`), else the one on the camera's device; none where
 * the line does not read one (`state`, `none`).
 */
export const motionSensor = (
  hass: HomeAssistant | undefined,
  camera: string,
  mode: CameraStatus,
  motion: string | undefined,
): string | undefined =>
  mode === 'auto' || mode === 'motion' ? (motion ?? motionOf(hass, camera)) : undefined;

/**
 * A camera's line under its name, or none (`none`). A camera out of reach says so (`ban`: "Offline", or why); a motion
 * sensor that can be read says whether it sees someone (the running figure, the eye), one that cannot leaves the line
 * to the camera's state (`wifi`).
 */
export function cameraStatus(
  hass: HomeAssistant | undefined,
  view: EntityView,
  mode: CameraStatus,
  motion: string | undefined,
  quiet = false,
): StatusLine | null {
  if (mode === 'none') return null;
  const sensor = view.status === 'ok' ? motionSensor(hass, view.id, mode, motion) : undefined;
  const seen = sensor ? resolveEntity(hass, sensor) : undefined;
  if (seen?.status === 'ok' && (seen.state === 'on' || seen.state === 'off'))
    return seen.state === 'on'
      ? { glyph: 'motion', text: s(hass, 'motion'), motion: true }
      : { glyph: 'eye', text: s(hass, 'no_motion'), motion: false };
  return stateLine(hass, view, quiet);
}

/**
 * A live picture's line while its stream cannot play (its stills show meanwhile): "Stream unavailable", "No stream"
 * where that would not hold — said under the picture, where "Live" folds to its dot on a narrow tile.
 */
export const streamLine = (hass: HomeAssistant | undefined): StatusLine => ({
  glyph: 'ban',
  text: c(hass, 'stream_failed'),
  short: s(hass, 'no_stream'),
  motion: false,
});

/**
 * The words a camera's line may say while it is drawn as it is, the longest of them deciding the room it is given: a
 * line that reads a motion sensor may say either of its two, and a live picture's that its stream cannot play (its
 * short form), so the tiles never move when someone walks by or a stream fails.
 */
export function statusWords(
  hass: HomeAssistant | undefined,
  line: StatusLine | null,
  sensor: string | undefined,
  live = false,
): readonly string[] {
  if (!line) return [];
  const words = sensor ? [s(hass, 'motion'), s(hass, 'no_motion'), line.text] : [line.text];
  return live ? [...words, s(hass, 'no_stream')] : words;
}

/** The line's glyph (16) and the gap after it: what its words have beside them less. */
export const STATUS_GLYPH = 22;

/** How a line is drawn: with its glyph or not, and its words (whole, or short), or none (its glyph alone). */
export interface LineFit {
  readonly glyph: boolean;
  readonly text: string | null;
}

/**
 * How the lines of a set (a card's tiles or rows, the sheet's rows) are drawn in `room`, given every word each may say
 * (`statusWords`): with their glyphs while every line holds whole beside its glyph, else every one without it; a line
 * says its whole words where they hold, else its short ones; one whose words would still be cut says its glyph alone.
 */
export function fitLines(
  words: readonly (readonly string[])[],
  room: number,
  width: (text: string) => number,
): (line: StatusLine) => LineFit {
  const glyphs = words.every((said) => said.every((text) => width(text) + STATUS_GLYPH <= room));
  const beside = glyphs ? STATUS_GLYPH : 0;
  return (line) => {
    const text = [line.text, line.short].find(
      (said) => said !== undefined && width(said) + beside <= room,
    );
    return text === undefined ? { glyph: true, text: null } : { glyph: glyphs, text };
  };
}

/** A camera's line drawn as it fits: a reader hears its whole words where it shows fewer. */
export const renderStatus = (line: StatusLine, fit: LineFit): TemplateResult =>
  html`<span
    class="fv-row__sub cm-status"
    aria-label=${fit.text === line.text ? nothing : line.text}
    >${fit.glyph ? glyph(line.glyph) : nothing}${fit.text ?? nothing}</span
  >`;

/** A camera's line and its thumbnail (80 × 44, its live dot on it): the Cameras card's rows and its sheet's alike. */
export const cameraRowStyles = css`
  .cm-status {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 20px;
    line-height: 20px;
  }
  .cm-status svg {
    flex: none;
    width: 16px;
    height: 16px;
  }
  .cm-thumb {
    position: relative;
    flex: none;
    width: 80px;
    height: 44px;
    border-radius: 12px;
    overflow: hidden;
    background: var(--fluvy-page);
  }
  .cm-thumb.is-off {
    display: grid;
    place-items: center;
    outline: 1px dashed var(--fluvy-unavailable-border);
    outline-offset: -1px;
    color: var(--fluvy-unavailable);
  }
  .cm-thumb.is-off svg {
    width: 20px;
    height: 20px;
  }
  .cm-thumb__live {
    position: absolute;
    top: 6px;
    left: 6px;
    z-index: 2;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #f0453a;
    box-shadow: 0 0 0 1px rgb(255 255 255 / 0.55);
    transition: opacity var(--fv-base) var(--fv-ease);
  }
  .cm-thumb__live.is-stale {
    opacity: 0;
  }
  .cm-row .fv-row__text {
    flex: 1 1 auto;
    min-width: 0;
  }
  .cm-row + .cm-row::before {
    left: 92px;
  }
  .cm-row + .cm-row.fv-row--bare::before {
    left: 0;
  }
`;
