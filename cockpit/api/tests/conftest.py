"""Test-session setup: never write to the live decision record (artifacts/audit.db)."""
import os
import tempfile

os.environ.setdefault("FCC_AUDIT_DB", os.path.join(tempfile.mkdtemp(prefix="fcc_audit_"), "audit.db"))
os.environ.setdefault("FCC_SCRIPTED", "0")  # engine tests check the real engines; test_scripted turns it on
os.environ.setdefault("FCC_DATA_SOURCE", "csv")  # tests stay offline; test_bq_source covers the BigQuery path
