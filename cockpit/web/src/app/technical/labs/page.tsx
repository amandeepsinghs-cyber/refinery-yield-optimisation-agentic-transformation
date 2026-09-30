import type { Metadata } from "next";
import { PlannedPage } from "@/components/views/MiscViews";

export const metadata: Metadata = { title: "Labs" };

export default function Page() {
  return <PlannedPage title="Labs" question="Can we trust the lab data?" feature="F10" bullets={["Lab table with ACCEPT / HOLD / REJECT status and agent rationale", "Injected-error truth from the simulator", "Lab-vs-estimate time series; needs GET /api/labs?run_id= (not yet served)"]} />;
}
