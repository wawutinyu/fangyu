"""Flow 画布全局提示词注入"""
from fangyu.engine.flow_prompts import inject_canvas_prompts


def test_inject_canvas_prompts():
    gv = inject_canvas_prompts({
        "globalPrompts": {
            "system_prompt": "你是助手",
            "user_prompt_template": "{{input}}",
            "context": "背景信息",
        },
    })
    assert gv["_global_system_prompt"] == "你是助手"
    assert gv["_global_user_template"] == "{{input}}"
    assert gv["_global_context"] == "背景信息"


def test_inject_canvas_prompts_skips_when_missing():
    gv = inject_canvas_prompts({"foo": "bar"})
    assert "_global_system_prompt" not in gv
