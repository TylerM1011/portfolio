import type { Project } from "@/components/Blueprint";

// The projects, one blueprint each: pinned up on the projects page, and on
// the clipboard on the about page's coffee table.
export const projects: Project[] = [
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
