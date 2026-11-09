"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { preloadAssets } from "@/lib/assets";
import { site } from "@/lib/site";
import { signFont } from "./road/font";

// Mounted once in the root layout: as soon as the site opens, whichever page
// it opens on, fetch everything the other pages need (their code, the
// scenes' models and textures, the sign font), so moving between pages
// never waits on the network. It runs after the page's own scene has asked
// for its files (layout effects run first), and at low priority, so it
// doesn't hold up the page the visitor is looking at.
export default function Preloader() {
  const router = useRouter();

  useEffect(() => {
    const start = () => {
      for (const item of site.nav) router.prefetch(item.href);
      preloadAssets();
      document.fonts.load(`1em ${signFont.style.fontFamily}`).catch(() => {});
    };
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(start, { timeout: 1500 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(start, 200);
    return () => clearTimeout(id);
  }, [router]);

  return null;
}
