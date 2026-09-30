import type { Metadata } from "next";
import ConfidenceView from "@/components/views/ConfidenceView";

export const metadata: Metadata = { title: "Model Confidence" };

export default function Page() {
  return <ConfidenceView />;
}
