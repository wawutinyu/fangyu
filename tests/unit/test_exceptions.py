"""异常体系与 API handler 冒烟测试"""
from fastapi.testclient import TestClient

from fangyu.core.constitution import ConstitutionViolation
from fangyu.core.exceptions import ConstitutionError, FangyuError, TrustError
from fangyu.engine.trust_runtime import TrustViolation
from fangyu.server import app


def test_violation_aliases_inherit_fangyu_error():
    assert issubclass(ConstitutionViolation, ConstitutionError)
    assert issubclass(ConstitutionViolation, FangyuError)
    assert issubclass(ConstitutionViolation, ValueError)
    assert issubclass(TrustViolation, TrustError)
    assert issubclass(TrustViolation, FangyuError)
    assert issubclass(TrustViolation, ValueError)


def test_fangyu_error_handler_returns_json():
    @app.get("/__test_fangyu_error")
    async def _boom():
        raise ConstitutionViolation("forbidden_action", "blocked", context={"violations": []})

    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/__test_fangyu_error")
    assert resp.status_code == 403
    body = resp.json()
    assert body["type"] == "constitution"
    assert body["rule"] == "forbidden_action"
