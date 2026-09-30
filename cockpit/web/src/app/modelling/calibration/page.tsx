import type { Metadata } from "next";
import CalibrationView from "@/components/views/CalibrationView";

export const metadata: Metadata = { title: "Calibration" };

export default function Page() {
  return <CalibrationView />;
}
