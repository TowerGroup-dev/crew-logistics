import type { Metadata } from "next";
import { CrewBoard } from "@/components/crew-board";

export const metadata: Metadata = {
  title: "Crew",
};

export default function HomePage() {
  return <CrewBoard />;
}
