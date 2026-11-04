/**
 * The languages Fluvy speaks: one entry per catalogue in `./locales/`, with what the panel shows for it and the
 * cultural data its words need (the greeting's hours). Everything that lists, offers or resolves a language reads
 * this table; adding a language is one entry here, one catalogue, one integration translation file.
 */

export const LANGUAGE_CODES = [
  'en',
  'es',
  'de',
  'nl',
  'fr',
  'it',
  'pt-BR',
  'pt-PT',
  'tr',
  'ja',
  'hu',
  'sk',
] as const;

/** A code as Home Assistant reports `hass.language` for it (`pt-BR`, not `pt_BR`). */
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

/** A person's choice in Fluvy's settings: Home Assistant's language, or one of ours. */
export type CardLanguage = 'auto' | LanguageCode;

/** When the day's parts begin, in hours: the greeting's bands (`evening` absent: the afternoon runs into the night). */
export interface DayParts {
  readonly morning: number;
  readonly afternoon: number;
  readonly evening?: number;
  readonly night: number;
}

export interface LanguageInfo {
  readonly code: LanguageCode;
  /** The language's own name: what the select shows. */
  readonly name: string;
  /** Its English name: the select's hint, and what the docs say. */
  readonly english: string;
  readonly dayParts: DayParts;
  /**
   * How wide a weekday is written beside a day's number (the calendar's "Thursday 17"): `long` unless the language
   * writes it short there (Japanese prints 17日（木）, never 17日（木曜日）).
   */
  readonly weekday?: 'long' | 'short';
  /**
   * The code Home Assistant files the language under, where it differs from ours: what `hass.language` reports and
   * what the integration's translation file is named (Portugal's Portuguese is Home Assistant's `pt`; `pt-BR` is
   * Brazil's).
   */
  readonly ha?: string;
  /**
   * What joins two parts of one line (the calendar's "Thursday 17 · 4 events"): " · " unless the language has a mark
   * of its own (Japanese joins with 「・」, 17日（木）・イベント4件 — a space after a full-width bracket reads doubled).
   */
  readonly joiner?: string;
}

export const LANGUAGES: Readonly<Record<LanguageCode, LanguageInfo>> = {
  en: {
    code: 'en',
    name: 'English',
    english: 'English',
    // English greets the evening until 22:00 and only then says "night" (a farewell before that)
    dayParts: { morning: 5, afternoon: 12, evening: 18, night: 22 },
  },
  es: {
    code: 'es',
    name: 'Español',
    english: 'Spanish',
    // no evening: "buenas tardes" runs from lunch to about 20:00, "buenas noches" greets from then on
    dayParts: { morning: 5, afternoon: 13, night: 20 },
  },
  de: {
    code: 'de',
    name: 'Deutsch',
    english: 'German',
    dayParts: { morning: 5, afternoon: 11, evening: 18, night: 23 },
  },
  nl: {
    code: 'nl',
    name: 'Nederlands',
    english: 'Dutch',
    dayParts: { morning: 5, afternoon: 12, evening: 18, night: 24 },
  },
  fr: {
    code: 'fr',
    name: 'Français',
    english: 'French',
    // "bonjour" all day, "bonsoir" from 18:00: the afternoon says the morning's word
    dayParts: { morning: 5, afternoon: 12, evening: 18, night: 24 },
  },
  it: {
    code: 'it',
    name: 'Italiano',
    english: 'Italian',
    dayParts: { morning: 5, afternoon: 13, evening: 18, night: 23 },
  },
  'pt-BR': {
    code: 'pt-BR',
    name: 'Português (Brasil)',
    english: 'Portuguese (Brazil)',
    dayParts: { morning: 5, afternoon: 12, evening: 19, night: 24 },
  },
  'pt-PT': {
    code: 'pt-PT',
    name: 'Português (Portugal)',
    english: 'Portuguese (Portugal)',
    // "boa tarde" runs until dinner or dark, 20:00 (a summer's daylight lasts past 21:00); "boa noite" from then on
    dayParts: { morning: 5, afternoon: 12, evening: 20, night: 24 },
    ha: 'pt',
  },
  tr: {
    code: 'tr',
    name: 'Türkçe',
    english: 'Turkish',
    // "günaydın" until noon, "iyi günler" through the afternoon, "iyi akşamlar" from 18:00, "iyi geceler" late
    dayParts: { morning: 5, afternoon: 12, evening: 18, night: 22 },
  },
  ja: {
    code: 'ja',
    name: '日本語',
    english: 'Japanese',
    // three greetings: おはようございます until 11:00, こんにちは through the afternoon, こんばんは from 18:00 as the last
    // band (no evening); おやすみなさい is a farewell before sleep, never a greeting, and never shows
    dayParts: { morning: 5, afternoon: 11, night: 18 },
    weekday: 'short',
    joiner: '・',
  },
  hu: {
    code: 'hu',
    name: 'Magyar',
    english: 'Hungarian',
    // "jó reggelt" until 9:00, "jó napot" through the day, "jó estét" from 18:00; "jó éjszakát" is a farewell, so it is not a band
    dayParts: { morning: 5, afternoon: 9, night: 18 },
  },
  sk: {
    code: 'sk',
    name: 'Slovenčina',
    english: 'Slovak',
    // "dobré ráno" until 9:00 (the early morning only), "dobrý deň" through the day, "dobrý večer" from 18:00, and
    // "dobrú noc" late, as German's "gute Nacht"
    dayParts: { morning: 5, afternoon: 9, evening: 18, night: 23 },
  },
};

export const isLanguageCode = (value: unknown): value is LanguageCode =>
  typeof value === 'string' && (LANGUAGE_CODES as readonly string[]).includes(value);

export const isCardLanguage = (value: unknown): value is CardLanguage =>
  value === 'auto' || isLanguageCode(value);

/** The languages a person may choose, English first and the rest by their own names. */
export const offeredLanguages = (): readonly LanguageInfo[] => [
  LANGUAGES.en,
  ...LANGUAGE_CODES.filter((code) => code !== 'en')
    .map((code) => LANGUAGES[code])
    .sort((a, b) => a.name.localeCompare(b.name)),
];

/**
 * The language Fluvy speaks for a tag Home Assistant reports: the tag itself, else the language Home Assistant files
 * under it (`pt` → `pt-PT`); the same for its base (`es-ES` → `es`, `pt-AO` → `pt-PT`); else the first variant
 * shipped for that base, else English.
 */
export function resolveLanguage(tag: string | undefined): LanguageCode {
  if (!tag) return 'en';
  const code = tag.replace('_', '-');
  const base = code.split('-')[0]?.toLowerCase() ?? '';
  for (const candidate of [code, base]) {
    if (isLanguageCode(candidate)) return candidate;
    const filed = LANGUAGE_CODES.find((own) => LANGUAGES[own].ha === candidate);
    if (filed) return filed;
  }
  return LANGUAGE_CODES.find((own) => own.split('-')[0] === base) ?? 'en';
}

/** Fluvy has words in this language (any variant of it): its own copy is used rather than Home Assistant's translation. */
export function speaks(tag: string | undefined): boolean {
  if (!tag) return false;
  const base = tag.split(/[-_]/)[0]?.toLowerCase() ?? '';
  return LANGUAGE_CODES.some((code) => code.split('-')[0] === base);
}
