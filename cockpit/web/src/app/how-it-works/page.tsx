import type { Metadata } from "next";
import HowItWorks from "@/components/how/HowItWorks";

export const metadata: Metadata = { title: "How it works" };

export default function Page() {
  return <HowItWorks />;
}
