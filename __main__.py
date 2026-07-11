"""Fangyu CLI — Run a DAG flow or start the API server"""
import sys, json, asyncio, os


def main():
    if "--run-bundle" in sys.argv:
        idx = sys.argv.index("--run-bundle")
        if idx + 1 >= len(sys.argv):
            print("Usage: python -m fangyu --run-bundle <bundle_dir> [--host 127.0.0.1] [--port 9001]")
            sys.exit(1)
        bundle_path = sys.argv[idx + 1]
        host = os.getenv("BUNDLE_HOST", "127.0.0.1")
        port = int(os.getenv("BUNDLE_PORT", "9001"))
        args = sys.argv[idx + 2:]
        for i, a in enumerate(args):
            if a == "--host" and i + 1 < len(args):
                host = args[i + 1]
            elif a == "--port" and i + 1 < len(args):
                port = int(args[i + 1])
        from .engine.executor import register_executors
        register_executors()
        from .engine.bundle_runtime import run_bundle_server
        run_bundle_server(bundle_path, host=host, port=port)
        return
    if "--server" in sys.argv or "-s" in sys.argv:
        import uvicorn
        from .server import app
        port = int(os.getenv("PORT", "8000"))
        host = os.getenv("HOST", "0.0.0.0")
        print(f"Fangyu server → http://{host}:{port}")
        uvicorn.run(app, host=host, port=port)
        return
    from .engine.scheduler import run_flow
    print("Fangyu — AI Flow Canvas Engine v0.1")
    if "--help" in sys.argv or "-h" in sys.argv:
        print("Usage: python -m fangyu [--server] [--run-bundle <dir>] [--flow flow.json] [--input key=val ...]")
        return
    flow_path = None
    external_inputs = {}
    args = sys.argv[1:]
    for i, a in enumerate(args):
        if a == "--flow" and i + 1 < len(args):
            flow_path = args[i + 1]
        elif a.startswith("--input="):
            kv = a.split("=", 2)
            if len(kv) >= 3:
                external_inputs[kv[1]] = kv[2]
        elif "=" in a and not a.startswith("-"):
            external_inputs[a.split("=", 1)[0]] = a.split("=", 1)[1]
    if flow_path and os.path.isfile(flow_path):
        with open(flow_path, encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = {"nodes": [], "edges": [], "external_inputs": external_inputs}
    results = asyncio.run(run_flow(data.get("nodes", []), data.get("edges", []), external_inputs=data.get("external_inputs", external_inputs)))
    print(json.dumps(results, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
