"use client";

import { useRouter } from "next/navigation";
import { useRuns, useTwin } from "@/lib/api";
import { useCockpit } from "@/lib/store";
import { Card, ErrorState, LoadingBlock, NoRun, PageHeader } from "@/components/ui/primitives";
import UseCaseCatalogueView from "@/components/views/UseCaseCatalogueView";

export default function UseCasesPage() {
  const router = useRouter();
  const runId = useCockpit((s) => s.runId);
  const timeMin = useCockpit((s) => s.timeMin);
  const runs = useRuns();
  const run = runs.data?.find((r) => r.run_id === runId);
  const end = timeMin ?? run?.n_minutes ?? null;
  const twin = useTwin(runId, end);

  return (
    <div className="page">
      <PageHeader
        title="Refinery Use-Case Catalogue (#1–#11 Core + 23 Downstream)"
        question="How does the unified 112-tag Digital Twin & 4-Model Committee solve each individual refinery requirement?"
        actions={
          <button
            type="button"
            className="btn primary sm"
            onClick={() => router.push("/decision/overview")}
          >
            🌐 View 6-Unit Connected Digital Twin →
          </button>
        }
      />
      {!runId && !runs.isLoading ? (
        <Card>
          <NoRun />
        </Card>
      ) : twin.isLoading ? (
        <Card>
          <LoadingBlock height={320} />
        </Card>
      ) : twin.isError ? (
        <Card>
          <ErrorState error={twin.error} onRetry={() => twin.refetch()} title="Failed to load Digital Twin state" />
        </Card>
      ) : twin.data ? (
        <UseCaseCatalogueView
          twin={twin.data}
          onHighlightUnitOnTwin={() => router.push("/decision/overview")}
        />
      ) : null}
    </div>
  );
}
