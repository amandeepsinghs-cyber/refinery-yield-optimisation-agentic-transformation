import type { Metadata } from "next";
import { PlannedPage } from "@/components/views/MiscViews";

export const metadata: Metadata = { title: "Data quality" };

export default function Page() {
  return <PlannedPage title="Data quality" question="Are the inputs healthy?" feature="F11" bullets={["Tag-health heatmap (tags × time, colour-blind-safe scale)", "Hotelling T² and SPE time series with control limits", "Needs GET /api/dq?run_id= (not yet served)"]} />;
}
