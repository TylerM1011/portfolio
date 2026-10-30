import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Projects",
};

const projects = [
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
    <section className="flex flex-col gap-8">
      <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
      <ul className="grid gap-4 sm:grid-cols-2">
        {projects.map((project) => (
          <li key={project.name}>
            <a
              href={project.href}
              className="block h-full rounded-xl border border-foreground/10 p-5 transition-colors hover:bg-foreground/5"
            >
              <h2 className="font-medium">{project.name}</h2>
              <p className="mt-2 text-sm text-foreground/70">
                {project.description}
              </p>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
