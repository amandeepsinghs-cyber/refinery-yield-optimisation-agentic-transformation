import type { Metadata } from "next";
import PlatformOverview from "@/components/how/PlatformOverview";

export const metadata: Metadata = { title: "How it works" };

export default function Page() {
  return <PlatformOverview />;
}
