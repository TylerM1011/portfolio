"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

// What the telly in the about page's front room shows when it's switched
// over to "READ ME": a teletext magazine about me, three subpages turned
// with the coloured Fastext keys (or the arrow keys), as page 100 always
// was. The colours are teletext's own seven, softened a touch for a
// screen that isn't a cathode-ray tube.
const PAGES: { key: string; title: string; colour: string; body: ReactNode }[] = [
  {
    key: "About",
    title: "ABOUT ME",
    colour: "tt-red",
    body: (
      <>
        <p className="tt-yellow">Hello, I&rsquo;m Tyler McAndrew.</p>
        <p>
          I&rsquo;m a second-year Computer Science (Data Science and AI) student at the <span className="tt-cyan">University of Dundee</span>.
        </p>
        <p>
          I build working software outside my coursework &ndash; apps and sites I actually use, taken from the first sketch all the way to
          something you can pick up and try.
        </p>
        <p className="tt-green">I&rsquo;m looking for a year-in-industry placement in software development or design.</p>
      </>
    ),
  },
  {
    key: "Work",
    title: "WHAT I BUILD",
    colour: "tt-green",
    body: (
      <>
        <p>
          <span className="tt-yellow">FRAUDIBLE</span> An audiobook app for iPhone. I started it in React Native with Expo, then rebuilt it in
          native Swift for speed and a closer fit with iOS.
        </p>
        <p>
          <span className="tt-yellow">GOBLIN PARTY</span> A 3D virtual tabletop for D&amp;D, built in a team of two. I wrote the hit point
          tracker the Dungeon Master runs, and the animations on the board.
        </p>
        <p>
          <span className="tt-yellow">THIS SITE</span> Next.js and a three.js engine of my own. Every road sign on it is drawn to the
          Traffic Signs Manual.
        </p>
      </>
    ),
  },
  {
    key: "Skills",
    title: "TOOLS & HABITS",
    colour: "tt-yellow",
    body: (
      <>
        <dl className="tt-table">
          <dt className="tt-cyan">LANGUAGES</dt>
          <dd>Swift, TypeScript, C, Python</dd>
          <dt className="tt-cyan">FRAMEWORKS</dt>
          <dd>React, React Native, Expo, Next.js</dd>
          <dt className="tt-cyan">TOOLS</dt>
          <dd>Git and GitHub, Linux, Xcode, VS Code</dd>
        </dl>
        <p>
          I sweat the details, I&rsquo;m happy to learn a new language mid-project when it&rsquo;s the right call, and I enjoy working in a
          team as much as on my own.
        </p>
        <p className="tt-green">To get in touch, pick up the phone on the side table.</p>
      </>
    ),
  },
];

const pad = (n: number) => String(n).padStart(2, "0");
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const stamp = (d: Date) => `${DAYS[d.getDay()]} ${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}/${pad(d.getSeconds())}`;

type Props = {
  open: boolean;
  // Where the telly is on screen, for the picture to grow out of.
  origin: { x: number; y: number } | null;
  onClose: () => void;
};

export default function TvBio({ open, origin, onClose }: Props) {
  const [page, setPage] = useState(0);
  const [clock, setClock] = useState("");
  const firstRef = useRef<HTMLButtonElement>(null);

  // While it's on: the clock ticks in the header, focus comes to the set,
  // the arrow keys turn the page, and Escape switches it off.
  useEffect(() => {
    if (!open) return;
    const tick = () => setClock(stamp(new Date()));
    tick();
    const timer = window.setInterval(tick, 1000);
    const focus = window.setTimeout(() => firstRef.current?.focus({ preventScroll: true }), 50);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowRight") {
        setPage((p) => (p + 1) % PAGES.length);
      } else if (event.key === "ArrowLeft") {
        setPage((p) => (p + PAGES.length - 1) % PAGES.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(focus);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const from: CSSProperties = origin
    ? ({
        "--from-x": `${origin.x - window.innerWidth / 2}px`,
        "--from-y": `${origin.y - window.innerHeight / 2}px`,
      } as CSSProperties)
    : {};
  const current = PAGES[page];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Read me: about Tyler"
      inert={!open}
      data-open={open || undefined}
      className="scene-dialog group/tv fixed inset-0 z-50 grid place-items-center overflow-y-auto p-3 sm:p-4"
    >
      {/* Clicking off the set switches it off. */}
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-[#15162a]/45 opacity-0 backdrop-blur-[3px] transition-opacity duration-500 group-data-open/tv:opacity-100 group-data-open/tv:delay-200"
      />

      <div style={from} className="scene-dialog-panel tv-panel relative w-[min(96vw,46rem)]">
        {/* The set: moulded charcoal plastic round a curved screen, the
            speaker and the controls along the bottom. */}
        <div className="rounded-[1.75rem] bg-[#2b2c30] p-3 shadow-[0_30px_50px_-24px_rgba(0,0,0,0.75),inset_0_-6px_0_rgba(0,0,0,0.35),inset_0_2px_0_rgba(255,255,255,0.08)] sm:p-4">
          <div className="tv-screen relative overflow-hidden rounded-[1.6rem/1.3rem] bg-[#050505] font-mono text-[clamp(0.78rem,2.6vw,1.04rem)] leading-[1.45] text-[#f4f4f4]">
            <div className="max-h-[min(66vh,34rem)] overflow-y-auto px-[4%] pt-[3%] pb-[2%]">
              {/* The header row: page number, service, and the clock. */}
              <p aria-hidden className="flex flex-wrap justify-between gap-x-3 whitespace-nowrap">
                <span>
                  P10{page + 1} <span className="tt-yellow">TYLERTEXT</span> 10{page + 1}
                </span>
                <span className="tt-cyan">{clock}</span>
              </p>

              <h2 className="tt-band mt-[0.6em] -mx-[4.5%] px-[4.5%] py-[0.35em]">
                <span className="tt-double tt-yellow">{current.title}</span>
              </h2>
              <p aria-hidden className="mt-1 text-right">
                {page + 1}/{PAGES.length}
              </p>

              <div aria-live="polite" className="tt-body mt-1 min-h-[13.5em] space-y-[0.85em]">
                {current.body}
              </div>
            </div>

            {/* Fastext: the coloured keys, one per subpage, and off. */}
            <nav aria-label="Pages" className="flex flex-wrap gap-x-[5%] gap-y-1 border-t border-white/10 px-[4%] py-[2.5%]">
              {PAGES.map((p, i) => (
                <button
                  key={p.key}
                  ref={i === 0 ? firstRef : undefined}
                  type="button"
                  onClick={() => setPage(i)}
                  aria-current={page === i ? "page" : undefined}
                  className={`${p.colour} tt-key rounded-sm underline-offset-4 aria-[current=page]:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffd200]`}
                >
                  {p.key}
                </button>
              ))}
              <button
                type="button"
                onClick={onClose}
                className="tt-cyan tt-key rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffd200]"
              >
                Off <span className="opacity-60">(Esc)</span>
              </button>
            </nav>
          </div>

          <div aria-hidden className="flex items-center gap-3 px-2 pt-3">
            <span className="font-sans text-xs tracking-[0.3em] text-white/40">TYLERVISION</span>
            <span className="ml-auto flex gap-1.5">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className="h-1.5 w-5 rounded-full bg-black/40" />
              ))}
            </span>
            <span className="size-2 rounded-full bg-[#ff3b2f] shadow-[0_0_6px_#ff3b2f]" />
          </div>
        </div>
      </div>
    </div>
  );
}
