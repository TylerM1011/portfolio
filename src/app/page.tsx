import RoadScene from "@/components/RoadScene";
import { site } from "@/lib/site";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <h1 className="sr-only">{site.name}</h1>
      <RoadScene />
    </main>
  );
}
