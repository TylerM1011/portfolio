import RoadScene from "@/components/RoadScene";
import { site } from "@/lib/site";

export default function Home() {
  return (
    // The road scene fills the whole page, footer included (it is positioned
    // against <body>); <main> just holds the space above the footer.
    <main className="flex min-h-[28rem] flex-1 flex-col">
      <h1 className="sr-only">{site.name}</h1>
      <RoadScene />
    </main>
  );
}
