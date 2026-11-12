import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import Footer from "@/components/Footer";
import LoadingScreen from "@/components/LoadingScreen";
import { signFont } from "@/components/road/font";
import { site } from "@/lib/site";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: site.title,
    template: `%s | ${site.name}`,
  },
  description: site.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${signFont.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Each section brings its own <main>: the home page is the full-bleed
          road scene, and the other pages add the site header above theirs.
          The footer is fixed over the bottom of every page and stays
          tucked away until the visitor scrolls down (see FooterReveal). */}
      <body className="relative flex min-h-full flex-col">
        {/* First in the body, so it is in the first bytes of the page and
            covers the first paint (see LoadingScreen). */}
        <LoadingScreen />
        {children}
        <Footer />
      </body>
    </html>
  );
}
