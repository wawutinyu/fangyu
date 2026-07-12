"""Agent exe export helpers."""
from fangyu.core.pyinstaller_util import bundle_launcher_source


def test_launcher_source_contains_bundle_dir():
    src = bundle_launcher_source("MyAgent.bundle", 9001)
    assert "MyAgent.bundle" in src
    assert "run_bundle_server" in src
    assert "9001" in src
