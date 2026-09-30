import type { Metadata } from "next";
import ModelsView from "@/components/views/ModelsView";

export const metadata: Metadata = { title: "Model Comparison" };

export default function Page() {
  return <ModelsView />;
}
