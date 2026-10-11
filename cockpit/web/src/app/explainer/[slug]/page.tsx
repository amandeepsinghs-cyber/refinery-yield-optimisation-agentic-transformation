import type { Metadata } from "next";
import ExplainerView from "@/components/how/ExplainerView";

export const metadata: Metadata = { title: "Explainer" };

/** Next 16: params is a Promise. One beginner guide per page: /explainer/<slug>. */
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ExplainerView slug={slug} />;
}
