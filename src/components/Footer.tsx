import { site } from "@/lib/site";

export default async function Footer() {
  "use cache";

  return (
    <footer className="border-t border-foreground/10">
      <div className="mx-auto flex max-w-4xl flex-wrap justify-between gap-x-6 gap-y-2 px-6 py-6 text-sm text-foreground/60">
        <span>
          © {new Date().getFullYear()} {site.name}
        </span>
        {/* Required by the 3D models' Creative Commons licenses. */}
        <span className="flex flex-col gap-1 text-xs sm:items-end">
          <span>
            Car:{" "}
            <a
              href="https://sketchfab.com/3d-models/2024-volkswagen-polo-170-tsi-ec0f4dfd1ca84a859725e4002e9cf120"
              className="underline-offset-2 hover:underline"
            >
              “2024 Volkswagen Polo 170 TSI”
            </a>{" "}
            by{" "}
            <a
              href="https://sketchfab.com/ddiaz-design"
              className="underline-offset-2 hover:underline"
            >
              Ddiaz Design
            </a>
            ,{" "}
            <a
              href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
              className="underline-offset-2 hover:underline"
            >
              CC BY-NC-SA 4.0
            </a>
          </span>
          <span>
            Trees and meadow:{" "}
            <a
              href="https://sketchfab.com/3d-models/pine-forest-at-sunset-bef89be6b189456095db79107045d726"
              className="underline-offset-2 hover:underline"
            >
              “Pine Forest at Sunset”
            </a>{" "}
            by{" "}
            <a
              href="https://sketchfab.com/Jagobo"
              className="underline-offset-2 hover:underline"
            >
              Jagobo
            </a>
            ,{" "}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              className="underline-offset-2 hover:underline"
            >
              CC BY 4.0
            </a>
          </span>
        </span>
      </div>
    </footer>
  );
}
