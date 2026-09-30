"""Unit tests for ADK Agent packaging (Epic E5).

Verifies the Agent definition, canonical tools registration and invocation,
fallback compatibility layer, and mandatory system prompt guardrails.
"""
from __future__ import annotations

import pytest

from app.copilot.adk_agent import (
    ADK_CANONICAL_TOOLS,
    ALL_TOOLS,
    AdkCompatibleAgent,
    Agent,
    HAS_GOOGLE_ADK,
    create_fcc_agent,
    find_similar_events,
    get_document_section,
    get_model_metrics,
    get_recommendations,
    get_run_snapshot,
    query_timeseries,
    root_agent,
    run_sql_readonly,
    search_documents,
)


def test_agent_definition():
    """Verify root_agent properties and Agent class structure."""
    assert root_agent is not None
    assert isinstance(root_agent, (Agent, AdkCompatibleAgent))
    assert root_agent.name == "fcc_soft_sensor_copilot"
    assert "gemini" in root_agent.model.lower()
    assert len(root_agent.description) > 20
    assert len(root_agent.instruction) > 200
    assert root_agent.system_instruction == root_agent.instruction
    assert isinstance(root_agent.tools, list)
    assert len(root_agent.tools) == 8


def test_adk_compatible_fallback():
    """Verify the fallback AdkCompatibleAgent behavior and methods."""
    agent = AdkCompatibleAgent(
        name="custom_agent",
        model="gemini-2.5-flash",
        instruction="Custom instruction",
        description="Custom description",
        tools=[get_run_snapshot, query_timeseries],
    )
    assert agent.name == "custom_agent"
    assert agent.model == "gemini-2.5-flash"
    assert agent.system_instruction == "Custom instruction"
    assert agent.get_tool_names() == ["get_run_snapshot", "query_timeseries"]
    assert agent.get_tool("get_run_snapshot") is get_run_snapshot
    assert agent.get_tool("unknown") is None
    repr_str = repr(agent)
    assert "custom_agent" in repr_str
    assert "gemini-2.5-flash" in repr_str


def test_tools_registration():
    """Verify all 8 canonical tools are registered in root_agent and have valid metadata."""
    expected_tool_names = {
        "get_run_snapshot",
        "query_timeseries",
        "get_recommendations",
        "get_model_metrics",
        "search_documents",
        "get_document_section",
        "find_similar_events",
        "run_sql_readonly",
    }
    registered_names = {getattr(t, "__name__", "") for t in root_agent.tools}
    assert registered_names == expected_tool_names

    # Check each tool is callable and has a descriptive docstring
    for tool in root_agent.tools:
        assert callable(tool), f"Tool {tool} is not callable"
        doc = getattr(tool, "__doc__", "")
        assert doc and len(doc.strip()) > 10, f"Tool {tool} has missing or empty docstring"


def test_system_prompt_guardrails():
    """Verify that mandatory safety, domain, and operational guardrails exist in system instructions."""
    instr = root_agent.instruction

    # Guardrail 1: Read-only advisor / refuse control writes (DECISIONS S3)
    assert "Read-only advisor" in instr
    assert "DECISIONS S3" in instr
    assert "no write tools" in instr

    # Guardrail 2: Distribution Spread Gate & verbatim quote when WITHHELD (DECISIONS T5, SDD-COP-05)
    assert "get_gate_status" in instr
    assert "WITHHELD" in instr
    assert "VERBATIM" in instr

    # Guardrail 3: Grounding / no invented numbers
    assert "Never estimate, guess, or invent numbers" in instr

    # Guardrail 4: Simulator truth label
    assert "simulator truth" in instr

    # Guardrail 5: Document citations
    assert "[DOC-ID rN §x.y]" in instr
    assert "No cited source" in instr

    # Guardrail 6: No financial content / refuse dollar values (DECISIONS S2)
    assert "No financial content" in instr
    assert "DECISIONS S2" in instr

    # Guardrail 7: Scope & Sulfur site-phase only (DECISIONS S1)
    assert "DECISIONS S1" in instr
    assert "sulfur" in instr.lower()

    # Guardrail 8: Security & prompt injection
    assert "prompt injection" in instr.lower()


def test_agent_factory_context():
    """Verify agent factory properly binds contextual parameters."""
    ctx = {
        "page": "/decision/overview",
        "run_id": "random_s140",
        "property": "HN_T98_F",
        "time_min": 522,
    }
    agent = create_fcc_agent(ctx=ctx, tools=ALL_TOOLS)
    assert "page=/decision/overview" in agent.instruction
    assert "property=HN_T98_F" in agent.instruction
    assert "time_min=522" in agent.instruction
    assert len(agent.tools) == len(ALL_TOOLS)


def test_tool_execution_get_run_snapshot():
    """Verify get_run_snapshot executes and returns structured estimate state."""
    res = get_run_snapshot(property="LCO_T98_F")
    assert isinstance(res, dict)
    assert "property" in res
    assert res["property"] == "LCO_T98_F"
    assert "gate" in res
    assert "trust" in res
    assert "mixture" in res


def test_tool_execution_query_timeseries():
    """Verify query_timeseries executes and returns downsampled series."""
    res = query_timeseries(cols="LCO_T98_F,time_min")
    assert isinstance(res, dict)
    assert "time_min" in res
    assert "series" in res
    assert "LCO_T98_F" in res["series"]
    assert len(res["time_min"]) <= 200


def test_tool_execution_get_recommendations():
    """Verify get_recommendations executes and returns card list."""
    res = get_recommendations(property="LCO_T98_F", n=5)
    assert isinstance(res, dict)
    assert "recommendations" in res
    assert "count" in res
    assert len(res["recommendations"]) <= 5


def test_tool_execution_get_model_metrics():
    """Verify get_model_metrics executes and returns model evaluation table."""
    res = get_model_metrics(property="LCO_T98_F")
    assert isinstance(res, dict)
    assert "property" in res
    assert "models" in res
    assert isinstance(res["models"], list)


def test_tool_execution_search_documents():
    """Verify search_documents executes against simulated knowledge corpus."""
    res = search_documents(query="cut-point excursion", doc_type="INC", k=3)
    assert isinstance(res, dict)
    assert "results" in res
    assert "instruction" in res
    assert isinstance(res["results"], list)


def test_tool_execution_get_document_section():
    """Verify get_document_section executes and retrieves doc section."""
    res = get_document_section(doc_id="SOP-FRAC-003", section="4.2")
    assert isinstance(res, dict)
    assert "meta" in res
    assert "section" in res
    assert res["section"] == "4.2"
    assert "text" in res


def test_tool_execution_find_similar_events():
    """Verify find_similar_events executes and returns events and documents."""
    res = find_similar_events(event_code=1, description="crude switch")
    assert isinstance(res, dict)
    assert "events" in res
    assert "documents" in res
    assert isinstance(res["events"], list)


def test_tool_execution_run_sql_readonly():
    """Verify run_sql_readonly executes valid SELECT and rejects forbidden DDL/DML."""
    res = run_sql_readonly("SELECT count(*) as row_count FROM fcc_sim_minute")
    assert isinstance(res, dict)
    assert "rows" in res
    assert "columns" in res
    assert len(res["rows"]) == 1
    assert "row_count" in res["rows"][0]

    # Security check: DDL/DML must be blocked
    with pytest.raises(ValueError, match="only SELECT queries are allowed|forbidden keyword"):
        run_sql_readonly("DROP TABLE fcc_sim_minute")

    with pytest.raises(ValueError, match="only SELECT queries are allowed|forbidden keyword"):
        run_sql_readonly("INSERT INTO fcc_sim_minute VALUES (1, 2, 3)")

    with pytest.raises(ValueError, match="forbidden keyword"):
        run_sql_readonly("SELECT * FROM (ATTACH 'evil.db' AS evil)")
