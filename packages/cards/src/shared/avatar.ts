import type { EntityView } from '@fluvy/core';
import { html, nothing, type TemplateResult } from 'lit';

/** Two letters from the name: the face of a person without a picture. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1] ?? '') : '';
  return `${[...first][0] ?? '?'}${[...last][0] ?? ''}`.toLocaleUpperCase();
}

/**
 * Where a person is: home, away, somewhere nobody knows (`unknown`: the person is there to read, their trackers say
 * nothing) or out of reach (`off`: unavailable, or gone from the house).
 */
export type Presence = 'home' | 'away' | 'unknown' | 'off';

/** A person who cannot be placed: their presence unknown, or out of reach. */
export const unplaced = (view: EntityView): Presence =>
  view.status === 'unknown' ? 'unknown' : 'off';

export interface AvatarOptions {
  readonly name: string;
  /** The picture's URL ('' none). */
  readonly picture: string;
  readonly presence: Presence;
  /** Pictures that failed to load: those fall back to initials instead of a broken image. */
  readonly broken: ReadonlySet<string>;
  readonly onBroken: (picture: string) => void;
}

/**
 * A person's 44 circle (`.am-avatar`, ambient.css): the picture Home Assistant has, else initials on the accent
 * fill, with the presence dot; a picture that will not load falls back to the initials. Unknown or out of reach, the
 * dashed ring and no dot; quiet out of reach (#126) takes the ring off a person out of reach (`is-off`) alone.
 */
export function renderAvatar({
  name,
  picture,
  presence,
  broken,
  onBroken,
}: AvatarOptions): TemplateResult {
  const shown = picture !== '' && !broken.has(picture);
  return html`<span
    class="am-avatar ${presence === 'home' ? 'is-home' : ''} ${shown ? '' : 'is-initials'} ${presence === 'off' ? 'is-off' : presence === 'unknown' ? 'is-unknown' : ''}"
    data-icon
  >
    ${
      shown
        ? html`<img
            class="am-avatar__face"
            src=${picture}
            alt=""
            draggable="false"
            @error=${() => onBroken(picture)}
          />`
        : html`<span class="am-avatar__face" aria-hidden="true">${initials(name)}</span>`
    }
    ${presence === 'home' || presence === 'away' ? html`<i class="am-avatar__dot"></i>` : nothing}
  </span>`;
}
