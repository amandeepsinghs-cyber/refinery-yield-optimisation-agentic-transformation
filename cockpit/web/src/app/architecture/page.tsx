import type { Metadata } from "next";
import ArchitectureView from "@/components/how/ArchitectureView";

export const metadata: Metadata = { title: "Target architecture" };

/** Next 16: `searchParams` is a Promise. `?view=data` opens "How your data comes in" (Cortex Framework); default = platform. */
export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  return <ArchitectureView view={sp.view === "data" ? "data" : "platform"} />;
}
