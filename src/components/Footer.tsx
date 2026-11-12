import FooterReveal from "./FooterReveal";

export default async function Footer() {
  "use cache";

  return (
    <FooterReveal>
      <div className="mx-auto flex max-w-4xl justify-end px-6 py-5 text-sm opacity-80">
        {/* Required by the sign font's Open Government Licence. The scenes
            are built in code, with no third-party models. */}
        <span className="flex flex-col gap-1 text-xs sm:items-end">
          <span>
            Sign lettering: Transport Medium, Crown Copyright,{" "}
            <a
              href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/1/"
              className="underline-offset-2 hover:underline"
            >
              Open Government Licence v1.0
            </a>
          </span>
        </span>
      </div>
    </FooterReveal>
  );
}
