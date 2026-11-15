import type { Metadata } from "next";
import AboutScene from "@/components/AboutScene";

export const metadata: Metadata = {
  title: "About",
};

// No site header here: the house is the page. The door lets you into the
// front room, where the telly has the bio, the landline the contact
// details, and the car keys the way back home (see AboutScene). <main>
// takes the full height and lets the pointer through to the scene behind it.
export default function AboutPage() {
  return (
    <>
      <AboutScene />
      <main className="pointer-events-none relative flex min-h-0 flex-1 basis-0 flex-col overflow-hidden">
        <h1 className="sr-only">About</h1>
      </main>
    </>
  );
}
