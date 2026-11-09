import { day as roadDay, dusk as roadDusk, type Palette } from "../road/palette";

// The yard shares the road scene's light: golden hour by day, dusk in dark
// mode. The sun hangs low off to the left, behind the tower crane, and at
// dusk the site lights come on.
export type YardPalette = Palette & {
  // Multiplies the dirt, spoil heap and tyre track textures.
  dirt: number;
  // Floodlight lamps and the pools of light they throw.
  floodlights: number;
  // Glow of the site cabins' windows.
  windows: number;
  // The crane's red aviation lights.
  beacon: number;
};

export const day: YardPalette = {
  ...roadDay,
  sunElevation: 16,
  sunAzimuth: -38,
  dirt: 0xf2e4ce,
  floodlights: 0,
  windows: 0,
  beacon: 3,
  exposure: 1.02,
};

export const dusk: YardPalette = {
  ...roadDusk,
  sunElevation: 5,
  sunAzimuth: -38,
  dirt: 0xb4a08a,
  floodlights: 2.4,
  windows: 1.8,
  beacon: 9,
};
