import { addEnglish } from '@fluvy/core';
import words from '@fluvy/core/locales/en/strategy.json';

/**
 * The automatic dashboards' English, in the strategy's chunk: `generate.ts` imports it first, so it is here before a
 * dashboard is built (the settings panel, which names the dashboards, imports the chunk itself).
 */
addEnglish(words);
