import Header from "@/components/Header";

export default function PagesLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Header />
      <main className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-4xl px-6 py-16">{children}</div>
      </main>
    </>
  );
}
