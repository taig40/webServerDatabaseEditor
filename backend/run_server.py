#!/usr/bin/env python3
"""
run_server.py — Entrypoint para PyInstaller e execução do servidor embutido.
"""

import os
import argparse
import uvicorn
from app.main import app

def main():
    parser = argparse.ArgumentParser(description="rAthena Web Editor Standalone Backend Server")
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"), help="Host para vincular o servidor")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")), help="Porta TCP do servidor")
    args = parser.parse_args()

    print(f"[*] rAthena SDE Standalone Backend iniciando em http://{args.host}:{args.port}")
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level="info"
    )

if __name__ == "__main__":
    main()
