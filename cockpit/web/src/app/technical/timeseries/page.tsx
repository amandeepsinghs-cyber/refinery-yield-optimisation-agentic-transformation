import type { Metadata } from "next";
import TimeseriesView from "@/components/views/TimeseriesView";

export const metadata: Metadata = { title: "Time-Series Explorer" };

export default function Page() {
  return <TimeseriesView />;
}
