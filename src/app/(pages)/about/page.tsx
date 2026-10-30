import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
};

export default function AboutPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">About</h1>
      <p className="max-w-xl text-foreground/70">
        A short bio goes here.
      </p>
    </section>
  );
}
