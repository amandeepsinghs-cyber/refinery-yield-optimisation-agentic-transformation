import type { Metadata } from "next";
import DecisionRecord from "@/components/record/DecisionRecord";

export const metadata: Metadata = { title: "Decision record" };

/** The old table view (AuditView in MiscViews) is superseded by the plain-language decision record. */
export default function Page() {
  return <DecisionRecord />;
}
