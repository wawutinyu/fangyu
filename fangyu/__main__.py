"""Fangyu CLI — Run a DAG flow from command line"""
import sys, json, asyncio
from .engine.executor import run_flow

def main():
    print("Fangyu — AI Flow Canvas Engine v0.1")
    if "--help" in sys.argv:
        print("Usage: python -m fangyu [--flow flow.json]")
        return
    results = asyncio.run(run_flow())
    print(json.dumps(results, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
