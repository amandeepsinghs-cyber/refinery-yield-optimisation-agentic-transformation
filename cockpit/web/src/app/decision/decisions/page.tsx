import type { Metadata } from "next";
import DecisionsView from "@/components/views/DecisionsView";

export const metadata: Metadata = { title: "Decisions" };

export default function Page() {
  return <DecisionsView />;
}
