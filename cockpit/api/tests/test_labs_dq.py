import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.state import get_state

client = TestClient(app)

def test_get_labs():
    st = get_state()
    run_id = list(st.catalog.runs.keys())[0]
    res = client.get(f"/api/labs?run_id={run_id}")
    assert res.status_code == 200
    data = res.json()
    assert data["run_id"] == run_id
    assert "reproducibility_F" in data
    assert "labs" in data
    assert "summary" in data
    assert "provenance" in data

def test_get_dq():
    st = get_state()
    run_id = list(st.catalog.runs.keys())[0]
    res = client.get(f"/api/dq?run_id={run_id}")
    assert res.status_code == 200
    data = res.json()
    assert data["run_id"] == run_id
    assert "t2" in data
    assert "spe" in data
    assert "tags" in data
    assert "provenance" in data
