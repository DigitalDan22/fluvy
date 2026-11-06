import { quietCss } from '@fluvy/ui/styles/quiet';

/*
 * A card quiet out of reach (1.16, #126): the rules it adopts (`ui/styles/quiet.css`), fetched by the first card that
 * is one (`card.ts`), so a dashboard of dashed cards never pays for them — one sheet, every such card's.
 */
export const quietSheet = new CSSStyleSheet();
quietSheet.replaceSync(quietCss);
