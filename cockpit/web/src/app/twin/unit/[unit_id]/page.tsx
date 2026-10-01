import L1Workbench from "@/components/twin/l1/L1Workbench";

export const metadata = { title: "Refinery Twin — L1" };

export default function TwinUnitPage({ params }: { params: { unit_id: string } }) {
  return <L1Workbench unitId={params.unit_id} />;
}
