import {
  formatNumber,
  valueParts,
  type EntityView,
  type HomeAssistant,
  type ValueParts,
} from '@fluvy/core';

/**
 * One rule for the units and the decimals of every figure. Home Assistant lets every integration choose its own unit
 * (one string in W, the inverter in kW, the meter in MWh), so a value is first brought to its base unit — W, Wh or
 * VA — and a set read together is then displayed in ONE unit: the one the card asks for (`unit`), else the one its
 * largest figure asks for (3 200 W beside 250 W reads "3.2 kW" and "0.25 kW"). Its decimals are the card's
 * (`decimals`, fixed, so a live figure keeps its width), else the sensor's own precision where the shown unit is the
 * sensor's, else what the figure's size asks for. Any other unit passes through.
 *
 * The classes are the ones Home Assistant's statistics convert between (its `EnergyConverter`, `PowerConverter`,
 * `VolumeConverter` and `DistanceConverter`), each unit by its factor to its class's base. Every page knows the watt
 * ladders; the rest of the energy class and the power class, the volume and the distance come with the energy family
 * (`history-bars/units.ts`, `registerUnits`), the moment its chunk lands, as its cards do. A unit of another class, or
 * one no class knows, is not convertible: the card keeps the sensor's own.
 */

export type UnitClass = 'energy' | 'power' | 'volume' | 'distance';
/** A class's units by their factor to its base: Wh, W, L or m. */
export type Factors = Readonly<Record<string, number>>;

const FACTORS: Record<UnitClass, Factors> = {
  energy: { Wh: 1, kWh: 1e3, MWh: 1e6, GWh: 1e9 },
  power: { W: 1, kW: 1e3, MW: 1e6, GW: 1e9 },
  volume: {},
  distance: {},
};

/** The units a family brings with it, added to their classes. */
export function registerUnits(classes: Partial<Record<UnitClass, Factors>>): void {
  for (const [kind, units] of Object.entries(classes) as [UnitClass, Factors][])
    FACTORS[kind] = { ...FACTORS[kind], ...units };
}

const CLASSES = Object.keys(FACTORS) as UnitClass[];

/** The units a card's editor offers a class's figures in: the ones a house reads in (a distance is typed). */
export const LADDERS: Readonly<Record<UnitClass, readonly string[]>> = {
  power: ['W', 'kW', 'MW'],
  energy: ['Wh', 'kWh', 'MWh'],
  volume: ['L', 'm³', 'gal', 'ft³'],
  distance: [],
};

/** The keys a card's figures take, on the card or on an item of its list. */
export interface NumberKeys {
  /** The unit the figures read in, of their class (W, kW, MW; Wh, kWh, MWh; L, m³, gal, ft³); one of another class is ignored. */
  unit?: string;
  /** The figures' decimals, fixed (0–3); without it, the sensor's own precision in its own unit, else what each figure's size asks. */
  decimals?: number;
}

/** The class a unit belongs to, or undefined for one no class knows. */
export const unitClass = (unit: string): UnitClass | undefined =>
  CLASSES.find((name) => Object.hasOwn(FACTORS[name], unit.trim()));

/** A unit's factor to its class's base, for the family's converters; none for a unit no class knows. */
export const factorOf = (unit: string): number | undefined => {
  const kind = unitClass(unit);
  return kind && FACTORS[kind][unit.trim()];
};

/** The units a sensor's figures may be asked in: its class's ladder, none where it has no class or no ladder. */
export const ladderOf = (unit: string): readonly string[] => {
  const kind = unitClass(unit);
  return kind ? LADDERS[kind] : [];
};

/* ---------- the ladder ---------- */

const SCALABLE = /^(m|k|M|G)?(Wh|W|VA)$/;
const PREFIX: Record<string, number> = { m: 0.001, k: 1e3, M: 1e6, G: 1e9 };

export interface Quantity {
  readonly value: number;
  readonly unit: string;
}

export interface Scale {
  readonly unit: string;
  readonly divisor: number;
}

/** A scale and the decimals its figures are written with: fixed where set, else by each figure's size. */
export interface Figures extends Scale {
  readonly digits?: number;
}

/** What a card may ask of its figures: the unit they read in, and their decimals. */
export interface NumberOptions {
  readonly unit?: unknown;
  readonly decimals?: unknown;
}

/** The value in its base unit. `toBase(1, unit)` is the factor and the base unit of a whole series. */
export function toBase(value: number, unit: string): Quantity {
  const match = SCALABLE.exec(unit.trim());
  if (!match) return { value, unit };
  return { value: value * (PREFIX[match[1] ?? ''] ?? 1), unit: match[2] ?? unit };
}

/** An entity's reading in its base unit, or null when it has no usable number. */
export const baseOf = (view: EntityView): Quantity | null =>
  view.number === null ? null : toBase(view.number, view.unit);

/** The display unit for a set of base-unit figures: the largest one decides. */
export function scaleFor(peak: number, unit: string): Scale {
  const size = Math.abs(peak);
  if (!SCALABLE.test(unit)) return { unit, divisor: 1 };
  if (size >= 1e9) return { unit: `G${unit}`, divisor: 1e9 };
  if (size >= 1e6) return { unit: `M${unit}`, divisor: 1e6 };
  if (size >= 1e3) return { unit: `k${unit}`, divisor: 1e3 };
  return { unit, divisor: 1 };
}

/** The scale a named unit asks of base-unit figures (`kW` of W: 1 000); none for a unit not of the base's class. */
export function scaleNamed(unit: string, base: string): Scale | undefined {
  const kind = unitClass(base);
  const asked = unit.trim();
  if (!kind || unitClass(asked) !== kind) return undefined;
  return { unit: asked, divisor: (factorOf(asked) as number) / (factorOf(base) as number) };
}

/** The decimals a config asks for (`2`, `'2'`), none for `auto` or nothing: zero to three. */
export function decimalsOf(raw: unknown): number | undefined {
  const n = typeof raw === 'string' && raw !== '' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isFinite(n)
    ? Math.min(3, Math.max(0, Math.round(n)))
    : undefined;
}

/** The precision a sensor's registry entry asks for, when it has one. */
export const precisionOf = (
  hass: HomeAssistant | undefined,
  view: EntityView | undefined,
): number | undefined => {
  const precision = view && hass?.entities?.[view.id]?.display_precision;
  return typeof precision === 'number' && Number.isFinite(precision) ? precision : undefined;
};

/**
 * The one rule: the unit a set of base-unit figures reads in — the one asked, where it is of the base's class, else
 * the one its `peak` asks for — and the decimals they are written with: the ones asked, else the sensor's own
 * precision where the shown unit is the sensor's (`view`), else each figure's size.
 */
export function figuresOf(
  hass: HomeAssistant | undefined,
  asked: NumberOptions = {},
  base: string,
  peak: number,
  view?: EntityView,
): Figures {
  const scale =
    (typeof asked.unit === 'string' ? scaleNamed(asked.unit, base) : undefined) ??
    scaleFor(peak, base);
  const digits =
    decimalsOf(asked.decimals) ??
    (view && scale.unit === view.unit.trim() ? precisionOf(hass, view) : undefined);
  return digits === undefined ? scale : { ...scale, digits };
}

/** The decimals a figure of this size is written with: the precision asked, else three significant places at most. */
const digitsFor = (size: number, precision?: number): number =>
  precision ?? (size >= 100 ? 0 : size >= 1 ? 1 : 2);

/** The number alone: three significant places at most (0.25 · 3.2 · 11.2 · 142), or the entity's own precision. */
export function figure(
  hass: HomeAssistant | undefined,
  value: number,
  scale: Scale,
  precision?: number,
): string {
  const shown = value / scale.divisor;
  const size = Math.abs(shown);
  const digits = digitsFor(size, precision);
  // a scaled figure keeps its one decimal (1.0 kW beside 2.2 kW; 0.4 and 0 stay as they are), as does a precision
  // the entity asks for
  const fixed = precision !== undefined || (scale.divisor > 1 && size >= 1 && size < 100);
  return formatNumber(hass, shown, { digits, ...(fixed ? { minDigits: digits } : {}) }).replace(
    /^-/,
    '−',
  ); // the design's minus, not a hyphen
}

/** A base-unit figure as its set writes it: in the set's unit, at the set's decimals. */
export const writeFigure = (
  hass: HomeAssistant | undefined,
  value: number,
  figures: Figures,
): string => figure(hass, value, figures, figures.digits);

/** Whether its set writes a base-unit figure as nothing, its decimals rounding it away (4 Wh as "0.00" kWh). */
export function writesZero(value: number, figures: Figures): boolean {
  const size = Math.abs(value / figures.divisor);
  return Math.round(size * 10 ** digitsFor(size, figures.digits)) === 0;
}

/**
 * A sensor's own figure as a card asks it: in `unit` where the sensor's converts to it, at `decimals` where set (else
 * the sensor's precision where that unit is its own), else as Home Assistant writes it (its precision; W and Wh
 * brought up once long) — the rule of a card whose figures are read one by one, not as a set.
 */
export function askedParts(
  hass: HomeAssistant | undefined,
  view: EntityView,
  asked: NumberOptions = {},
  value: number | null = view.number,
): ValueParts {
  const digits = decimalsOf(asked.decimals);
  const named = typeof asked.unit === 'string' ? scaleNamed(asked.unit, view.unit) : undefined;
  if (named && value !== null)
    return {
      value: figure(
        hass,
        value,
        named,
        digits ?? (named.divisor === 1 ? precisionOf(hass, view) : undefined),
      ),
      unit: named.unit,
    };
  return valueParts(
    hass,
    value === view.number ? view : { ...view, number: value },
    digits === undefined ? {} : { digits, minDigits: digits },
  );
}

/** "3.2 kW" for rows, tiles and legends that set value and unit in one run. */
export function figureText(
  hass: HomeAssistant | undefined,
  value: number,
  scale: Scale,
  precision?: number,
): string {
  const text = figure(hass, value, scale, precision);
  return scale.unit ? `${text} ${scale.unit}` : text;
}

/** A round ceiling just above a peak (2.9 → 3, 4 100 → 4 500, 46 → 50): the top of a scale nobody configured. */
export function ceilingFor(span: number): number {
  if (!(span > 0) || !Number.isFinite(span)) return 0;
  const step = 10 ** Math.floor(Math.log10(span)) / 2;
  return Math.ceil(span / step - 1e-9) * step;
}
