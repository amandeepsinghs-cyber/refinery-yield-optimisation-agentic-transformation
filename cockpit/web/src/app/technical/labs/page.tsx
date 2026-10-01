import type { Metadata } from "next";
import LabsView from "@/components/views/LabsView";

export const metadata: Metadata = { title: "Labs" };

export default function Page() {
  return <LabsView />;
}
