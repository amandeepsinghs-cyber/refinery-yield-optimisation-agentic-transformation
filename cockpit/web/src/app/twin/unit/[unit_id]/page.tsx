import L1Workbench from "@/components/twin/l1/L1Workbench";

export const metadata = { title: "Refinery Twin — Unit Workbench" };

/** Next 16: `params` is a Promise — awaiting it is what fixes the `/api/unit/undefined/workbench` 422. */
export default async function TwinUnitPage({ params }: { params: Promise<{ unit_id: string }> }) {
  const { unit_id } = await params;
  return <L1Workbench unitId={unit_id} />;
}
