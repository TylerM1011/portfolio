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
    name: "Project One",
    description: "A short description of the project.",
    href: "#",
  },
  {
    name: "Project Two",
    description: "A short description of the project.",
    href: "#",
  },
];

export default function ProjectsPage() {
  return (
    <>
      <YardScene />
      <section>
        <h1 className="sr-only">Projects</h1>
        {/* Blueprints scattered across the site table, one per project. */}
        <ul className="blueprints">
          {projects.map((project, index) => (
            // --i staggers the sheets falling into place (see globals.css).
            <li key={project.name} className="blueprint-wrap" style={{ "--i": index } as CSSProperties}>
              <Blueprint project={project} index={index} total={projects.length} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
