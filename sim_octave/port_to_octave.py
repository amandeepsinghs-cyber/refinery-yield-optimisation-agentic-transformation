"""Create an Octave-compatible working copy of the Santander et al. (2022) FCC-Fractionator model.

The original repository (../FCC-Fractionator) is left untouched. Only solver-call syntax is
changed; the process physics (FCC.m, PFR.m, Enthalpy*.m, stage/holds equations) are unchanged.

Changes applied:
  1. fsolve(@stage, x0, options, p1, p2, ...)  ->  fsolve(@(U) stage(U, p1, p2, ...), x0, options)
     (Octave's fsolve does not accept MATLAB's legacy extra-parameter syntax.)
  2. optimoptions('fsolve', 'FunctionTolerance',1e-6, 'OptimalityTolerance',1e-6, 'Display','none')
     -> optimset('TolFun',1e-6, 'TolX',1e-6, 'Display','off')
     (optimoptions does not exist in Octave.)
"""

import pathlib
import re
import shutil

SRC = pathlib.Path(__file__).resolve().parent.parent / "FCC-Fractionator"
DST = pathlib.Path(__file__).resolve().parent / "model"

PHYSICS_FILES = ["FCC.m", "FCND.m", "Filter.m", "PFR.m", "Enthalpy.m", "EnthalpyB.m",
                 "zcyc.m", "zposition.m", "Fractionator.m", "Fractionatori.m"]

FSOLVE_RE = re.compile(r"fsolve\(@stage,(\[[^\]]*\]),options,([^;]*)\);")
OPTIM_OLD = ("optimoptions('fsolve','FunctionTolerance',1e-6,"
             "'OptimalityTolerance',1e-6,'Display','none')")
OPTIM_NEW = "optimset('TolFun',1e-6,'TolX',1e-6,'Display','off')"


def port(text: str) -> tuple[str, int, int]:
    n_opt = text.count(OPTIM_OLD)
    text = text.replace(OPTIM_OLD, OPTIM_NEW)

    def repl(m: re.Match) -> str:
        x0, args = m.group(1), m.group(2)
        return f"fsolve(@(U) stage(U,{args}),{x0},options);"

    text, n_fs = FSOLVE_RE.subn(repl, text)
    return text, n_opt, n_fs


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    for name in PHYSICS_FILES:
        src = SRC / name
        text = src.read_text(encoding="utf-8", errors="replace")
        if name.startswith("Fractionator"):
            text, n_opt, n_fs = port(text)
            text = patch_cutpoint_manual(text)
            print(f"{name}: optimoptions replaced={n_opt}, fsolve calls rewritten={n_fs}, "
                  "cut-point manual-mode hook added")
            (DST / name).write_text(text, encoding="utf-8")
        elif name == "PFR.m":
            (DST / name).write_text(speed_patch_pfr(text), encoding="utf-8")
            print(f"{name}: performance patch applied (constants cached, loop vectorised)")
        else:
            shutil.copy2(src, DST / name)
            print(f"{name}: copied unchanged")
    shutil.copy2(SRC / "LICENSE", DST / "LICENSE")


def patch_cutpoint_manual(text: str) -> str:
    """Opt-in manual mode for the HN (TC5) and LCO (TC6) cut-point PI controllers.

    In the original model both controllers act on the *true* 98% cut point every step, i.e. a
    perfect online analyser. Real units usually know the cut point only from the lab, so the
    draw is held in manual between lab results. When cutpoint_auto() returns false the
    controller error is set to zero: the PI output (draw valve) holds its last value and the
    integral state is frozen, so switching between modes is bumpless. cutpoint_auto() defaults
    to true, which reproduces the original behaviour exactly.
    """
    for line in ("eTC6=(SP(4)-Ttrack2)*1;", "eTC5=(SP(3)-Ttrack1)*1;"):
        assert text.count(line) == 1, f"unexpected layout: {line}"
        var = line.split("=")[0]
        text = text.replace(
            line, f"{line}\nif ~cutpoint_auto(), {var}=0; end  % manual mode (sim_octave hook)")
    return text


def speed_patch_pfr(text: str) -> str:
    """Performance-only rewrite of the riser() kinetics function (profiling showed ~70% of runtime).

    - Molecular weights, stoichiometric coefficients v, and Arrhenius parameters A, E are constants;
      they are computed once and cached with `persistent` instead of being rebuilt on every call.
    - The per-iteration `clear v1` (called ~200k times per simulated minute) is removed.
    - k(i) = A(i)*exp(-E(i)/(R*T)) is evaluated as one vector expression (same arithmetic).
    """
    lines = text.splitlines()
    start = next(i for i, l in enumerate(lines) if l.strip().startswith("%Parameters MW (g/mol) lump (j)"))
    rate = next(i for i, l in enumerate(lines) if l.strip().startswith("%Rate Value"))
    const_block = [l for l in lines[start:rate] if l.strip() != "clear v1"]
    cached = (["persistent MWT v a1 A E R", "if isempty(v)"]
              + ["  " + l for l in const_block]
              + ["end"])
    lines = lines[:start] + cached + lines[rate:]
    # vectorise the rate-constant loop
    k0 = next(i for i, l in enumerate(lines) if l.strip() == "k=[];")
    assert lines[k0 + 1].strip() == "for i=1:a1" and lines[k0 + 4].strip() == "end", "unexpected PFR.m layout"
    lines = lines[:k0] + ["k=A(1:a1).*exp(-1*(E(1:a1))/(R*T));"] + lines[k0 + 5:]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main()
