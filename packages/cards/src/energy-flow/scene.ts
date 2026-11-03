import type { Allocation } from '../energy-model/allocate.js';
import type { SourceKind } from '../energy-model/prefs.js';
import type { Directed } from '../energy-model/reading.js';

/**
 * What the flow diagram says, worked out apart from how it is drawn: which way each lane runs, whether it rests,
 * which colour it wears (its origin's), and the words beside each node. Figures are in the base unit of the
 * card's mode (W live, Wh over a period).
 */

/** A colour of the diagram: an origin's tone and, for a source given a colour of its own, its accent. */
export interface Ink {
  readonly tone: 'solar' | 'grid' | 'battery' | 'gas' | 'vehicle' | 'accent' | 'home';
  readonly accent?: string | undefined;
}

export const KIND_INK: Readonly<Record<SourceKind, Ink['tone']>> = {
  solar: 'solar',
  grid: 'grid',
  battery: 'battery',
  generator: 'gas',
  vehicle: 'vehicle',
};

export interface SceneNode {
  readonly kind: SourceKind;
  readonly ink: Ink;
  readonly reading: Directed;
  /** Below this (W, or Wh over a period) a direction rests. */
  readonly threshold: number;
  /** Two lanes: a grid that can import and export at the same moment. */
  readonly pair: boolean;
}

export type Way = 'in' | 'out';

export interface LaneState {
  readonly way: Way;
  /** Nothing flows: the lane at 50 %, its head at 35 %, no pulse. */
  readonly rest: boolean;
  /** The grid's second lane while it does not import and export at once. */
  readonly hidden: boolean;
  readonly watts: number;
  readonly ink: Ink;
}

/** What every lane of the diagram needs to know about the others: who fed whom, and each origin's colour. */
export interface Origins {
  readonly allocation: Allocation | null;
  readonly solar?: Ink | undefined;
  readonly grid?: Ink | undefined;
  readonly battery?: Ink | undefined;
}

/** A source that only ever flows toward the house. */
export const oneWay = (kind: SourceKind): boolean => kind === 'solar' || kind === 'generator';

/** The colour of what leaves the house toward a node: where that energy came from. */
export function outInk(node: SceneNode, o: Origins): Ink {
  const a = o.allocation;
  const pick = (
    first: Ink | undefined,
    firstShare: number,
    second: Ink | undefined,
    secondShare: number,
  ): Ink => (firstShare >= secondShare ? (first ?? second) : (second ?? first)) ?? node.ink;
  if (node.kind === 'grid')
    return pick(o.solar, a?.solarToGrid ?? 0, o.battery, a?.batteryToGrid ?? 0);
  if (node.kind === 'battery')
    return pick(o.solar, a?.solarToBattery ?? 0, o.grid, a?.gridToBattery ?? 0);
  if (node.kind === 'vehicle')
    return pick(o.solar, a?.solarToVehicle ?? 0, o.grid, a?.gridToVehicle ?? 0);
  return node.ink;
}

/**
 * A node's lanes. One lane runs in whichever way the energy flows (toward the house by default); a grid that can
 * import and export at the same moment has a second lane, shown only while it does both. A way below its
 * threshold rests; nothing is taken away, so nothing reshuffles.
 */
export function lanesOf(node: SceneNode, o: Origins): LaneState[] {
  const into = node.reading.in ?? 0;
  const out = node.reading.out ?? 0;
  const inOn = into >= node.threshold && into > 0;
  const outOn = !oneWay(node.kind) && out >= node.threshold && out > 0;
  const lane = (way: Way, on: boolean, hidden = false): LaneState => ({
    way,
    rest: !on,
    hidden,
    watts: way === 'in' ? into : out,
    ink: way === 'in' ? node.ink : outInk(node, o),
  });
  if (node.pair) {
    const both = inOn && outOn;
    return [!inOn && outOn ? lane('out', true) : lane('in', inOn), lane('out', outOn, !both)];
  }
  return [outOn && out > into ? lane('out', true) : lane('in', inOn)];
}

/** What the house used from each origin, as shares of the whole (the arcs round the house). */
export function houseShares(a: Allocation | null): { key: Ink['tone']; value: number }[] {
  const total = a?.usedTotal ?? 0;
  const share = (v: number): number => (total > 0 ? Math.max(0, Math.min(1, v / total)) : 0);
  return [
    { key: 'solar', value: share(a?.usedSolar ?? 0) },
    { key: 'battery', value: share(a?.usedBattery ?? 0) },
    { key: 'gas', value: share(a?.usedGenerator ?? 0) },
    { key: 'vehicle', value: share(a?.usedVehicle ?? 0) },
    { key: 'grid', value: share(a?.usedGrid ?? 0) },
  ];
}

/** The words beside a node: which figure, and what the direction is called. */
export interface Said {
  readonly first: { readonly value: number | null; readonly way: string };
  readonly second?: { readonly value: number; readonly way: string };
  /** Nothing flows (no way reaches its threshold): the figure, whatever it says, in the secondary ink. */
  readonly idle: boolean;
}

/** The direction words a card passes in (its language's): the grid's in/out, a battery's charging/discharging. */
export interface WayWords {
  readonly in: string;
  readonly out: string;
  readonly charging: string;
  readonly discharging: string;
  readonly charged: string;
  readonly discharged: string;
}

/**
 * A node's words. Live, a way under its threshold says 0: nothing flows. Over a period (`reads`, which tells a total
 * its figures' decimals write as more than nothing) every total is said as it is, rounded only by those decimals, as
 * Home Assistant's Energy dashboard says it (#109); the threshold only dims it, as it rests its lane.
 */
export function said(node: SceneNode, words: WayWords, reads?: (total: number) => boolean): Said {
  const into = node.reading.in;
  const out = node.reading.out;
  if (into === null || out === null) return { first: { value: null, way: '' }, idle: false };
  const flows = (value: number): boolean => value >= node.threshold && value > 0;
  const says = reads ?? flows;
  const inSaid = says(into);
  const outSaid = !oneWay(node.kind) && says(out);
  const idle = !flows(into) && (oneWay(node.kind) || !flows(out));
  if (oneWay(node.kind)) return { first: { value: inSaid ? into : 0, way: '' }, idle };
  const grid = node.kind === 'grid';
  // a period's battery charged and discharged; a moment's is charging, discharging
  const inWord = grid ? words.in : reads ? words.discharged : words.discharging;
  const outWord = grid ? words.out : reads ? words.charged : words.charging;
  if (inSaid && outSaid)
    return { first: { value: into, way: inWord }, second: { value: out, way: outWord }, idle };
  if (outSaid) return { first: { value: out, way: outWord }, idle };
  if (inSaid) return { first: { value: into, way: inWord }, idle };
  return { first: { value: 0, way: '' }, idle: true };
}
