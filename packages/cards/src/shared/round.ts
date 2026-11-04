import { clickPress, icon, preventMenu, startPress, type IconRef, type Tone } from '@fluvy/ui';
import { html, nothing, svg, type TemplateResult } from 'lit';

/** A round: the 44 circle (`lt-bulb`), 8 from the next. */
export const ROUND = 44;
export const ROUND_GAP = 8;
/** Its ring: 4 inside the edge, on the round's fill, where its ink reads in every palette. */
const RING = ROUND / 2 - 4;
const RING_LENGTH = 2 * Math.PI * RING;

/** A round that says a level: a light of the room lights' row, a room's quick action. */
export interface LevelRound {
  /** What a reader hears it is, and reads on hover. */
  readonly name: string;
  readonly glyph: IconRef | string;
  /** It can be read; else the dashed ring, which takes no tap (a hold still opens it). One with no tap is drawn as it
   * reads, its tap off. */
  readonly usable: boolean;
  readonly on: boolean;
  /** Its ring while on, in % from the top: 100 all the way round. */
  readonly level: number;
  /** The tone it is drawn in while on, and the colour that redefines it (`data-accent`), if any. */
  readonly tone: Tone;
  readonly accent: string | undefined;
  /** Its tap turns it on and off (a switch to a reader); else it is a button. */
  readonly switches: boolean;
  readonly onTap: (() => void) | undefined;
  readonly onHold: (() => void) | undefined;
  /** Where it stands among rounds placed one by one (`left`, `top`). */
  readonly place?: string | undefined;
}

/**
 * A round (`lt-bulb`): its glyph; on, its colour's fill and a 2 px ring of its level 4 inside its edge, from the top;
 * off, the neutral circle; unreadable, the dashed ring. A tap is its own, a hold its details: a press on it never
 * reaches what lies under it (the room's button, a head's).
 */
export function levelRound(round: LevelRound): TemplateResult {
  const tone: Tone = !round.usable ? 'off' : round.on ? round.tone : 'neutral';
  const down = (event: PointerEvent): void => {
    event.stopPropagation();
    startPress(event);
  };
  const click = (event: MouseEvent): void => {
    event.stopPropagation();
    clickPress(event);
  };
  return html`<button
    class="lt-bulb fv-ico fv-ico--${tone} ${round.on ? 'is-on' : ''}"
    style=${round.place ?? nothing}
    data-target
    data-accent=${round.on ? (round.accent ?? nothing) : nothing}
    role=${round.switches ? 'switch' : nothing}
    aria-checked=${round.switches ? String(round.on) : nothing}
    aria-disabled=${round.usable && round.onTap ? nothing : 'true'}
    aria-label=${round.name}
    title=${round.name}
    .fvTap=${round.usable ? round.onTap : undefined}
    .fvHold=${round.onHold}
    @pointerdown=${down}
    @click=${click}
    @contextmenu=${preventMenu}
  >
    ${icon(round.glyph)}
    ${
      round.on
        ? svg`<svg class="lt-ring" viewBox="0 0 ${ROUND} ${ROUND}" aria-hidden="true"><circle cx=${ROUND / 2} cy=${ROUND / 2} r=${RING} stroke-dasharray="${((RING_LENGTH * round.level) / 100).toFixed(2)} ${RING_LENGTH.toFixed(2)}"></circle></svg>`
        : nothing
    }
  </button>`;
}
