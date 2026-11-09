import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Blueprint, { type Project } from "@/components/Blueprint";
import YardScene from "@/components/YardScene";

export const metadata: Metadata = {
  title: "Projects",
};

const projects: Project[] = [
  {
    name: "Fraudible",
    description: "A project currently under construction.",
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
    name: "fuck roll 20",
    description: "A short description of the project.",
    status: "Collaborated",
    stamp: "green",
    href: "https://fuck-roll-20.winkwonk.workers.dev/",
    drawing: "dice",
  },
];

// No site header here: the signpost by the gate (in YardScene) is the way
// out. The page fits the screen and never scrolls: <main> takes the full
// height (the footer slides up over it) and clips anything more (the sheets are sized to
// fit, see globals.css). It is positioned so it paints over the fixed
// scene, and lets the pointer through to the signpost wherever there is no
// sheet.
export default function ProjectsPage() {
  return (
    <>
      <YardScene />
      <main className="pointer-events-none relative flex min-h-0 flex-1 basis-0 flex-col overflow-hidden">
        <section className="sm:mx-auto sm:w-full sm:max-w-4xl sm:px-6 sm:pt-16">
          <h1 className="sr-only">Projects</h1>
          {/* Blueprints scattered across the site, one per project. */}
          <ul className="blueprints">
            {projects.map((project, index) => (
              // --i staggers the sheets falling into place (see globals.css).
              <li key={project.name} className="blueprint-wrap" style={{ "--i": index } as CSSProperties}>
                <Blueprint project={project} index={index} total={projects.length} />
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
