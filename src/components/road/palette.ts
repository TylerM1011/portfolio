// Light mode is late-afternoon golden hour; dark mode is dusk, with the sun
// on the horizon and the car's lights doing more of the work.
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
  envIntensity: number;
  fog: number;
  // Multiplies the meadow ground and grass textures.
  meadow: number;
  gantry: number;
  sign: number;
  hillFar: number;
  hillNear: number;
  cloud: number;
  taillight: number;
  headlights: number;
  // Glow of the road studs and reflectors (retroreflection, faked).
  studs: number;
  dust: number;
  exposure: number;
};

export const day: Palette = {
  skyTop: 0x4f8fcf,
  skyHorizon: 0xf2dfbf,
  sun: 0xffe2b0,
  sunIntensity: 3.4,
  sunElevation: 13,
  sunAzimuth: 24,
  hemiSky: 0xbcd7f0,
  hemiGround: 0x6b6a3a,
  hemiIntensity: 0.55,
  envIntensity: 0.55,
  fog: 0xe9d7bb,
  meadow: 0xf4f0d8,
  gantry: 0xa4adb7,
  sign: 0x1d5bab,
  hillFar: 0x9db5a6,
  hillNear: 0x7f9f72,
  cloud: 0xfff4e6,
  taillight: 3,
  headlights: 0,
  studs: 0,
  dust: 0xffe7b8,
  exposure: 1.05,
};

export const dusk: Palette = {
  skyTop: 0x1c1f4d,
  skyHorizon: 0xf08a5d,
  sun: 0xffa45c,
  sunIntensity: 2.4,
  sunElevation: 3.5,
  sunAzimuth: 24,
  hemiSky: 0x6a5a9a,
  hemiGround: 0x2a2630,
  hemiIntensity: 0.45,
  envIntensity: 0.5,
  fog: 0xc07862,
  meadow: 0xb0a088,
  gantry: 0x8a929d,
  sign: 0x1a52a0,
  hillFar: 0x6a557e,
  hillNear: 0x4a5068,
  cloud: 0xc58a9a,
  taillight: 6,
  headlights: 14,
  studs: 2.5,
  dust: 0xffc08a,
  exposure: 1,
};
