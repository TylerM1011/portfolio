import type { Metadata } from "next";
import LaybyScene from "@/components/LaybyScene";

export const metadata: Metadata = {
  title: "Contact",
};

// No site header here: as on the projects page, the route sign on the bank
// (in LaybyScene) is the way out, and the emergency phone by the lay-by is
// the link to the CV. <main> takes the full height and lets the pointer
// through to the scene behind it.
export default function ContactPage() {
  return (
    <>
      <LaybyScene />
      <main className="pointer-events-none relative flex min-h-0 flex-1 basis-0 flex-col overflow-hidden">
        <h1 className="sr-only">Contact</h1>
      </main>
    </>
  );
}
