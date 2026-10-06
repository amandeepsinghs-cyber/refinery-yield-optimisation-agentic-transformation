"use client";

/**
 * What the FCC makes — products by carbon number and boiling range (owner, 6 Oct: "it will help my team and me
 * understand, and IOCL will see we know what we are doing"). Shown on the Overview and on U4 · Fractionator, where the
 * cut points are decided. Ranges are typical textbook values; the simulated FCC cuts heavier (noted below the table).
 */
const ROWS: { name: string; carbon: string; bpF: string; bpC: string; goesTo: string; ours?: string }[] = [
  { name: "LPG", carbon: "C3–C4", bpF: "below ~90 °F", bpC: "below ~30 °C", goesTo: "LPG (propane, butane) and alkylation feed" },
  { name: "Light naphtha", carbon: "C5–C7", bpF: "~90–300 °F", bpC: "~30–150 °C", goesTo: "Petrol pool" },
  { name: "Heavy naphtha (HN)", carbon: "C7–C12", bpF: "~300–430 °F", bpC: "~150–220 °C", goesTo: "Petrol pool or reformer feed", ours: "HN T98 · soft sensor" },
  { name: "Light cycle oil (LCO)", carbon: "C12–C20", bpF: "~430–650 °F", bpC: "~220–345 °C", goesTo: "Diesel pool, after hydrotreating", ours: "LCO T98 · soft sensor" },
  { name: "Slurry (decant oil)", carbon: "C20+", bpF: "above ~650 °F", bpC: "above ~345 °C", goesTo: "Fuel oil or carbon-black feed" },
];

export default function ProductLadder({ compact = false }: { compact?: boolean }) {
  return (
    <section className={compact ? "pl pl-compact" : "pl"} aria-labelledby={compact ? "pl-h-u4" : "pl-h"}>
      <h2 id={compact ? "pl-h-u4" : "pl-h"} className={compact ? "pl-h3" : "pf-h2"}>What the FCC makes — by molecule size and boiling range</h2>
      <p className="pf-sub">
        The FCC cracks long, heavy molecules into shorter ones; the main fractionator then separates them by boiling point.
        A <b>cut point</b> is the boiling temperature where one product ends and the next begins. <b>T98</b> is the
        temperature at which 98 % of a product has boiled off: its heavy end, and what the specification limits. Set the cut
        too light and valuable product slips into the cheaper stream below; too heavy and the product goes off spec.
      </p>
      <table className="pl-table">
        <thead>
          <tr><th>Product</th><th>Carbon atoms</th><th>Typical boiling range</th><th>Goes to</th><th>What we estimate</th></tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.name} className={r.ours ? "on" : undefined}>
              <td><b>{r.name}</b></td>
              <td>{r.carbon}</td>
              <td>{r.bpF} <small>({r.bpC})</small></td>
              <td>{r.goesTo}</td>
              <td>{r.ours ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pf-note">
        Lighter at the top, heavier at the bottom. Ranges are typical; each refinery sets its own cuts. This simulated FCC
        cuts heavier than typical (LCO T98 about 755 °F, heavy naphtha T98 about 530 °F), so its numbers sit above these ranges.
      </p>
    </section>
  );
}
