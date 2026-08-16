#!/usr/bin/env python3
"""
build_backend.py — PyInstaller build orchestrator for the rAthena Web Editor Backend.

Compiles the FastAPI backend into a standalone executable, then renames and
copies it to the Tauri sidecar binaries directory with the correct
target-triple suffix required by Tauri v2.
"""

import os
import sys
import shutil
import platform
import subprocess


def get_target_triple() -> str:
    """Determines the Rust-compatible target triple for the current platform.

    Returns:
        The target triple string (e.g. 'x86_64-pc-windows-msvc').
    """
    machine = platform.machine().lower()
    system = platform.system().lower()

    arch_map = {
        "x86_64": "x86_64",
        "amd64": "x86_64",
        "aarch64": "aarch64",
        "arm64": "aarch64",
    }
    arch = arch_map.get(machine, machine)

    if system == "windows":
        return f"{arch}-pc-windows-msvc"
    elif system == "linux":
        return f"{arch}-unknown-linux-gnu"
    elif system == "darwin":
        return f"{arch}-apple-darwin"
    else:
        return f"{arch}-unknown-{system}"


def main():
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(backend_dir)
    print(f"[*] Backend build root: {backend_dir}")

    # Ensure PyInstaller is available
    try:
        import PyInstaller
        print(f"[*] PyInstaller detected: v{PyInstaller.__version__}")
    except ImportError:
        print("[!] PyInstaller not found. Installing via pip...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

    # Run PyInstaller with the existing spec file
    spec_file = os.path.join(backend_dir, "rathena-sde-backend.spec")
    print(f"[*] Compiling backend from spec: {spec_file}")

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--clean",
        "--noconfirm",
        spec_file
    ]

    print(f"[*] Running: {' '.join(cmd)}")
    result = subprocess.run(cmd)

    if result.returncode != 0:
        print(f"\n[X] Backend compilation failed (exit code {result.returncode})")
        sys.exit(result.returncode)

    dist_dir = os.path.join(backend_dir, "dist")
    print(f"\n[+] Compilation successful! Output at: {dist_dir}")

    # Rename and copy the binary with Tauri's target-triple convention
    is_win = platform.system().lower() == "windows"
    ext = ".exe" if is_win else ""
    original_name = f"rathena-sde-backend{ext}"
    original_path = os.path.join(dist_dir, original_name)

    if not os.path.exists(original_path):
        print(f"[X] Expected binary not found: {original_path}")
        sys.exit(1)

    target_triple = get_target_triple()
    sidecar_name = f"rathena-sde-backend-{target_triple}{ext}"

    # Tauri sidecar destination: frontend/src-tauri/binaries/
    tauri_binaries_dir = os.path.join(backend_dir, "..", "frontend", "src-tauri", "binaries")
    os.makedirs(tauri_binaries_dir, exist_ok=True)

    dest_path = os.path.join(tauri_binaries_dir, sidecar_name)
    shutil.copy2(original_path, dest_path)
    print(f"[+] Sidecar binary copied to: {dest_path}")
    print(f"    Target triple: {target_triple}")
    print(f"    Binary name:   {sidecar_name}")


if __name__ == "__main__":
    main()
