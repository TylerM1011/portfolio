export const site = {
  name: "Tyler",
  title: "Tyler — Portfolio",
  description: "Personal portfolio and projects.",
  // The emergency phone on the contact page dials these: 0 for the CV (the
  // file lives in public/), 1 for LinkedIn, 2 for GitHub.
  cv: "/cv.pdf",
  // TODO: your LinkedIn profile's URL.
  linkedin: "https://www.linkedin.com/in/",
  github: "https://github.com/TylerM1011",
  nav: [
    { href: "/", label: "Home" },
    // Order matters: on the home page's gantry the first destination after
    // Home is the lay-by turn-off, which leads to the contact page.
    { href: "/contact", label: "Contact" },
    { href: "/projects", label: "Projects" },
  ],
} as const;
