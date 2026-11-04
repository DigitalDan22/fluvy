import { addEnglish } from '@fluvy/core';
import words from '@fluvy/core/locales/en/vehicle.json';

/** The Vehicle card's English, in its chunk: `vehicle-cards.ts` imports it first, so it is here before the card speaks. */
addEnglish(words);
