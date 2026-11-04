/*
 * The vehicle's glyphs: what a car has that a house does not — its boot and its front boot, its doors and its windows
 * (each drawn as it stands: shut, or open), its charge port, its odometer and a tyre — in the set's own hand: 24 grid,
 * 1.75 round stroke, ink 3..21 centred on (12, 12). The car is seen from its side, its nose to the left, so the boot
 * and the front boot read by which end opens. They travel with the vehicle's chunk, which adds them to the set as it
 * lands (`addGlyphs`). Nothing here imports: a tool may read it as it is.
 */

/**
 * The car's side, its nose to the left, over its wheels: the glass house (the windscreen, the roof, the back window)
 * and the sill between the wheels. The boot and the front boot are each the body's end, solid while shut, so the two
 * never read alike; open, the lid stands up from its hinge.
 */
const CABIN = '<path d="M7.5 11.5 10 8a1.5 1.5 0 0 1 1.22-.62h3.3a1.5 1.5 0 0 1 1.2.6L18 11.5"/>';
/** The side's ink runs 7.4..18.25: raised by 0.75 so it centres on the grid's 12. */
const side = (body: string): string => `<g transform="translate(0 -.75)">${body}</g>`;
const WHEELS =
  '<circle cx="7" cy="16.5" r="1.75"/><circle cx="17" cy="16.5" r="1.75"/><path d="M8.75 16.5h6.5"/>';
/** The bonnet and the boot as solid ends, and as lines (a line where the other end is the solid one). */
const BONNET_SOLID =
  '<path d="M3 12.5a1 1 0 0 1 .78-.98l3.72-.02v3.25H5.4a2.65 2.65 0 0 0-2.4 1.5Z" fill="currentColor"/>';
const BONNET = '<path d="M5.25 16.5H3v-4a1 1 0 0 1 .78-.98L7.5 11.5"/>';
const BOOT_SOLID =
  '<path d="M21 12.5a1 1 0 0 0-.78-.98L18 11.5v3.25h.6a2.65 2.65 0 0 1 2.4 1.5Z" fill="currentColor"/>';
const BOOT = '<path d="M18.75 16.5H21v-4a1 1 0 0 0-.78-.98L18 11.5"/>';

export const VEHICLE_GLYPHS = {
  /** the car's side, its boot shut: the body's rear end, solid */
  trunk: side(
    `${CABIN}${BONNET}<path d="M7.5 11.5H18"/>${BOOT_SOLID}<path d="M18.75 16.5H21v-4"/>${WHEELS}`,
  ),
  /** the boot open: its lid swung up from the roof's end */
  trunkOpen: side(
    `${CABIN}${BONNET}<path d="M7.5 11.5H18"/><path d="M18.75 16.5H21v-3.5"/><path d="M16.25 8.25 20.5 5"/>${WHEELS}`,
  ),
  /** the car's side, its front boot shut: the body's front end, solid */
  frunk: side(
    `${CABIN}${BOOT}<path d="M7.5 11.5H18"/>${BONNET_SOLID}<path d="M5.25 16.5H3v-4"/>${WHEELS}`,
  ),
  /** the front boot open: the bonnet swung up from the windscreen's foot */
  frunkOpen: side(
    `${CABIN}${BOOT}<path d="M7.5 11.5H18"/><path d="M5.25 16.5H3v-3.5"/><path d="M7.5 11.25 3.5 7.5"/>${WHEELS}`,
  ),
  /** a car's door, its window and its handle */
  carDoor:
    '<path d="M5 20.5h13a1 1 0 0 0 1-1V4.5h-7.2a3 3 0 0 0-2.12.88L5.88 9.12A3 3 0 0 0 5 11.24Z"/><path d="M5.5 11h13.5"/><path d="M14.5 14h2"/>',
  /** the door open: swung out on its front edge, its free edge nearer and taller, its handle with it */
  carDoorOpen:
    '<path d="M5 19.5 14 21V3l-2.4.5a3 3 0 0 0-1.74.98L5.75 8.9A3 3 0 0 0 5 10.88Z"/><path d="M5.5 10.75l8.5-.75"/><path d="M10.75 13.75l1.5-.1"/><path d="M17 8v8"/><path d="M19.5 9.5v5"/>',
  /** a car's side window, its glass up: two glints on it */
  carWindow:
    '<path d="M3.5 17.5h17V11L16.4 6.5H9.6a3 3 0 0 0-2.24 1L3.5 11.8Z"/><path d="M9.5 9.5l-2 2.5"/><path d="M12.5 9.5l-1 1.25"/>',
  /** the window open: its glass lowered, its edge low in the frame */
  carWindowOpen:
    '<path d="M3.5 17.5h17V11L16.4 6.5H9.6a3 3 0 0 0-2.24 1L3.5 11.8Z"/><path d="M6.5 14.5h11"/>',
  /** the charge port's socket: its round face and its pins */
  chargePort:
    '<circle cx="12" cy="12" r="8.75"/><circle cx="9" cy="9.75" r="1.25"/><circle cx="15" cy="9.75" r="1.25"/><circle cx="7.75" cy="14" r=".5" fill="currentColor"/><circle cx="12" cy="15.25" r="1.25"/><circle cx="16.25" cy="14" r=".5" fill="currentColor"/>',
  /** the odometer: a speedometer's dial and its needle */
  odometer:
    '<path d="M5.64 18.36a9 9 0 1 1 12.72 0"/><path d="m12 13.5 3.75-4.25"/><circle cx="12" cy="13.5" r="1.25" fill="currentColor" stroke="none"/><path d="M7.5 18.5h9"/>',
  /** a wheel: its tyre, its rim and its hub */
  tyre: '<circle cx="12" cy="12" r="8.75"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/><path d="M12 10.5V7"/><path d="m13.3 12.75 3 1.75"/><path d="m10.7 12.75-3 1.75"/>',
} as const;

export type VehicleGlyphName = keyof typeof VEHICLE_GLYPHS;
