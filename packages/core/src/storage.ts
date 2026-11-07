/**
 * This browser's storage, read and written defensively: in a private window, with blocked site data or in a test
 * page it may be missing or throw, and then nothing is remembered (never an error). Values are JSON; a text reads
 * and writes as it is.
 */
export function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** This tab's storage (it lasts while the tab does, through its reloads), read as defensively. */
export function safeSession(win?: Window): Storage | undefined {
  try {
    return (win ?? window).sessionStorage;
  } catch {
    return undefined;
  }
}

/** A remembered value (JSON), or undefined. */
export function readStored<T>(key: string): T | undefined {
  try {
    const raw = safeStorage()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

/** Remembers a value (JSON); undefined forgets it. */
export function writeStored(key: string, value: unknown): void {
  try {
    const storage = safeStorage();
    if (value === undefined) storage?.removeItem(key);
    else storage?.setItem(key, JSON.stringify(value));
  } catch {
    /* full or blocked: it is simply not remembered */
  }
}

/** A remembered text, or ''. */
export function readText(key: string): string {
  try {
    return safeStorage()?.getItem(key) ?? '';
  } catch {
    return '';
  }
}

/** Remembers a text as it is. */
export function writeText(key: string, value: string): void {
  try {
    safeStorage()?.setItem(key, value);
  } catch {
    /* full or blocked: it is simply not remembered */
  }
}
