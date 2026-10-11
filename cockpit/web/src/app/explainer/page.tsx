import type { Metadata } from "next";
import ExplainerHub from "@/components/how/ExplainerHub";

export const metadata: Metadata = { title: "Explainer" };

export default function Page() {
  return <ExplainerHub />;
}
