import json, urllib.request, sys, time

BASE = "http://localhost:8000"
passed = 0
failed = 0

def test(name, fn):
    global passed, failed
    try:
        fn()
        passed += 1
        print(f"  OK {name}")
    except Exception as e:
        failed += 1
        print(f"  FAIL {name}: {e}")

def api(path, data=None, method="POST", timeout=30):
    url = f"{BASE}{path}"
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method=method)
    else:
        req = urllib.request.Request(url, method=method)
    resp = urllib.request.urlopen(req, timeout=timeout)
    return json.loads(resp.read())

def run_flow(nodes, edges, inputs=None, vars_=None):
    return api("/api/v1/flow/run", {
        "nodes": nodes, "edges": edges,
        "external_inputs": inputs or {},
        "global_vars": vars_ or {"flow_id": "test_suite"}
    })

# ===== 1. Composite sub-graph =====
def test_composite():
    r = run_flow(nodes=[
        {"id":"n0","data":{"originType":"start","config":{}}},
        {"id":"n1","data":{"originType":"composite","config":{},"mappings":{},
            "inner_nodes":[
                {"id":"c0","originType":"start","config":{},"mappings":{}},
                {"id":"c1","originType":"llm","config":{"model":"deepseek-v4-flash","system_prompt":"say hello from inner","auto_inject_memory":False},"mappings":{}},
            ],
            "inner_links":[{"sourceNodeId":"c0","targetNodeId":"c1","linkType":"serial","mappings":{}}],
        }},
    ], edges=[{"id":"e0","source":"n0","target":"n1","data":{}}], inputs={"query":"hi"})
    assert r.get("success"), str(r)
    comp = next(x for x in r["results"] if x["type"]=="composite")
    inner = comp["outputs"].get("outputs",{})
    assert "c1" in inner, f"c1 missing: {inner}"
    assert len(inner["c1"].get("result","")) > 0

def test_composite_empty():
    r = run_flow(nodes=[
        {"id":"n0","data":{"originType":"start","config":{}}},
        {"id":"n1","data":{"originType":"composite","config":{}}},
    ], edges=[{"id":"e0","source":"n0","target":"n1","data":{}}])
    assert r.get("success")
    comp = next(x for x in r["results"] if x["type"]=="composite")
    assert comp["outputs"].get("success") == True

# ===== 2. Loop =====
def test_loop_simple():
    r = run_flow(nodes=[
        {"id":"n0","data":{"originType":"start","config":{}}},
        {"id":"n1","data":{"originType":"loop","config":{"loop_var":"item","max_iterations":3}}},
    ], edges=[{"id":"e0","source":"n0","target":"n1","data":{}}], inputs={"array":[10,20,30]})
    assert r.get("success")
    out = next(x for x in r["results"] if x["type"]=="loop")["outputs"]["result"]
    assert len(out)==3 and out[0]["item"]==10 and out[2]["item"]==30

def test_loop_body():
    r = run_flow(nodes=[
        {"id":"n0","data":{"originType":"start","config":{}}},
        {"id":"n1","data":{"originType":"loop","config":{"loop_var":"x","max_iterations":3},"mappings":{},
            "inner_nodes":[{"id":"b0","originType":"end","config":{},"mappings":{}}],
            "inner_links":[],
        }},
    ], edges=[{"id":"e0","source":"n0","target":"n1","data":{}}], inputs={"array":["a","b"]})
    assert r.get("success")
    out = next(x for x in r["results"] if x["type"]=="loop")["outputs"]["result"]
    assert len(out)==2
    for item in out:
        assert "body_outputs" in item

# ===== 3. Search =====
def test_search_web():
    r = run_flow(nodes=[
        {"id":"n0","data":{"originType":"start","config":{}}},
        {"id":"n1","data":{"originType":"search","config":{"top_k":2,"source":"web"}}},
    ], edges=[{"id":"e0","source":"n0","target":"n1","data":{}}], inputs={"query":"AI"})
    assert r.get("success")
    out = next(x for x in r["results"] if x["type"]=="search")["outputs"]
    assert len(out.get("results",[])) > 0

# ===== 4. Condition =====
def test_condition_bool():
    r = run_flow(nodes=[
        {"id":"n0","data":{"originType":"start","config":{}}},
        {"id":"n1","data":{"originType":"condition","config":{"expression":"input>5","branch_count":2}}},
    ], edges=[{"id":"e0","source":"n0","target":"n1","data":{}}], inputs={"input":10})
    assert r.get("success")
    out = next(x for x in r["results"] if x["type"]=="condition")["outputs"]
    assert out["branch"]=="true" and out["result"]==True

def test_condition_multi():
    r = run_flow(nodes=[
        {"id":"n0","data":{"originType":"start","config":{}}},
        {"id":"n1","data":{"originType":"condition","config":{"expression":"input%3","branch_count":3}}},
    ], edges=[{"id":"e0","source":"n0","target":"n1","data":{}}], inputs={"input":2})
    assert r.get("success")
    out = next(x for x in r["results"] if x["type"]=="condition")["outputs"]
    assert out["branch"]=="branch_2" and out["result"]==2

# ===== 5. Input/Output =====
def test_input_output():
    r = run_flow(nodes=[
        {"id":"n0","data":{"originType":"input","config":{"default_value":"fb"}}},
        {"id":"n1","data":{"originType":"output","config":{}}},
    ], edges=[{"id":"e0","source":"n0","target":"n1","data":{}}], inputs={"input":"hi"})
    assert r.get("success")
    out = next(x for x in r["results"] if x["type"]=="output")["outputs"]
    assert out["result"]=="hi"

# ===== 6. Variable-set default =====
def test_var_set_default():
    r = run_flow(nodes=[
        {"id":"n0","data":{"originType":"start","config":{}}},
        {"id":"n1","data":{"originType":"variable-set","config":{"var_name":"v","var_value":"def"}}},
    ], edges=[{"id":"e0","source":"n0","target":"n1","data":{}}], inputs={})
    assert r.get("success")
    out = next(x for x in r["results"] if x["type"]=="variable-set")["outputs"]
    msg = f"expected 'def' got {out['result']!r}"
    assert out["result"]=="def", msg

# ===== 7. Monitor =====
def test_monitor():
    resp = api("/api/v1/monitor/logs?limit=3", method="GET")
    assert "logs" in resp

# ===== Main =====
def main():
    print("="*50)
    print("Fangyu Flow - Full Test Suite")
    print("Backend:", BASE)
    print("Time:", time.strftime("%Y-%m-%d %H:%M:%S"))
    print("="*50)

    try:
        api("/api/v1/knowledge/docs", method="GET")
    except Exception as e:
        print("Backend not available:", e)
        sys.exit(1)

    tests = [
        ("Composite sub-graph", test_composite),
        ("Composite empty", test_composite_empty),
        ("Loop iterate", test_loop_simple),
        ("Loop body exec", test_loop_body),
        ("Search web", test_search_web),
        ("Condition bool", test_condition_bool),
        ("Condition multi", test_condition_multi),
        ("Input/Output", test_input_output),
        ("Var-set default", test_var_set_default),
        ("Monitor logs", test_monitor),
    ]

    for name, fn in tests:
        test(name, fn)

    print(f"Result: {passed}/{passed+failed} passed", end="")
    print(" (all OK)" if failed==0 else f" ({failed} FAILED)")

if __name__ == "__main__":
    main()
