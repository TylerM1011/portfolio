export const site = {
  name: "Tyler",
  title: "Tyler — Portfolio",
  description: "Personal portfolio and projects.",
  // The emergency phone on the contact page links here. The file lives in
  // public/.
  cv: "/cv.pdf",
  nav: [
    { href: "/", label: "Home" },
    // Order matters: on the home page's gantry the first destination after
    // Home is the lay-by turn-off, which leads to the contact page.
    { href: "/contact", label: "Contact" },
    { href: "/projects", label: "Projects" },
  ],
} as const;
