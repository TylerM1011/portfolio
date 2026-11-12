import Link from "next/link";
import { site } from "@/lib/site";

// A slim green direction sign across the top of the pages that have no
// scene of their own: white Transport legends on primary route green with a
// white border, the same sign vocabulary the scenes use for navigation.
export default function Header() {
  return (
    <header className="bg-(--sign) text-white shadow-[inset_0_-3px_0_rgb(255_255_255/0.9),0_6px_16px_-10px_rgb(0_0_0/0.5)]">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="text-lg tracking-wide focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#ffd200]">
          {site.name}
        </Link>
        <nav className="flex gap-6">
          {site.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-white/85 transition-colors hover:text-white focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#ffd200]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
