/*
 * Copying a text for the person: the Clipboard API where the page has it (a secure context — HTTPS, or
 * localhost), else the older selection command on a throwaway field, which the browsers still honour on a plain
 * HTTP address in the house (`http://homeassistant.local:8123`). Resolves to whether the text was copied; the
 * caller says so, or says what to do instead. Nothing here throws.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* the secure API refused (no permission, no focus): the field below is the fallback */
  }
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.setAttribute('aria-hidden', 'true');
  field.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.append(field);
  const active = document.activeElement as HTMLElement | null;
  try {
    field.select();
    field.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
    active?.focus?.();
  }
}
