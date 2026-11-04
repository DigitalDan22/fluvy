import { css, html, nothing, type TemplateResult } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import type { ArtName } from './art/art.js';
import type { ApplianceKind } from './kinds.js';

/*
 * An appliance's picture: the product drawing of its kind (the `appliance-art` chunk, fetched by the first card that
 * draws one and kept), the person's own picture (`image`: an address, or an entity whose `entity_picture` it is), or
 * nothing while the drawings are on their way — the box keeps its size, so nothing moves when they land. The person's
 * picture is read as every card reads one (`imageOf`, shared/picture.ts).
 */

/** What a card shows in a picture's place: the drawing (default), the kind's circle, or nothing. */
export type PictureStyle = 'art' | 'icon' | 'none';

/** A picture's box: 64, 44, 32, or none. */
export type PictureSize = 0 | 32 | 44 | 64;

/** The sizes a picture steps down through, largest first: a drawing's (or one's own) 64, 44 and 32; a circle's. */
const STEPS: Readonly<Record<'art' | 'icon', readonly PictureSize[]>> = {
  art: [64, 44, 32],
  icon: [64, 44],
};

/** The sizes a card's picture may take, largest first, and whether it is kept where a name would hold without it. */
export interface PictureLadder {
  readonly sizes: readonly PictureSize[];
  readonly keep: boolean;
}

/**
 * A card's picture ladder (#103): every step of its style, then none (default); or, where the card asks for a least
 * (`picture_min`: 32, 44 or 64, a number or its word), the steps from that least up, kept beside a name that ends in
 * its ellipsis. None at all without a picture.
 */
export function pictureLadder(style: PictureStyle | undefined, least: unknown): PictureLadder {
  if (style === 'none') return { sizes: [], keep: false };
  const steps = STEPS[style === 'icon' ? 'icon' : 'art'];
  const min = Number(least);
  return min > 0
    ? { sizes: steps.filter((size) => size >= Math.min(min, 64)), keep: true }
    : { sizes: steps, keep: false };
}

/** The drawing each kind is shown with: a washer-dryer the washer's, an air fryer the fryer's, a plug's the plug. */
export const KIND_ART: Readonly<Record<ApplianceKind, ArtName>> = {
  washer: 'washer',
  washer_dryer: 'washer',
  dryer: 'dryer',
  dishwasher: 'dishwasher',
  oven: 'oven',
  microwave: 'microwave',
  hob: 'hob',
  hood: 'hood',
  fridge: 'fridge',
  freezer: 'freezer',
  wine: 'wine',
  coffee: 'coffee',
  kettle: 'kettle',
  air_fryer: 'fryer',
  toaster: 'toaster',
  blender: 'blender',
  sandwich_maker: 'sandwich_maker',
  feeder: 'feeder',
  fountain: 'fountain',
  litter_box: 'litter_box',
  appliance: 'plug',
};

type Art = typeof import('./art/art.js');

let art: Art | undefined;
let loading: Promise<void> | undefined;
/** The cards waiting for the drawings: each draws again when they land. */
const waiting = new Set<() => void>();
/** Each kind's drawing, built once. */
const drawn = new Map<ArtName, TemplateResult>();

/** Fetches the drawings once; every card that asked draws again when they land. */
function load(then: () => void): void {
  waiting.add(then);
  loading ??= import('./art/art.js').then(
    (module) => {
      art = module;
      for (const draw of waiting) draw();
      waiting.clear();
    },
    () => {
      // a chunk that cannot be fetched (offline) is asked again by the next card that draws
      loading = undefined;
    },
  );
}

/** A kind's drawing, or undefined while the drawings are on their way (`then` runs when they land). */
export function artOf(kind: ApplianceKind, then: () => void): TemplateResult | undefined {
  const name = KIND_ART[kind];
  if (!art) {
    load(then);
    return undefined;
  }
  let template = drawn.get(name);
  if (!template) {
    template = html`<svg viewBox="0 0 64 64" aria-hidden="true">
      <defs>${unsafeSVG(art.ART_DEFS)}</defs>
      ${unsafeSVG(art.APPLIANCE_ART[name])}
    </svg>`;
    drawn.set(name, template);
  }
  return template;
}

/**
 * The picture's box and its drawing: the contact shadow in the page's ink and a rim light along its edges, both the
 * card's to set — none on a light card; on a dark one a deeper shadow, the rim, and a soft glow behind it, so a black
 * glass appliance does not sink into the card. Out of reach, it greys and fades with the card.
 */
export const pictureStyles = css`
  .ap-pic {
    display: inline-flex;
    flex: 0 0 var(--ap-pic);
    width: var(--ap-pic);
    height: var(--ap-pic);
    border-radius: var(--fluvy-radius-control);
    transition: scale var(--fv-fast) var(--fv-ease);
  }
  .ap-pic > svg,
  .ap-pic > img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .ap-pic .r {
    fill: none;
    stroke: var(--ap-rim, transparent);
    stroke-width: 1;
    stroke-linecap: round;
  }
  :host([dark]) .ap-pic {
    --ap-shade: #000;
    --ap-shade-o: 0.62;
    --ap-rim: rgb(255 255 255 / 24%);
    background: radial-gradient(closest-side, rgb(255 255 255 / 8%), transparent);
  }
  .is-unavailable .ap-pic {
    opacity: 0.5;
    filter: grayscale(1);
  }
`;

/** How much of a name a picture's step leaves room for: the whole of it, its least (a long one's 96), or none. */
export type NameRoom = 'whole' | 'least' | 'none';

/**
 * The picture of a row, and of the list's tiles together (#103): the largest step beside which the name holds whole
 * (and what the row says); else its least, while what it says holds beside it and a long name keeps its least — or,
 * kept, however short the name must be; else none. `fits` says whether a step leaves the room asked.
 */
export function pictureStep(
  sizes: readonly PictureSize[],
  keep: boolean,
  fits: (size: PictureSize, name: NameRoom) => boolean,
): PictureSize {
  const least = sizes.at(-1) ?? 0;
  return (
    sizes.find((size) => fits(size, 'whole')) ??
    (least && fits(least, keep ? 'none' : 'least') ? least : 0)
  );
}

/** The picture's box (`size` square), its drawing or the person's picture inside; empty until the drawings land. */
export function pictureBox(
  size: number,
  inside: TemplateResult | string | undefined,
  extra = '',
): TemplateResult {
  return html`<span class="ap-pic ${extra}" style="--ap-pic:${size}px" aria-hidden="true"
    >${typeof inside === 'string' ? html`<img src=${inside} alt="" />` : (inside ?? nothing)}</span
  >`;
}

/**
 * The whole card's head says what the appliance does beside its name where the slot beside its 64 picture holds at
 * least this (two thirds of the design's 180 at a 360 column); narrower, under the head, the card's width: by the
 * column, never by the words.
 */
export const SUB_BESIDE = 120;

/** How the whole card's head lays out, by its column and its name's width at 20 and at 16. */
export interface HeadFit {
  /** The picture's box: 64, 44, 32, or none. */
  readonly size: PictureSize;
  /** The name steps from 20 to 16. */
  readonly small: boolean;
  /** What it does goes under the head, the card's width. */
  readonly under: boolean;
  /** The room the name and what it does have beside the picture and the round. */
  readonly room: number;
}

/**
 * The whole card's head (#47, #103): the picture gives way before a letter of the name does — 64 where the whole name
 * holds beside it at 20, each smaller step of its ladder where it holds at 20 and then at 16 (44, 32), else none (the
 * name at 20, then 16) — and only a name that holds nowhere ends in its ellipsis, beside no picture; a picture the card
 * keeps (`picture_min`) stays at its least instead, the name at 16 ending in its ellipsis, while a slot of 72 holds
 * beside it. The picture keeps a slot of 72 at least beside it. What it does sits beside the name or under the head by
 * the column alone (`SUB_BESIDE` beside the 64), so the head of every card of a row is as tall as the next whatever its
 * name. `width` is the card's content, `trailing` the round and its gap (0 without one), `big` and `small` the
 * name's widths at 20 and at 16.
 */
export function headFit(
  width: number,
  trailing: number,
  ladder: PictureLadder,
  big: number,
  small: number,
): HeadFit {
  const room = (size: number): number => width - trailing - (size ? size + 16 : 0);
  const least = ladder.sizes.at(-1) ?? 0;
  // each step with the room it needs: the whole name at 20 (and at 16 beside all but the 64), a slot of 72 at least
  const steps: ReadonlyArray<readonly [PictureSize, boolean, number]> = [
    ...ladder.sizes.flatMap((size) =>
      (size === 64 ? [false] : [false, true]).map(
        (s) => [size, s, Math.max(72, s ? small : big)] as const,
      ),
    ),
    ...(ladder.keep && least ? [[least, true, 72] as const] : []),
    [0, false, big],
    [0, true, small],
  ];
  const [size, step] = steps.find(([n, , need]) => room(n) >= need) ?? [0, true];
  return { size, small: step, under: room(ladder.sizes[0] ?? 0) < SUB_BESIDE, room: room(size) };
}
