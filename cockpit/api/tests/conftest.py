"""Test-session setup: never write to the live decision record (artifacts/audit.db)."""
import os
import tempfile

os.environ.setdefault("FCC_AUDIT_DB", os.path.join(tempfile.mkdtemp(prefix="fcc_audit_"), "audit.db"))
