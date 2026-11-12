import Link from "next/link";
import Header from "@/components/Header";

// A wrong turn: the scenes' sky and hills (in the light of the visitor's
// colour scheme, see globals.css), with a direction sign on its posts
// pointing back home.
export default function NotFound() {
  return (
    <>
      <Header />
      <main className="relative isolate flex flex-1 flex-col overflow-hidden">
        <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-b from-(--sky-top) via-(--sky-horizon) via-70% to-(--sky-horizon)" />
        <svg aria-hidden viewBox="0 0 400 60" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 -z-10 h-[38%] w-full">
          <path d="M0 26 C40 14 70 18 110 22 S190 8 240 16 S330 24 400 12 V60 H0z" fill="var(--land-far)" />
          <path d="M0 38 C60 30 100 34 150 36 S250 26 300 32 S370 38 400 30 V60 H0z" fill="var(--land)" />
        </svg>

        <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-6 py-16">
          <div className="relative flex flex-col items-center">
            {/* The panel: primary route green, a white border inset round
                rounded corners, white legends. */}
            <div className="rounded-2xl bg-(--sign) p-2 shadow-[0_18px_30px_-18px_rgb(0_0_0/0.55)]">
              <div className="flex flex-col gap-4 rounded-xl border-[3px] border-white px-8 pt-6 pb-5 text-white sm:px-12">
                <h1 className="text-4xl leading-tight sm:text-5xl">Page not found</h1>
                <Link
                  href="/"
                  className="flex items-center gap-3 self-start rounded-md text-2xl text-white/95 transition-colors hover:text-white focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#ffd200]"
                >
                  <svg aria-hidden viewBox="0 0 28 20" className="h-[0.9em] w-auto fill-current">
                    <path d="M0 10 10 0v6h18v8H10v6z" />
                  </svg>
                  Back home
                </Link>
              </div>
            </div>
            {/* Its posts, down to the verge. */}
            <div aria-hidden className="flex w-1/2 justify-between">
              <span className="h-16 w-2.5 bg-linear-to-r from-[#8e959c] to-[#5d636a]" />
              <span className="h-16 w-2.5 bg-linear-to-r from-[#8e959c] to-[#5d636a]" />
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
