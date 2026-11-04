// the card's words first: they are here before it speaks
import './vehicle/english.js';
import { registerCard } from '@fluvy/core';
import { VEHICLE_FAMILY } from './vehicle-family.js';
import { FluvyVehicleCard } from './vehicle/vehicle-card.js';

/**
 * The Vehicle card's element: this module is its own chunk, fetched at start (`index.ts`) and defined as it lands.
 * Its name, description and height live in `vehicle-family.ts`, which every page carries.
 */
export const CARDS = VEHICLE_FAMILY.map(
  ([tag, name, description]) =>
    [tag, FluvyVehicleCard as CustomElementConstructor, name, description] as const,
);

for (const [tag, element, name, description] of CARDS)
  registerCard({ tag, name, description }, element);
