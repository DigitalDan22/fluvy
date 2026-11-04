import {
  mdiAirplane,
  mdiArchive,
  mdiBed,
  mdiBriefcase,
  mdiCropPortrait,
  mdiDesk,
  mdiDeskLamp,
  mdiDoor,
  mdiFence,
  mdiFlash,
  mdiFlashOutline,
  mdiFlower,
  mdiFlowerPollen,
  mdiGarage,
  mdiGauge,
  mdiHome,
  mdiHomeAccount,
  mdiHomeAssistant,
  mdiHomeOutline,
  mdiHumanGreeting,
  mdiLamp,
  mdiLampOutline,
  mdiLightbulbGroup,
  mdiLightningBolt,
  mdiMolecule,
  mdiOutdoorLamp,
  mdiPackageVariantClosed,
  mdiSchool,
  mdiSilverwareForkKnife,
  mdiSofa,
  mdiSprout,
  mdiStove,
  mdiThermometerLines,
  mdiToilet,
  mdiTrain,
  mdiTumbleDryer,
  mdiUmbrellaOutline,
  mdiVibrate,
  mdiWashingMachine,
  mdiWeatherNight,
} from '@mdi/js';

/*
 * Home Assistant's <ha-icon> and <ha-state-icon> are not here: a stub draws them as Home Assistant does, from
 * `@mdi/js` (pinned to the version Home Assistant ships) — an icon by its name (`MDI`: the ones the sheets, the houses
 * and the demo name), a state by its own `icon` attribute, else by its class (`BY_CLASS`: Home Assistant's icons for
 * the classes the sheets draw that Fluvy has no glyph for) — and a neutral disc for anything else, so every reference
 * has a visible box. A sheet that names another icon, or draws another such class, adds it here.
 */
const MDI: Readonly<Record<string, string>> = {
  'mdi:airplane': mdiAirplane,
  'mdi:archive': mdiArchive,
  'mdi:bed': mdiBed,
  'mdi:briefcase': mdiBriefcase,
  'mdi:desk': mdiDesk,
  'mdi:desk-lamp': mdiDeskLamp,
  'mdi:door': mdiDoor,
  'mdi:fence': mdiFence,
  'mdi:flash': mdiFlash,
  'mdi:flash-outline': mdiFlashOutline,
  'mdi:flower': mdiFlower,
  'mdi:flower-pollen': mdiFlowerPollen,
  'mdi:garage': mdiGarage,
  'mdi:home': mdiHome,
  'mdi:home-account': mdiHomeAccount,
  'mdi:home-assistant': mdiHomeAssistant,
  'mdi:home-outline': mdiHomeOutline,
  'mdi:human-greeting': mdiHumanGreeting,
  'mdi:lamp': mdiLamp,
  'mdi:lamp-outline': mdiLampOutline,
  'mdi:lightbulb-group': mdiLightbulbGroup,
  'mdi:lightning-bolt': mdiLightningBolt,
  'mdi:outdoor-lamp': mdiOutdoorLamp,
  'mdi:package-variant-closed': mdiPackageVariantClosed,
  'mdi:school': mdiSchool,
  'mdi:silverware-fork-knife': mdiSilverwareForkKnife,
  'mdi:sofa': mdiSofa,
  'mdi:sprout': mdiSprout,
  'mdi:stove': mdiStove,
  'mdi:toilet': mdiToilet,
  'mdi:train': mdiTrain,
  'mdi:tumble-dryer': mdiTumbleDryer,
  'mdi:umbrella-outline': mdiUmbrellaOutline,
  'mdi:washing-machine': mdiWashingMachine,
  'mdi:weather-night': mdiWeatherNight,
};

/** The path of an mdi icon the sheets name (`mdi:sofa`); undefined for any other. */
export const mdiPath = (name: string | undefined): string | undefined =>
  name ? MDI[name] : undefined;

/** Home Assistant's icon for a state by `domain.device_class` (its icon translations): off, and on where it differs. */
const BY_CLASS: Readonly<Record<string, readonly [off: string, on?: string]>> = {
  'sensor.atmospheric_pressure': [mdiThermometerLines],
  'sensor.pressure': [mdiGauge],
  'sensor.pm25': [mdiMolecule],
  'binary_sensor.vibration': [mdiCropPortrait, mdiVibrate],
};

const BOX =
  '<style>:host{display:inline-flex;width:20px;height:20px}svg{width:100%;height:100%}</style>';
const DISC =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="8"/><path d="M8 12h16"/></svg>';

/** A state as the stub reads it: its entity, its own icon, its class. */
interface StateLike {
  readonly entity_id?: string;
  readonly state?: string;
  readonly attributes?: { readonly icon?: unknown; readonly device_class?: unknown };
}

/** The path a state draws: its own icon, else its class's in the state it is drawn in. */
function statePath(state: StateLike | undefined, value: string | undefined): string | undefined {
  const own = state?.attributes?.icon;
  if (typeof own === 'string') return MDI[own];
  const [off, on = off] =
    BY_CLASS[`${state?.entity_id?.split('.')[0]}.${state?.attributes?.device_class}`] ?? [];
  return (value ?? state?.state) === 'on' ? on : off;
}

/**
 * Defines the stubs where nothing has defined the tags yet: the playground after its page is mounted (a dashboard
 * brings an `ha-icon` of its own), the demo as it starts. Each draws again whenever a card hands it another icon or
 * state (a template's icon changes with its answer).
 */
export function defineIconStubs(): void {
  for (const tag of ['ha-icon', 'ha-state-icon'])
    if (!customElements.get(tag))
      customElements.define(
        tag,
        class extends HTMLElement {
          private named: string | undefined;
          private state: StateLike | undefined;
          private value: string | undefined;

          get icon(): string | undefined {
            return this.named;
          }
          set icon(icon: string | undefined) {
            this.named = icon;
            this.draw();
          }
          get stateObj(): StateLike | undefined {
            return this.state;
          }
          set stateObj(state: StateLike | undefined) {
            this.state = state;
            this.draw();
          }
          /** The state the circle draws (an activity's row: one the entity had). */
          get stateValue(): string | undefined {
            return this.value;
          }
          set stateValue(value: string | undefined) {
            this.value = value;
            this.draw();
          }

          connectedCallback(): void {
            // a card drew the element before the stub was defined: what it was handed is an own property, read anew
            for (const key of ['icon', 'stateObj', 'stateValue'] as const)
              if (Object.hasOwn(this, key)) {
                const given: unknown = this[key];
                delete (this as Partial<Record<typeof key, unknown>>)[key];
                Object.assign(this, { [key]: given });
              }
            this.draw();
          }

          private draw(): void {
            if (!this.isConnected) return;
            const path = this.named ? MDI[this.named] : statePath(this.state, this.value);
            (this.shadowRoot ?? this.attachShadow({ mode: 'open' })).innerHTML = `${BOX}${
              path ? `<svg viewBox="0 0 24 24" fill="currentColor"><path d="${path}"/></svg>` : DISC
            }`;
          }
        },
      );
}
