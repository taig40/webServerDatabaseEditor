#!/usr/bin/env python3
"""
build_backend.py — Orquestrador de compilação PyInstaller para o Backend rAthena Web Editor.
Gera o executável standalone rathena-sde-backend com todas as dependências nativas inclusas.
"""

import os
import sys
import subprocess

def main():
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(backend_dir)
    print(f"[*] Diretório raiz de compilação do Backend: {backend_dir}")

    try:
        import PyInstaller
        print(f"[*] PyInstaller detectado: v{PyInstaller.__version__}")
    except ImportError:
        print("[!] PyInstaller não encontrado. Instalando via pip...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

    spec_file = os.path.join(backend_dir, "rathena-sde-backend.spec")
    print(f"[*] Compilando backend a partir de: {spec_file}")

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--clean",
        "--noconfirm",
        spec_file
    ]

    print(f"[*] Executando comando: {' '.join(cmd)}")
    result = subprocess.run(cmd)

    if result.returncode == 0:
        dist_dir = os.path.join(backend_dir, "dist")
        print(f"\n[+] Compilação bem-sucedida! Executável gerado na pasta: {dist_dir}")
    else:
        print(f"\n[X] Falha na compilação do Backend (código de retorno {result.returncode})")
        sys.exit(result.returncode)

if __name__ == "__main__":
    main()
