import type { Metadata } from "next";
import { CrewTestLogReport } from "@/components/crew-test-log-report";

export const metadata: Metadata = { title: "Test log" };

export default function TestLogPage() {
  return <CrewTestLogReport />;
}
