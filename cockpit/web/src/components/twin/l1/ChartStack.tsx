"use client";

import { useCockpit } from "@/lib/store";
import { TwinWorkbench } from "@/lib/twinTypes";
import Chart from "@/components/charts/Chart";
import { baseLayout, axisStyle, timeAxis, cursorShape } from "@/lib/plotTheme";
import { getRoleColor } from "@/lib/palette";

export default function ChartStack({ data }: { data: TwinWorkbench }) {
  const timeMin = useCockpit((s) => s.timeMin) ?? 0;
  const setTimeMin = useCockpit((s) => s.setTimeMin);
  const theme = useCockpit((s) => s.theme);

  const xData = data.series.time_min;

  return (
    <div className="twin-panel-strip">
      {data.panels.map((panel) => {
        const plotData: any[] = [];
        
        // Custom Handling for tray_profile
        if (panel.kind === "tray_profile") {
          const meas = panel.traces?.find(t => t.role === "measured");
          const exp = panel.traces?.find(t => t.role === "expected");
          
          if (meas && data.series.keys[meas.key]) {
             plotData.push({
               y: data.series.keys[meas.key], // Trays usually y-axis? Or x? "x = tray number, y = temperature". Wait, if x = tray number:
               x: data.series.keys[meas.key].map((_, i) => i + 1),
               type: "scatter",
               mode: "lines+markers",
               line: { color: getRoleColor("measured") },
               name: "Measured"
             });
          }
          if (exp && data.series.keys[exp.key]) {
             plotData.push({
               y: data.series.keys[exp.key],
               x: data.series.keys[exp.key].map((_, i) => i + 1),
               type: "scatter",
               mode: "lines+markers",
               line: { color: getRoleColor("expected"), dash: "dot" },
               name: "Expected"
             });
          }

          const layout = {
            ...baseLayout(theme),
            height: 170,
            margin: { l: 40, r: 40, t: 30, b: 20 },
            title: { text: "", font: { size: 12 }, x: 0 },
            showlegend: true,
            legend: { orientation: "h" as const, y: -0.2, font: { size: 10 } },
            xaxis: { ...axisStyle(theme), title: "Tray Number" },
            yaxis: { ...axisStyle(theme), title: panel.unit },
          };

          return (
            <div key={panel.panel_id} id={`panel-${panel.panel_id}`} className="twin-card row" style={{ padding: 0 }}>
              <div style={{ width: 150, padding: 16, borderRight: "1px solid var(--border)", background: "var(--canvas)", display: "flex", alignItems: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{panel.title}</div>
              </div>
              <div style={{ flex: 1, padding: 8 }}>
                <Chart data={plotData} layout={layout} height={170} ariaLabel={panel.title} />
              </div>
            </div>
          );
        }

        // Add bands
        const loTrace = panel.traces?.find(t => t.role === "band_lo");
        const hiTrace = panel.traces?.find(t => t.role === "band_hi");
        if (loTrace && hiTrace) {
          const c = getRoleColor("band_lo");
          plotData.push({
            x: xData,
            y: data.series.keys[loTrace.key],
            type: "scatter",
            mode: "lines",
            line: { width: 0 },
            showlegend: false,
            hoverinfo: "skip"
          });
          plotData.push({
            x: xData,
            y: data.series.keys[hiTrace.key],
            type: "scatter",
            mode: "lines",
            fill: "tonexty",
            fillcolor: `${c}26`, // ~15% alpha
            line: { width: 0 },
            name: "5-95% band",
            hoverinfo: "skip"
          });
        }

        // Residual ±3σ symmetric band
        if (panel.kind === "residual") {
          const sigTrace = panel.traces?.find(t => t.role === "sigma3");
          if (sigTrace && data.series.keys[sigTrace.key]) {
             const c = getRoleColor("sigma3");
             const sigValues = data.series.keys[sigTrace.key];
             plotData.push({
               x: xData, y: sigValues.map(v => -v),
               type: "scatter", mode: "lines", line: { width: 0 }, showlegend: false, hoverinfo: "skip"
             });
             plotData.push({
               x: xData, y: sigValues,
               type: "scatter", mode: "lines", fill: "tonexty", fillcolor: `${c}26`, line: { width: 0 },
               name: "±3σ band", hoverinfo: "skip"
             });
          }
        }

        // Regular traces
        panel.traces?.forEach((t, i) => {
          if (t.role === "band_lo" || t.role === "band_hi" || (panel.kind === "residual" && t.role === "sigma3")) return;
          
          let y = data.series.keys[t.key];
          if (!y) return;
          let mode = "lines";
          let line = {
            color: getRoleColor(t.role, i),
            width: 2,
            dash: (t.role === "plan" || t.role === "spec") ? "dash" : "solid"
          };
          
          let yaxis = "y1";
          if (t.role === "cusum") yaxis = "y2";
          if (panel.kind === "combustion" && t.key.includes("CO")) yaxis = "y2";

          plotData.push({
            x: xData,
            y: y,
            type: "scatter",
            mode,
            line,
            name: t.label ?? t.key,
            yaxis
          });
        });

        // Hlines
        const shapes: any[] = [];
        panel.hlines?.forEach(h => {
          shapes.push({
            type: "line",
            x0: xData[0],
            x1: xData[xData.length - 1],
            y0: h.value,
            y1: h.value,
            line: {
              color: getRoleColor(h.role),
              dash: h.role === "plan" || h.role === "spec" ? "dash" : "solid",
              width: 1
            }
          });
        });

        // Cursor shape
        shapes.push(cursorShape(timeMin, theme));

        // Annotations for markers
        const annotations: any[] = [];
        panel.markers?.forEach(m => {
          annotations.push({
            x: m.time_min,
            y: 0,
            yref: "paper",
            text: m.label,
            showarrow: true,
            arrowhead: 2,
            ax: 0,
            ay: -30,
            font: { size: 10, color: "var(--text)" },
            arrowcolor: "var(--text)"
          });
        });

        let y2 = undefined;
        if (plotData.some(d => d.yaxis === "y2")) {
           y2 = { ...axisStyle(theme), overlaying: "y", side: "right", title: panel.kind === "combustion" ? "CO ppm" : "CUSUM" };
        }

        const layout = {
          ...baseLayout(theme),
          height: 170,
          margin: { l: 40, r: 40, t: 10, b: 20 },
          title: { text: "", font: { size: 12 }, x: 0 },
          showlegend: true,
          legend: { orientation: "h" as const, y: -0.2, font: { size: 10 } },
          xaxis: { ...timeAxis, gridcolor: axisStyle(theme).gridcolor, tickfont: axisStyle(theme).tickfont },
          yaxis: { ...axisStyle(theme), title: panel.kind === "combustion" ? "O2 %" : panel.unit },
          yaxis2: y2,
          shapes,
          annotations
        };

        const ucs = panel.use_case_ids ? panel.use_case_ids.map(id => `panel-${id}`).join(" ") : "";

        return (
          <div key={panel.panel_id} id={`panel-${panel.panel_id}`} className={`twin-card row ${ucs}`} style={{ padding: 0 }}>
            <div style={{ width: 150, padding: "16px 12px", borderRight: "1px solid var(--border)", background: "var(--canvas)", display: "flex", alignItems: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{panel.title}</div>
            </div>
            <div style={{ flex: 1, padding: 8 }}>
              <Chart
                data={plotData}
                layout={layout}
                height={170}
                onClick={(e: any) => {
                  if (e.points && e.points.length > 0) {
                    setTimeMin(e.points[0].x);
                  }
                }}
                ariaLabel={panel.title}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
