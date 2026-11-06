import {
  areaOf,
  deviceNameOf,
  domainOf,
  registryText,
  type HassEntity,
  type HomeAssistant,
} from '@fluvy/core';
import { onOff } from '../shared/config.js';
import {
  many,
  namedIds,
  type AlertDefinition,
  type ClauseSpec,
  type MatchConfig,
} from './model.js';

/*
 * An alert's clauses compiled once per config into predicates, each clause the AND of its tests ordered cheap to
 * dear: the domain and the ids (a set), the id's pattern, the device class, the state and its numbers, then what the
 * registries say (the integration, the device, the area and floor, the labels, hidden, config and diagnostic
 * entities), then the clause's exclusions. What a test asks of a registry by name (an area called "Kitchen") is
 * resolved to ids once per registry object. Unavailable and unknown never match unless the clause names them in
 * `state` or says `include_unavailable`. Home Assistant files every update as a config entity (one it can install)
 * or a diagnostic one: a clause that asks for the update domain keeps them whatever their category.
 */

/** One test of an entity: its id, its state, the house. */
type Test = (id: string, state: HassEntity, hass: HomeAssistant) => boolean;

/** A clause, compiled. */
export interface CompiledClause {
  /** Whether the entity matches it now (its `for` and `unchanged_for` aside: the engine keeps time). */
  readonly test: Test;
  /**
   * The latest moment it can have begun to hold, read off the entity: when the state last changed, or — a clause on
   * an attribute — when the entity last updated. A lower bound of how long it has held: the engine keeps the earliest
   * it has seen while the clause holds on.
   */
  readonly seed: (state: HassEntity) => number;
  readonly forMs: number;
  readonly unchangedMs: number | undefined;
  /** The domains it can match at all; undefined: any. */
  readonly domains: ReadonlySet<string> | undefined;
}

/** An alert's matcher: any clause holding, the exclusions not. */
export interface Matcher {
  readonly clauses: readonly CompiledClause[];
  /** Whether the alert never matches the entity, whatever it does. */
  readonly excluded: Test;
  /** The domains the alert can match at all (its clauses' together); undefined: any. */
  readonly domains: ReadonlySet<string> | undefined;
}

const UNAVAILABLE = new Set(['unavailable', 'unknown']);

const set = (values: readonly string[]): ReadonlySet<string> => new Set(values.map(String));

/** The states a clause names: an unquoted on or off in a YAML-mode dashboard is true or false, the word as well. */
const said = (values: readonly unknown[]): ReadonlySet<string> =>
  set(values.flatMap((value) => [String(value), String(onOff(value))]));

/** What a written pattern answers: a regular expression, or a glob. */
interface Pattern {
  test(text: string): boolean;
}

/**
 * `*` (any run of characters) and `?` (any one) over a text, whole; anything else as it is written. Read with two
 * marks, the last star's and where the text stood at it: a part that fails returns to that star, one character
 * further, so a pattern of many stars takes at most its length times the text's steps, where a regular expression of
 * them backtracked past any wait.
 */
function glob(written: string, ignoreCase = false): Pattern {
  const pattern = ignoreCase ? written.toLowerCase() : written;
  return {
    test(value) {
      const text = ignoreCase ? value.toLowerCase() : value;
      let p = 0;
      let t = 0;
      let star = -1;
      let from = 0;
      while (t < text.length) {
        const char = pattern[p];
        if (char === '*') {
          star = p++;
          from = t;
        } else if (p < pattern.length && (char === '?' || char === text[t])) {
          p++;
          t++;
        } else if (star >= 0) {
          p = star + 1;
          t = ++from;
        } else return false;
      }
      while (pattern[p] === '*') p++;
      return p === pattern.length;
    },
  };
}

/** An id pattern as written: a regular expression between slashes, else a glob. */
function pattern(text: string): Pattern {
  const regex = /^\/(.*)\/([a-z]*)$/.exec(text);
  return regex ? new RegExp(regex[1] ?? '', regex[2]) : glob(text);
}

const wild = (text: string): boolean => /[*?]/.test(text) || /^\/.*\/[a-z]*$/.test(text);

/** The domain a pattern can only match (`sensor.*_battery`), if its text says one before any wildcard. */
const patternDomain = (text: string): string | undefined =>
  /^([a-z_]+)\.[^*?]*/.test(text) && !text.startsWith('/')
    ? text.slice(0, text.indexOf('.'))
    : undefined;

/** A threshold a config wrote as a number or as its digits. */
const threshold = (value: unknown): number | undefined =>
  value === undefined ? undefined : Number(value);

/** A number off a state or an attribute: only text with digits in it is one (`Number('')` is 0). */
function numberOf(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !/\d/.test(value)) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** A name resolved to ids, once per registry object (`hass.areas`, `hass.devices`, `hass.floors`). */
function perRegistry<R extends object>(
  resolve: (registry: R) => ReadonlySet<string>,
): (registry: R) => ReadonlySet<string> {
  const cache = new WeakMap<R, ReadonlySet<string>>();
  return (registry) => {
    let ids = cache.get(registry);
    if (!ids) cache.set(registry, (ids = resolve(registry)));
    return ids;
  };
}

/** Ids by an id or a name, the name in any case. */
const byIdOrName = <E>(
  wanted: readonly string[],
  idOf: (entry: E) => string,
  nameOf: (entry: E) => string | null | undefined,
) =>
  perRegistry<Readonly<Record<string, E>>>((registry) => {
    const names = new Set(wanted.map((value) => value.toLowerCase()));
    const ids = new Set<string>();
    for (const [id, entry] of Object.entries(registry))
      if (wanted.includes(id) || names.has((nameOf(entry) ?? '').toLowerCase()))
        ids.add(idOf(entry) || id);
    return ids;
  });

const EMPTY: Readonly<Record<string, never>> = {};

/** The tests of one part of a clause, in the order they run; and the domains it allows. */
function partTests(part: MatchConfig): { tests: Test[]; domains: ReadonlySet<string> | undefined } {
  const tests: Test[] = [];
  // each key that can only match some domains says which: the part allows the ones they all allow
  const allowed: ReadonlySet<string>[] = [];
  const domainList = many(part.domain);
  const exact = namedIds(part);
  const patterns = many(part.entity_id);

  if (domainList.length) {
    const wanted = set(domainList);
    allowed.push(wanted);
    tests.push((id) => wanted.has(domainOf(id)));
  }
  if (exact.length) {
    const ids = set(exact);
    allowed.push(set(exact.map(domainOf)));
    tests.push((id) => ids.has(id));
  }
  if (patterns.length) {
    const plain = set(patterns.filter((text) => !wild(text)));
    const matchers = patterns.filter(wild).map(pattern);
    const owned = patterns.map((text) => (wild(text) ? patternDomain(text) : domainOf(text)));
    if (owned.every((domain): domain is string => domain !== undefined)) allowed.push(set(owned));
    tests.push((id) => plain.has(id) || matchers.some((matcher) => matcher.test(id)));
  }
  const classes = many(part.device_class);
  if (classes.length) {
    const wanted = set(classes);
    tests.push((_id, state) => wanted.has(String(state.attributes.device_class ?? '')));
  }

  // the value: the state, or the attribute when one is named
  const attribute = part.attribute;
  const value = (state: HassEntity): unknown =>
    attribute === undefined ? state.state : state.attributes[attribute];
  const states = many(part.state);
  if (states.length) {
    const wanted = said(states);
    tests.push((_id, state) => {
      const v = value(state);
      return v !== undefined && v !== null && wanted.has(String(v));
    });
  }
  const notStates = many(part.not_state);
  if (notStates.length) {
    const unwanted = said(notStates);
    tests.push((_id, state) => {
      const v = value(state);
      return v === undefined || v === null || !unwanted.has(String(v));
    });
  }
  const above = threshold(part.above);
  const below = threshold(part.below);
  if (above !== undefined || below !== undefined)
    tests.push((_id, state) => {
      const n = numberOf(value(state));
      return (
        n !== undefined && (above === undefined || n > above) && (below === undefined || n < below)
      );
    });
  if (
    attribute !== undefined &&
    !states.length &&
    !notStates.length &&
    above === undefined &&
    below === undefined
  )
    tests.push((_id, state) => Boolean(state.attributes[attribute]));

  // the registries
  const integrations = many(part.integration);
  if (integrations.length) {
    const wanted = set(integrations);
    tests.push((id, _state, hass) => wanted.has(hass.entities?.[id]?.platform ?? ''));
  }
  const deviceList = many(part.device);
  if (deviceList.length) {
    const names = deviceList.filter(wild).map((text) => glob(text, true));
    const devices = perRegistry<HomeAssistant['devices']>((registry) => {
      const ids = new Set<string>();
      for (const device of Object.values(registry)) {
        const name = (deviceNameOf(device) ?? '').toLowerCase();
        if (
          deviceList.includes(device.id) ||
          deviceList.some((text) => !wild(text) && text.toLowerCase() === name) ||
          names.some((glob) => glob.test(name))
        )
          ids.add(device.id);
      }
      return ids;
    });
    tests.push((id, _state, hass) => {
      const device = hass.entities?.[id]?.device_id;
      return device !== undefined && devices(hass.devices ?? EMPTY).has(device);
    });
  }
  const areaList = many(part.area);
  const floorList = many(part.floor);
  if (areaList.length) {
    const areas = byIdOrName<{ area_id: string; name: string }>(
      areaList,
      (a) => a.area_id,
      (a) => registryText(a.name),
    );
    tests.push((id, _state, hass) => {
      const area = areaOf(hass, id);
      return area !== undefined && areas(hass.areas ?? EMPTY).has(area);
    });
  }
  if (floorList.length) {
    const floors = byIdOrName<{ floor_id: string; name: string }>(
      floorList,
      (f) => f.floor_id,
      (f) => registryText(f.name),
    );
    tests.push((id, _state, hass) => {
      const area = areaOf(hass, id);
      const floor = area ? hass.areas?.[area]?.floor_id : undefined;
      return typeof floor === 'string' && floors(hass.floors ?? EMPTY).has(floor);
    });
  }
  const labels = many(part.label);
  if (labels.length) {
    const wanted = set(labels);
    const any = (list: readonly string[] | undefined): boolean =>
      list?.some((l) => wanted.has(l)) ?? false;
    tests.push((id, _state, hass) => {
      const entry = hass.entities?.[id];
      const device = entry?.device_id ? hass.devices?.[entry.device_id] : undefined;
      const area = areaOf(hass, id);
      return (
        any(entry?.labels) ||
        any(device?.labels) ||
        any(area ? hass.areas?.[area]?.labels : undefined)
      );
    });
  }
  const exclusions = many(part.exclude);
  if (exclusions.length) {
    const excluded = exclusionOf(exclusions);
    tests.push((id, state, hass) => !excluded(id, state, hass));
  }
  return { tests, domains: within(allowed) };
}

/** The domains every one of these sets allows; undefined when none constrains. */
function within(sets: readonly ReadonlySet<string>[]): ReadonlySet<string> | undefined {
  const [first, ...rest] = sets;
  return first && new Set([...first].filter((domain) => rest.every((other) => other.has(domain))));
}

/** Whether an entity is one of these: ids, patterns, or clauses (any of them). */
function exclusionOf(list: readonly (string | MatchConfig)[]): Test {
  const ids = set(list.filter((item): item is string => typeof item === 'string' && !wild(item)));
  const matchers = list
    .filter((item): item is string => typeof item === 'string' && wild(item))
    .map(pattern);
  const clauses = list
    .filter((item): item is MatchConfig => typeof item === 'object' && item !== null)
    .map((item) => partTests(item).tests);
  return (id, state, hass) =>
    ids.has(id) ||
    matchers.some((matcher) => matcher.test(id)) ||
    clauses.some((tests) => tests.every((test) => test(id, state, hass)));
}

/** A clause, compiled: its parts' tests, the registry's word on hidden, config and diagnostic entities, availability. */
function compileClause(spec: ClauseSpec): CompiledClause {
  const parts = spec.parts.map(partTests);
  const tests = parts.flatMap((part) => part.tests);
  const named = new Set(spec.parts.flatMap(namedIds));
  const asked =
    spec.includeUnavailable ||
    spec.parts.some((part) => many(part.state).some((s) => UNAVAILABLE.has(s)));
  const onAttribute = spec.parts.some((part) => part.attribute !== undefined);
  const domains = within(parts.flatMap((part) => (part.domains ? [part.domains] : [])));
  const updates = domains?.has('update') ?? false;
  return {
    test: (id, state, hass) => {
      if (!asked && UNAVAILABLE.has(state.state)) return false;
      for (const test of tests) if (!test(id, state, hass)) return false;
      // an entity named by its id is always wanted
      const entry = named.has(id) ? undefined : hass.entities?.[id];
      if (entry?.hidden && !spec.hidden) return false;
      // every update is config or diagnostic (whether Home Assistant installs it): a clause on updates reads neither
      const category = updates && domainOf(id) === 'update' ? undefined : entry?.entity_category;
      if (category === 'config') return false;
      if (category === 'diagnostic' && !spec.diagnostic) return false;
      return true;
    },
    seed: (state) => instant(onAttribute ? state.last_updated : state.last_changed),
    forMs: spec.forMs,
    unchangedMs: spec.unchangedMs,
    domains,
  };
}

/** A state's time in ms; a time it cannot read is now (the entity has held for no time we know of). */
export function instant(text: string | undefined): number {
  const t = text ? Date.parse(text) : Number.NaN;
  return Number.isFinite(t) ? t : Date.now();
}

/** An alert's matcher, compiled once per config. */
export function compileMatcher(definition: AlertDefinition): Matcher {
  const clauses = definition.clauses.map(compileClause);
  const domains = clauses.every((clause) => clause.domains)
    ? new Set(clauses.flatMap((clause) => [...(clause.domains ?? [])]))
    : undefined;
  return {
    clauses,
    excluded: definition.exclude.length ? exclusionOf(definition.exclude) : () => false,
    domains,
  };
}
