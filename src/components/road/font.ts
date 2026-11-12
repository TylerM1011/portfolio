import localFont from "next/font/local";

// Transport Medium, the alphabet for white legends on UK direction signs
// (Crown Copyright, Open Government Licence; see fonts/). The scenes paint
// their signs with it, and it is the site's own lettering too (see the root
// layout), so the HTML reads as part of the same road network.
export const signFont = localFont({ src: "./fonts/transport-medium.ttf", variable: "--font-sign" });
