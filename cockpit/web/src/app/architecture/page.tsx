import type { Metadata } from "next";
import ArchitectureView from "@/components/how/ArchitectureView";

export const metadata: Metadata = { title: "Target architecture" };

export default function Page() {
  return <ArchitectureView />;
}
