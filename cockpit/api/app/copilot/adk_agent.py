"""ADK Agent packaging for FCC Soft-Sensor Decision Cockpit Copilot (Epic E5).

Provides a standard Google Agent Development Kit (ADK) `Agent` definition (`root_agent`)
binding the copilot tools and system instructions with guardrails.

If `google-adk` is installed in the environment, it uses `google.adk.agents.Agent`.
Otherwise, it seamlessly falls back to `AdkCompatibleAgent`, providing full structural
and functional compatibility without breaking existing runtime dependencies.
"""
from __future__ import annotations

import json
from typing import Any, Callable

from ..config import get_settings
from ..state import get_state
from .chat import system_instruction
from .tools import ToolBox, validate_sql

# -----------------------------------------------------------------------------
# ADK Agent Import / Fallback Compatibility Layer
# -----------------------------------------------------------------------------

class AdkCompatibleAgent:
    """Clean fallback matching google.adk.agents.Agent when google-adk is not installed.
    
    Provides the standard ADK Agent attributes (name, model, instruction, tools,
    description, sub_agents, generate_content_config) and inspection methods.
    """

    def __init__(
        self,
        name: str,
        model: str,
        instruction: str | None = None,
        description: str | None = None,
        tools: list[Callable] | None = None,
        generate_content_config: Any = None,
        sub_agents: list | None = None,
        **kwargs: Any,
    ):
        self.name = name
        self.model = model
        self.instruction = instruction or ""
        self.description = description or ""
        self.tools: list[Callable] = list(tools or [])
        self.generate_content_config = generate_content_config
        self.sub_agents = list(sub_agents or [])
        self.extra_kwargs = kwargs

    @property
    def system_instruction(self) -> str:
        return self.instruction

    def get_tool(self, name: str) -> Callable | None:
        """Find a tool by its function name."""
        for t in self.tools:
            if getattr(t, "__name__", None) == name:
                return t
        return None

    def get_tool_names(self) -> list[str]:
        """Return the names of all registered tools."""
        return [getattr(t, "__name__", str(t)) for t in self.tools]

    def __repr__(self) -> str:
        tool_names = self.get_tool_names()
        return (
            f"Agent(name={self.name!r}, model={self.model!r}, "
            f"tools={tool_names}, n_tools={len(self.tools)})"
        )


try:
    from google.adk.agents import Agent as _RealAdkAgent  # type: ignore
    HAS_GOOGLE_ADK = True
    Agent = _RealAdkAgent
except ImportError:
    try:
        from google.adk import Agent as _RealAdkAgent  # type: ignore
        HAS_GOOGLE_ADK = True
        Agent = _RealAdkAgent
    except ImportError:
        HAS_GOOGLE_ADK = False
        Agent = AdkCompatibleAgent


# -----------------------------------------------------------------------------
# ADK Tools (Canonical 8 Tools + Supplementary Read-Only Tools)
# -----------------------------------------------------------------------------

def get_run_snapshot(
    property: str | None = None,
    time_min: int | None = None,
    run_id: str | None = None,
) -> dict:
    """Latest estimate state message for a property at the specified or current minute.
    
    Returns member model estimates, mixture quantiles, W90 spread, Kalman bias,
    Distribution Spread Gate status, trust level, and simulator truth.
    """
    ctx: dict[str, Any] = {}
    if property:
        ctx["property"] = property
    if time_min is not None:
        ctx["time_min"] = int(time_min)
    if run_id:
        ctx["run_id"] = run_id
    tb = ToolBox(ctx)
    return tb.t_get_current_state(property=property)


def query_timeseries(
    cols: str,
    run_id: str | None = None,
    from_min: int | None = None,
    to_min: int | None = None,
) -> dict:
    """Down-sampled simulated time series (<=200 points) for specified columns of a run."""
    ctx = {"run_id": run_id} if run_id else {}
    tb = ToolBox(ctx)
    return tb.t_get_timeseries(cols=cols, run_id=run_id, from_min=from_min, to_min=to_min)


def get_recommendations(
    status: str | None = None,
    property: str | None = None,
    n: int = 8,
    run_id: str | None = None,
) -> dict:
    """Recommendation cards for the specified run (OPEN, ACCEPTED, DECLINED, WITHHELD, EXPIRED)."""
    ctx: dict[str, Any] = {}
    if property:
        ctx["property"] = property
    if run_id:
        ctx["run_id"] = run_id
    tb = ToolBox(ctx)
    return tb.t_list_recommendations(status=status, property=property, n=n)


def get_model_metrics(property: str | None = None) -> dict:
    """Model comparison metrics and parameters: RMSE, coverage, CRPS, weights, admission status."""
    ctx = {"property": property} if property else {}
    tb = ToolBox(ctx)
    return tb.t_get_model_metrics(property=property)


def _ensure_knowledge_loaded():
    st = get_state()
    if st.knowledge.mode == "empty":
        st.knowledge.load(embed=False, background=False)


def search_documents(query: str, doc_type: str | None = None, k: int = 5) -> dict:
    """Search the simulated knowledge corpus (SOPs, IOWs, lab methods, work orders, shift logs, incidents, MOCs)."""
    _ensure_knowledge_loaded()
    tb = ToolBox()
    return tb.t_search_documents(query=query, doc_type=doc_type, k=k)


def get_document_section(doc_id: str, section: str | None = None) -> dict:
    """Get a document (or one section) from the knowledge corpus."""
    _ensure_knowledge_loaded()
    tb = ToolBox()
    return tb.t_get_document(doc_id=doc_id, section=section)


def find_similar_events(event_code: int | None = None, description: str | None = None) -> dict:
    """Find simulated events across runs and related incident/shift documents."""
    _ensure_knowledge_loaded()
    tb = ToolBox()
    return tb.t_find_similar_events(event_code=event_code, description=description)


def run_sql_readonly(sql: str) -> dict:
    """SELECT-only SQL query over table fcc_sim_minute (local simulated catalog via DuckDB). Max 1000 rows."""
    tb = ToolBox()
    return tb.t_query_sim_data(sql=sql)


# Additional read-only tools matching ToolBox methods
def get_gate_status(
    property: str | None = None,
    time_min: int | None = None,
    run_id: str | None = None,
) -> dict:
    """Distribution Spread Gate status with the exact gate message (relay verbatim when WITHHELD)."""
    ctx: dict[str, Any] = {}
    if property:
        ctx["property"] = property
    if time_min is not None:
        ctx["time_min"] = int(time_min)
    if run_id:
        ctx["run_id"] = run_id
    tb = ToolBox(ctx)
    return tb.t_get_gate_status(property=property, time_min=time_min)


def get_distribution(
    property: str | None = None,
    time_min: int | None = None,
    run_id: str | None = None,
) -> dict:
    """Member and mixture summary at a minute: mu, sigma, weight, admitted/shadow, W90, bimodality D, P(on-spec)."""
    ctx: dict[str, Any] = {}
    if property:
        ctx["property"] = property
    if time_min is not None:
        ctx["time_min"] = int(time_min)
    if run_id:
        ctx["run_id"] = run_id
    tb = ToolBox(ctx)
    return tb.t_get_distribution(property=property, time_min=time_min)


def explain_estimate(
    property: str | None = None,
    time_min: int | None = None,
    run_id: str | None = None,
) -> dict:
    """Top feature contributions and hybrid physics vs ML residual at a minute."""
    ctx: dict[str, Any] = {}
    if property:
        ctx["property"] = property
    if time_min is not None:
        ctx["time_min"] = int(time_min)
    if run_id:
        ctx["run_id"] = run_id
    tb = ToolBox(ctx)
    return tb.t_explain_estimate(property=property, time_min=time_min)


def run_whatif(
    overrides_json: str,
    property: str | None = None,
    run_id: str | None = None,
    time_min: int | None = None,
) -> dict:
    """What-if: re-evaluate all members with tag overrides at the minute (read-only)."""
    ctx: dict[str, Any] = {}
    if property:
        ctx["property"] = property
    if time_min is not None:
        ctx["time_min"] = int(time_min)
    if run_id:
        ctx["run_id"] = run_id
    tb = ToolBox(ctx)
    return tb.t_run_whatif(overrides_json=overrides_json, property=property)


def get_lab_history(
    property: str | None = None,
    n: int = 10,
    run_id: str | None = None,
) -> dict:
    """Synthetic lab results with status for the run."""
    ctx: dict[str, Any] = {}
    if property:
        ctx["property"] = property
    if run_id:
        ctx["run_id"] = run_id
    tb = ToolBox(ctx)
    return tb.t_get_lab_history(property=property, n=n)


def draft_handover(
    period_min: int = 480,
    run_id: str | None = None,
    time_min: int | None = None,
) -> dict:
    """Facts for a shift handover over the last N minutes up to time_min: gate transitions, recs, labs, trust mix."""
    ctx: dict[str, Any] = {}
    if run_id:
        ctx["run_id"] = run_id
    if time_min is not None:
        ctx["time_min"] = int(time_min)
    tb = ToolBox(ctx)
    return tb.t_draft_handover(period_min=period_min)


def make_chart(figure_json: str) -> dict:
    """Validate a Plotly figure JSON and render it inline. Use only numbers returned by other tools."""
    tb = ToolBox()
    return tb.t_make_chart(figure_json=figure_json)


def get_systems_twin_state(
    run_id: str | None = None,
    time_min: int | None = None,
) -> dict:
    """Evaluate the 6-unit Connected Refinery Digital Twin, 3 system loops, PINN residuals, and 4-domain ripple matrix."""
    ctx: dict[str, Any] = {}
    if run_id:
        ctx["run_id"] = run_id
    if time_min is not None:
        ctx["time_min"] = int(time_min)
    tb = ToolBox(ctx)
    return tb.t_get_systems_twin_state(run_id=run_id, time_min=time_min)


def get_use_case_detail(
    use_case_id: str,
    run_id: str | None = None,
    time_min: int | None = None,
) -> dict:
    """Evaluate a specific refinery optimisation use case (UC-01 through UC-11) with live KPIs, envelope, and ripple."""
    ctx: dict[str, Any] = {}
    if run_id:
        ctx["run_id"] = run_id
    if time_min is not None:
        ctx["time_min"] = int(time_min)
    tb = ToolBox(ctx)
    return tb.t_get_use_case_detail(use_case_id=use_case_id, run_id=run_id, time_min=time_min)


def get_scope_snapshot(
    unit_id: str | None = None,
    run_id: str | None = None,
    time_min: int | None = None,
) -> dict:
    """Snapshot of what is on screen: unit scope (feed, residual/breach, recipe moves, open decisions) or the whole plant when unit_id is None."""
    ctx: dict[str, Any] = {}
    if run_id:
        ctx["run_id"] = run_id
    if time_min is not None:
        ctx["time_min"] = int(time_min)
    return ToolBox(ctx).t_get_scope_snapshot(unit_id=unit_id, run_id=run_id, time_min=time_min)


def get_regime(run_id: str | None = None, time_min: int | None = None) -> dict:
    """Feed model (E1, DECISIONS S-8): feed change, feed API estimate, novelty and class; the crude family is context only."""
    ctx: dict[str, Any] = {}
    if run_id:
        ctx["run_id"] = run_id
    if time_min is not None:
        ctx["time_min"] = int(time_min)
    return ToolBox(ctx).t_get_regime(run_id=run_id, time_min=time_min)


def get_recipe(unit_id: str, run_id: str | None = None, time_min: int | None = None) -> dict:
    """Coordinated multi-set-point recipe for a unit (E4) or gate=WITHHELD with reason."""
    ctx: dict[str, Any] = {}
    if run_id:
        ctx["run_id"] = run_id
    if time_min is not None:
        ctx["time_min"] = int(time_min)
    return ToolBox(ctx).t_get_recipe(unit_id=unit_id, run_id=run_id, time_min=time_min)


# Canonical aliases
get_current_state = get_run_snapshot
get_timeseries = query_timeseries
list_recommendations = get_recommendations
get_document = get_document_section
query_sim_data = run_sql_readonly

# Canonical 8 tools specified for ADK copilot packaging
ADK_CANONICAL_TOOLS: list[Callable] = [
    get_run_snapshot,
    query_timeseries,
    get_recommendations,
    get_model_metrics,
    search_documents,
    get_document_section,
    find_similar_events,
    run_sql_readonly,
]

ALL_TOOLS: list[Callable] = ADK_CANONICAL_TOOLS + [
    get_gate_status,
    explain_estimate,
    get_distribution,
    run_whatif,
    get_lab_history,
    draft_handover,
    make_chart,
    get_systems_twin_state,
    get_use_case_detail,
    get_scope_snapshot,
    get_regime,
    get_recipe,
]


# -----------------------------------------------------------------------------
# Agent Factory and root_agent Definition
# -----------------------------------------------------------------------------

def create_fcc_agent(
    ctx: dict | None = None,
    tools: list[Callable] | None = None,
    model: str | None = None,
) -> Agent:
    """Create an ADK Agent instance for the FCC Decision Cockpit copilot.
    
    Args:
        ctx: Optional page/run context dictionary with 'page', 'run_id', 'property', 'time_min'.
        tools: Optional tool list; defaults to ADK_CANONICAL_TOOLS.
        model: Optional model override; defaults to settings['gemini']['text_model'].
    """
    s = get_settings()
    model_name = model or s.get("gemini", {}).get("text_model", "gemini-2.5-flash")
    instr = system_instruction(ctx or {})
    return Agent(
        name="fcc_soft_sensor_copilot",
        model=model_name,
        instruction=instr,
        description=(
            "FCC soft-sensor Decision Cockpit advisory copilot for technical demo on simulated data. "
            "Explains quality estimates, distributions, Spread Gate withholds, recommendations, "
            "and cites operational documents."
        ),
        tools=tools or list(ADK_CANONICAL_TOOLS),
    )


# Module-level root_agent following standard ADK convention
root_agent = create_fcc_agent()
