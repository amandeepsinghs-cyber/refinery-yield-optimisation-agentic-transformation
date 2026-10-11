import type { Metadata } from "next";
import ExplainerView from "@/components/how/ExplainerView";

export const metadata: Metadata = { title: "Explainer" };

export default function Page() {
  return <ExplainerView />;
}
