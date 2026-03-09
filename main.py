import sys
import os
import importlib.util

backend_dir = os.path.join(os.path.dirname(__file__), "backend")
sys.path.insert(0, backend_dir)

_spec = importlib.util.spec_from_file_location(
    "backend_main",
    os.path.join(backend_dir, "main.py"),
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
app = _mod.app
