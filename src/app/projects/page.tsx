import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Blueprint, { type Project } from "@/components/Blueprint";
import BlueprintList from "@/components/BlueprintList";
import YardScene from "@/components/YardScene";

export const metadata: Metadata = {
  title: "Projects",
};

const projects: Project[] = [
  {
    name: "Fraudible",
    description: "A free audiobook app.",
    status: "Under construction",
    href: "https://github.com/TylerM1011/Fraudible",
    drawing: "library",
  },
  {
    name: "Portfolio",
    description: "This website, built with Next.js and three.js.",
    status: "Under construction",
    href: "https://github.com/TylerM1011/Portfolio",
    drawing: "website",
  },
  {
    name: "Goblin Party",
    description: "A Dungeons & Dragons virtual tabletop.",
    status: "Collaborated",
    stamp: "green",
    href: "https://fuck-roll-20.winkwonk.workers.dev/",
    drawing: "dice",
  },
];

// No site header here: the signpost by the gate (in YardScene) is the way
// out. The page fits the screen and never scrolls: <main> takes the full
// height and clips anything more (the sheets are sized to fit, see
// globals.css). It is positioned so it paints over the fixed
// scene, and lets the pointer through to the signpost wherever there is no
// sheet.
export default function ProjectsPage() {
  return (
    <>
      <YardScene />
      <main className="pointer-events-none relative flex min-h-0 flex-1 basis-0 flex-col overflow-hidden">
        <section className="sm:mx-auto sm:w-full sm:max-w-4xl sm:px-6 sm:pt-16 [@media(min-width:640px)_and_(max-height:572px)]:pt-0">
          <h1 className="sr-only">Projects</h1>
          {/* Blueprints scattered across the site, one per project. */}
          <BlueprintList>
            {projects.map((project, index) => (
              // --i staggers the sheets falling into place, and stacks them
              // front to back on phones (see globals.css). The card is what
              // turns in the phones' rolodex (see BlueprintList).
              <li key={project.name} className="blueprint-wrap" style={{ "--i": index } as CSSProperties}>
                <div className="blueprint-card">
                  <Blueprint project={project} index={index} total={projects.length} />
                </div>
              </li>
            ))}
          </BlueprintList>
        </section>
      </main>
    </>
  );
}
