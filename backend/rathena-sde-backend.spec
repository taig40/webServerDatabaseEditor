# -*- mode: python ; coding: utf-8 -*-
"""
rathena-sde-backend.spec — PyInstaller Spec File para o rAthena Web Editor Backend.
Garante inclusão de todas as dependências nativas (ruamel.yaml, uvicorn, pydantic) no executável.
"""

import os
from PyInstaller.utils.hooks import collect_submodules

block_cipher = None

hidden_imports = [
    'uvicorn',
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'fastapi',
    'starlette',
    'starlette.middleware.cors',
    'ruamel.yaml',
    'ruamel.yaml.clib',
    'pydantic',
    'pydantic_core',
    'PIL',
    'dotenv',
    'multipart',
]

hidden_imports += collect_submodules('app')

datas = []
env_template_path = os.path.join(SPECPATH, '.env-template')
if os.path.exists(env_template_path):
    datas.append((env_template_path, '.'))

a = Analysis(
    ['run_server.py'],
    pathex=[SPECPATH],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='rathena-sde-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
