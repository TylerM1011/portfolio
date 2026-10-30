import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
};

export default function ContactPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">Contact</h1>
      <p className="max-w-xl text-foreground/70">
        Add your email and links here.
      </p>
    </section>
  );
}
