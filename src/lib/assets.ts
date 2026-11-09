// Every file the 3D scenes load, downloaded once per visit and shared. The
// site starts fetching all of them as soon as it opens (see Preloader), so
// whichever page the visitor lands on, the next scene is already in memory.
// The scenes take the raw bytes and images from here and build their own
// three.js objects, since each engine disposes of what it built when it stops.
//
// This module stays free of three.js so the root layout can import it
// without pulling the renderer onto every page.

export const MODEL_URLS = {
  car: "/models/polo.glb",
  forest: "/models/forest.glb",
} as const;

export const TEXTURE_URLS = {
  meadow: "/models/meadow-ground.webp",
  lushGrass: "/models/grass-lush.webp",
  fineGrass: "/models/grass-fine.webp",
} as const;

type Priority = "high" | "low" | "auto";

const buffers = new Map<string, Promise<ArrayBuffer>>();
const images = new Map<string, Promise<HTMLImageElement>>();

// Shares one request per URL; a failed one is forgotten so the next caller
// tries again.
function once<T>(cache: Map<string, Promise<T>>, url: string, load: () => Promise<T>) {
  let promise = cache.get(url);
  if (!promise) {
    promise = load();
    promise.catch(() => cache.delete(url));
    cache.set(url, promise);
  }
  return promise;
}

// The bytes of a model (a .glb), for GLTFLoader.parseAsync.
export function loadBuffer(url: string, priority: Priority = "auto") {
  return once(buffers, url, async () => {
    const response = await fetch(url, { priority });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.arrayBuffer();
  });
}

// A decoded image, ready to hand to a texture.
export function loadImage(url: string, priority: Priority = "auto") {
  return once(images, url, async () => {
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = priority;
    image.src = url;
    await image.decode();
    return image;
  });
}

// Fetches everything at low priority, so a scene already asking for its own
// files keeps the bandwidth. Already-requested files are left as they are.
export function preloadAssets() {
  const quietly = () => {};
  for (const url of Object.values(MODEL_URLS)) loadBuffer(url, "low").catch(quietly);
  for (const url of Object.values(TEXTURE_URLS)) loadImage(url, "low").catch(quietly);
}
