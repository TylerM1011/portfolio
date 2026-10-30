import Link from "next/link";
import Header from "@/components/Header";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-16">
          <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
          <Link href="/" className="text-foreground/70 underline hover:text-foreground">
            Back home
          </Link>
        </section>
      </main>
    </>
  );
}
