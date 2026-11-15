import { day as roadDay, dusk as roadDusk, type Palette } from "../road/palette";

// The about page shares the road's light, golden hour by day and dusk in
// dark mode, but the camera stands across the street looking at the front
// of a terrace, so the sun is swung round behind the camera's left
// shoulder: it lights the house front square on, rakes the street, and
// once the door is open throws a shaft of light across the front room.
export type AboutPalette = Palette & {
  // The lamp on the side table and the fire in the grate: on a little by
  // day, doing most of the work at dusk.
  lamp: number;
  fire: number;
  // Lit windows up and down the street.
  windows: number;
};

export const day: AboutPalette = {
  ...roadDay,
  sunAzimuth: 214,
  lamp: 0.3,
  fire: 0.2,
  windows: 0,
};

export const dusk: AboutPalette = {
  ...roadDusk,
  sunAzimuth: 214,
  lamp: 0.6,
  fire: 0.45,
  windows: 1,
};
