// @vitest-environment happy-dom
import type { HomeAssistant } from '@fluvy/core';
import { afterEach, describe, expect, it } from 'vitest';
import { FluvyChipsCard } from './chips-card.js';

if (!customElements.get('fluvy-chips-card'))
  customElements.define('fluvy-chips-card', FluvyChipsCard);

/*
 * #87: a chip's words, icon and colour may be Home Assistant templates, rendered live through the card's one
 * subscription a template (never JavaScript); a template that fails or renders nothing says nothing of itself.
 */

/** What the socket answers each template with: its text, else an error. */
const ANSWERS: Readonly<Record<string, string>> = {
  "{{ states.person | selectattr('state', 'eq', 'home') | list | count }} home": '2 home',
  "{{ 'mdi:home-account' if true else 'mdi:home-outline' }}": 'mdi:home-account',
  '{{ the icon in words }}': 'a house',
  "{{ 'amber' }}": 'amber',
  "{{ 'url(javascript:alert(1))' }}": 'url(javascript:alert(1))',
  "{{ '' }}": '',
};

/** A socket that answers at once, and counts what is open. */
function house(): { hass: HomeAssistant; open: () => string[] } {
  const live = new Map<number, string>();
  let next = 0;
  const hass = {
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    states: {},
    entities: {},
    devices: {},
    areas: {},
    connection: {
      subscribeMessage: (callback: (event: unknown) => void, message: Record<string, unknown>) => {
        const template = String(message['template']);
        const id = next++;
        live.set(id, template);
        const answer = ANSWERS[template];
        callback(
          answer === undefined ? { error: 'TemplateError', level: 'ERROR' } : { result: answer },
        );
        return Promise.resolve(() => {
          live.delete(id);
        });
      },
    },
  } as unknown as HomeAssistant;
  return { hass, open: () => [...live.values()] };
}

type ChipsElement = FluvyChipsCard & { hass: HomeAssistant };

async function draw(chips: readonly Record<string, unknown>[], hass: HomeAssistant) {
  const card = document.createElement('fluvy-chips-card') as ChipsElement;
  card.setConfig({ type: 'custom:fluvy-chips-card', chips, tint: 'always' });
  card.hass = hass;
  document.body.append(card);
  await card.updateComplete;
  // the answers land after the first render: the second draws them
  await new Promise((resolve) => setTimeout(resolve, 0));
  await card.updateComplete;
  return card;
}

/** Each chip as it shows: its words, whether it has an icon, its colour's accent. */
const chipsOf = (card: ChipsElement) =>
  [...card.renderRoot.querySelectorAll<HTMLElement>('.fv-chip')].map((chip) => ({
    name: chip.textContent?.trim() ?? '',
    icon: chip.querySelector<HTMLElement & { icon?: string }>('ha-icon')?.icon,
    accent: chip.dataset['accent'],
  }));

afterEach(() => {
  document.body.replaceChildren();
});

describe('chips whose words are templates (#87)', () => {
  it('say what Home Assistant renders, kept live, one subscription a template, let go on leaving the page', async () => {
    const { hass, open } = house();
    const count = "{{ states.person | selectattr('state', 'eq', 'home') | list | count }} home";
    const card = await draw(
      [
        { name: count, path: '/home/people' },
        { name: 'Kitchen', path: '/home/kitchen' },
      ],
      hass,
    );
    expect(chipsOf(card).map((chip) => chip.name)).toEqual(['2 home', 'Kitchen']);
    expect(open()).toEqual([count]);
    card.remove();
    expect(open()).toEqual([]);
  });

  it('take an icon a template names, and never words that are no icon', async () => {
    const { hass } = house();
    const card = await draw(
      [
        { name: 'Home', icon: "{{ 'mdi:home-account' if true else 'mdi:home-outline' }}" },
        { name: 'Away', icon: '{{ the icon in words }}' },
      ],
      hass,
    );
    expect(chipsOf(card).map((chip) => chip.icon)).toEqual(['mdi:home-account', undefined]);
  });

  it('take a colour a template gives on the card’s palette, and none for what is no colour', async () => {
    const { hass } = house();
    const card = await draw(
      [
        { name: 'Lit', color: "{{ 'amber' }}" },
        { name: 'Odd', color: "{{ 'url(javascript:alert(1))' }}" },
      ],
      hass,
    );
    const [lit, odd] = chipsOf(card);
    expect(lit?.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(odd?.accent).toBeUndefined();
  });

  it('leave a chip its icon where the words render nothing, and leave out one with neither', async () => {
    const { hass } = house();
    const card = await draw(
      [
        { name: "{{ '' }}", icon: 'mdi:lightbulb' },
        { name: "{{ '' }}" },
        { name: '{{ fails }}' },
        { name: 'Kitchen' },
      ],
      hass,
    );
    expect(chipsOf(card).map(({ name, icon }) => [name, icon])).toEqual([
      ['', 'mdi:lightbulb'],
      ['Kitchen', undefined],
    ]);
  });

  it('keep the row 44 tall whatever the templates say: its height is the config’s', () => {
    expect(FluvyChipsCard.layoutHeight({ type: 'x', chips: [{ name: "{{ '' }}" }] })).toBe(44);
  });
});
