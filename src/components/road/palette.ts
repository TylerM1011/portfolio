// The light every scene shares, in its two printings: late-afternoon golden
// hour in light mode, dusk in dark mode, with the sun on the horizon and the
// lamps doing more of the work. Objects keep their own inks in both (see
// scene/style.ts); this is the light that falls on them, and the colours of
// the air, sky and land around them. The HTML takes the same colours (see
// globals.css), so change them together.
//
// Under the house style, a surface facing the sun comes out at about its
// own ink, and one turned away (or in shadow) at its ink times the sky's
// fill: so `hemiSky`/`hemiGround` are the colour of the shade side, cool by
// day and violet at dusk, and the sun's colour warms the lit side.
export type Palette = {
  skyTop: number;
  skyHorizon: number;
  sun: number;
  sunIntensity: number;
  // Degrees above the horizon, and to the right of straight down the road.
  sunElevation: number;
  sunAzimuth: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fog: number;
  // How much the air warms and thickens toward the sun (see HAZE in
  // scene/style.ts): the long light of evening.
  hazeStrength: number;
  // The meadow's green (ground and grass).
  meadow: number;
  gantry: number;
  sign: number;
  // Glow of the sign's retroreflective sheeting (faked), so it reads with
  // the sun behind the gantry.
  signGlow: number;
  hillFar: number;
  hillNear: number;
  // Clouds: their sunlit tops and shaded undersides.
  cloud: number;
  cloudShade: number;
  taillight: number;
  headlights: number;
  // Glow of the road studs and reflectors (retroreflection, faked).
  studs: number;
  dust: number;
};

export const day: Palette = {
  skyTop: 0x4a7fbf,
  skyHorizon: 0xf4d6a0,
  sun: 0xfff0d2,
  sunIntensity: 1.55,
  sunElevation: 13,
  sunAzimuth: 24,
  hemiSky: 0xc4d3ea,
  hemiGround: 0xd9b88a,
  hemiIntensity: 1.95,
  fog: 0xecd3a6,
  hazeStrength: 0.45,
  meadow: 0x8e9a5e,
  gantry: 0xb6bcc0,
  sign: 0x00703c,
  signGlow: 0.12,
  hillFar: 0xa9b8a4,
  hillNear: 0x7f9763,
  cloud: 0xfff6e6,
  cloudShade: 0xe2d4c4,
  taillight: 1.3,
  headlights: 0,
  studs: 0,
  dust: 0xffe7b8,
};

export const dusk: Palette = {
  skyTop: 0x262a5a,
  skyHorizon: 0xf2905e,
  sun: 0xffa865,
  sunIntensity: 1.9,
  sunElevation: 3.5,
  sunAzimuth: 24,
  hemiSky: 0x857aa6,
  hemiGround: 0x54404c,
  hemiIntensity: 1.5,
  fog: 0xc87a66,
  hazeStrength: 0.95,
  meadow: 0x737a50,
  gantry: 0xa8aab4,
  sign: 0x00653a,
  signGlow: 0.18,
  hillFar: 0x77608c,
  hillNear: 0x4f5274,
  cloud: 0xf6b08a,
  cloudShade: 0x9a6a86,
  taillight: 4,
  headlights: 9,
  studs: 2,
  dust: 0xffc08a,
};
