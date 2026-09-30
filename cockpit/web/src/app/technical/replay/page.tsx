import type { Metadata } from "next";
import ReplayView from "@/components/views/ReplayView";

export const metadata: Metadata = { title: "Replay" };

export default function Page() {
  return <ReplayView />;
}
