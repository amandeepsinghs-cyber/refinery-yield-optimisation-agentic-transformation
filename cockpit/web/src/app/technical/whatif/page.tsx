import type { Metadata } from "next";
import { PlannedPage } from "@/components/views/MiscViews";

export const metadata: Metadata = { title: "What-if" };

export default function Page() {
  return <PlannedPage title="What-if" question="What happens if we change X?" feature="F7" bullets={["Sliders for inputs and MVs → POST /api/whatif (not yet served)", "Member distributions, P(on-spec) and margin to spec", "Nearest simulated scenario overlay"]} />;
}
