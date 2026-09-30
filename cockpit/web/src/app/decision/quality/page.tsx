import type { Metadata } from "next";
import QualityView from "@/components/views/QualityView";

export const metadata: Metadata = { title: "Quality" };

export default function Page() {
  return <QualityView />;
}
