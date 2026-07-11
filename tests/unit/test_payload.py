"""Payload 多模态解析测试"""
import pytest

from fangyu.a2a.payload import (
    CONTENT_FILE_REF,
    CONTENT_INDUSTRIAL,
    CONTENT_JSON,
    CONTENT_TEXT,
    Payload,
    build_message_from_payload,
    message_to_inputs,
    message_to_payloads,
)


def test_text_payload():
    msg = {"role": "user", "parts": [{"type": "text", "text": "hello"}], "metadata": {"skill_id": "default"}}
    inputs = message_to_inputs(msg)
    assert inputs["message"] == "hello"
    assert inputs["skill_id"] == "default"


def test_json_data_part():
    msg = {
        "role": "user",
        "parts": [{"type": "data", "data": {"content_type": CONTENT_JSON, "body": {"action": "start", "speed": 100}}}],
    }
    inputs = message_to_inputs(msg)
    assert inputs["action"] == "start"
    assert inputs["speed"] == 100


def test_file_and_image_refs():
    msg = {
        "role": "user",
        "parts": [
            {"type": "file", "file": {"uri": "file:///data/report.pdf", "name": "report.pdf", "mimeType": "application/pdf"}},
            {"type": "file", "file": {"uri": "https://cdn/x.png", "mimeType": "image/png"}},
        ],
    }
    payloads = message_to_payloads(msg)
    assert len(payloads) == 2
    inputs = message_to_inputs(msg)
    assert inputs["file_ref"]["uri"].endswith("report.pdf")
    assert inputs["image_ref"]["mimeType"] == "image/png"


def test_industrial_payload():
    msg = {
        "role": "user",
        "parts": [{
            "type": "data",
            "data": {
                "content_type": CONTENT_INDUSTRIAL,
                "tag": "temperature",
                "value": 85.2,
                "unit": "C",
                "alarm": True,
                "device_id": "plc_line1",
            },
        }],
        "metadata": {"skill_id": "industrial"},
    }
    inputs = message_to_inputs(msg)
    assert inputs["industrial_event"]["tag"] == "temperature"
    assert inputs["industrial_event"]["alarm"] is True
    assert inputs["tag"] == "temperature"
    assert inputs["value"] == 85.2


def test_build_message_roundtrip():
    payload = Payload(content_type=CONTENT_INDUSTRIAL, body={"tag": "motor_speed", "value": 1500, "unit": "rpm"})
    msg = build_message_from_payload(payload, skill_id="industrial")
    inputs = message_to_inputs(msg)
    assert inputs["tag"] == "motor_speed"
    assert inputs["value"] == 1500


def test_payload_to_dict():
    p = Payload(content_type=CONTENT_TEXT, body="hi")
    assert p.to_dict()["content_type"] == CONTENT_TEXT
