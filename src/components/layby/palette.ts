import { day as roadDay, dusk as roadDusk, type Palette } from "../road/palette";

// The lay-by shares the road's light, golden hour by day and dusk in dark
// mode, but the camera here looks along the verge rather than down the
// road, so the sun is swung round to just off the right edge of the shot:
// it rakes across the carriageway and throws the verge's shadows back
// toward the camera.
export const day: Palette = {
  ...roadDay,
  sunAzimuth: 34,
};

export const dusk: Palette = {
  ...roadDusk,
  sunAzimuth: 34,
};
