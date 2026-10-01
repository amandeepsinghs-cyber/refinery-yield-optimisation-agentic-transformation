import type { Metadata } from "next";
import DataQualityView from "@/components/views/DataQualityView";

export const metadata: Metadata = { title: "Data quality" };

export default function Page() {
  return <DataQualityView />;
}
