import L1Workbench from "@/components/twin/l1/L1Workbench";
import UnitStory from "@/components/twin/l1/UnitStory";

export const metadata = { title: "Refinery Twin — Unit" };

/**
 * Next 16: `params` is a Promise — awaiting it is what fixes the `/api/unit/undefined/workbench` 422.
 * Default: the four-step unit page (data → observe → decide → optimise). `?view=classic` (or a `?uc=` / `?tag=` deep
 * link from older entry points) keeps the engineer's all-panels workbench.
 */
export default async function TwinUnitPage({ params, searchParams }: {
  params: Promise<{ unit_id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { unit_id } = await params;
  const sp = await searchParams;
  const classic = sp.view === "classic" || sp.uc != null || sp.tag != null;
  return classic ? <L1Workbench unitId={unit_id} /> : <UnitStory unitId={unit_id} />;
}
