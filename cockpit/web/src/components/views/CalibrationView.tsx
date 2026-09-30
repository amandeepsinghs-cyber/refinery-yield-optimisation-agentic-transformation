"use client";

import { useCalibration, useModels } from "@/lib/api";
import { num, propLabel } from "@/lib/format";
import { useCockpit } from "@/lib/store";
import { modelColor, MODEL_ORDER } from "@/lib/theme";
import { CoverageOverTime, CusumChart, PitHistograms, ReliabilityDiagram } from "@/components/charts/ModelCharts";
import { Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/primitives";

export default function CalibrationView() {
  const property = useCockpit((s) => s.property);
  const cal = useCalibration(property);
  const models = useModels(property);
  const d = cal.data;
  return (
    <div className="page">
      <PageHeader
        title={`Calibration · ${propLabel(property)}`}
        question="Are the distributions honest, and are the models still good?"
      />
      {cal.isLoading ? (
        <LoadingBlock height={320} />
      ) : cal.isError ? (
        <Card>
          <ErrorState error={cal.error} onRetry={() => cal.refetch()} />
        </Card>
      ) : !d ? (
        <Card>
          <EmptyState title="No calibration data" />
        </Card>
      ) : (
        <div className="grid">
          <Card className="s-7 s-md-12" title="PIT histograms" sub="roughly uniform = well calibrated">
            {d.pit?.bins?.length ? <PitHistograms cal={d} /> : <EmptyState title="No PIT data" />}
          </Card>
          <Card className="s-5 s-md-12" title="Reliability diagram" sub="nominal vs observed coverage">
            {d.reliability?.nominal?.length ? <ReliabilityDiagram cal={d} /> : <EmptyState title="No reliability data" />}
          </Card>
          <Card className="s-6 s-md-12" title="90% coverage over time" sub="mixture · target 85–95%">
            {d.coverage_over_time?.time_idx?.length ? <CoverageOverTime cal={d} /> : <EmptyState title="No coverage series" />}
          </Card>
          <Card className="s-6 s-md-12" title="Residual CUSUM" sub="drift sentinel">
            {d.cusum?.time_idx?.length ? <CusumChart cal={d} /> : <EmptyState title="No CUSUM series" />}
          </Card>
          <Card className="s-12" title="CRPS per model" sub="lower is better">
            {models.data?.models?.length ? (
              <div className="table-wrap">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th className="r">CRPS</th>
                      <th className="r">90% coverage</th>
                      <th className="r">Mean σ °F</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...models.data.models]
                      .sort((a, b) => MODEL_ORDER.indexOf(a.model_id) - MODEL_ORDER.indexOf(b.model_id))
                      .map((m) => (
                        <tr key={m.model_id} className={m.status === "shadow" ? "shadow" : ""}>
                          <td>
                            <span className="swatch" style={{ background: modelColor(m.model_id, "dark") }} />
                            {m.label}
                          </td>
                          <td className="r">{num(m.crps, 2)}</td>
                          <td className="r">{m.coverage90 === null ? "—" : `${(m.coverage90 * 100).toFixed(0)}%`}</td>
                          <td className="r">{num(m.mean_sigma, 2)}</td>
                        </tr>
                      ))}
                    <tr className="total">
                      <td>Mixture</td>
                      <td className="r">{num(models.data.mixture.crps, 2)}</td>
                      <td className="r">
                        {models.data.mixture.coverage90 === null ? "—" : `${(models.data.mixture.coverage90 * 100).toFixed(0)}%`}
                      </td>
                      <td className="r">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No model metrics" />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
