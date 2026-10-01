"use client";

import dynamic from "next/dynamic";
import type { PlotParams } from "react-plotly.js";
import { useMemo } from "react";
import { PLOT_CONFIG } from "@/lib/plotTheme";
import { useCockpit } from "@/lib/store";

/** react-plotly.js bound to plotly.js-dist-min, loaded client-side only. */
const PlotlyPlot = dynamic<PlotParams>(
  async () => {
    const [plotlyMod, factoryMod] = await Promise.all([
      import("plotly.js-dist-min"),
      import("react-plotly.js/factory"),
    ]);
    const Plotly = (plotlyMod as unknown as { default?: object }).default ?? plotlyMod;
    const factory = (factoryMod as unknown as { default: (p: object) => React.ComponentType<PlotParams> })
      .default;
    return factory(Plotly);
  },
  { ssr: false, loading: () => <div className="skeleton chart-skeleton" aria-hidden /> },
);

export interface ChartProps extends Omit<PlotParams, "config" | "style" | "useResizeHandler"> {
  height?: number | string;
  config?: PlotParams["config"];
  ariaLabel: string;
}

/**
 * Themed chart. Re-renders (Plotly.react) whenever the theme changes because the
 * caller builds `layout` from theme tokens; `revision` guarantees a redraw.
 */
export default function Chart({ height = 280, config, ariaLabel, layout, ...rest }: ChartProps) {
  const theme = useCockpit((s) => s.theme);
  const merged = useMemo(() => ({ ...PLOT_CONFIG, ...((config ?? {}) as object) }), [config]);
  const lay = useMemo(() => ({ autosize: true, ...((layout ?? {}) as object) }), [layout]);
  return (
    <div className="chart" role="img" aria-label={ariaLabel} style={{ height }}>
      <PlotlyPlot
        onError={(err: unknown) => { console.error("[Chart]", ariaLabel, err); }}
        {...rest}
        layout={lay}
        config={merged}
        revision={(rest.revision ?? 0) + (theme === "dark" ? 0 : 1_000_000)}
        useResizeHandler
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
