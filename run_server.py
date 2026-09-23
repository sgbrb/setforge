"""
run_server.py

⚠️ SEMPRE USE ESSE ARQUIVO PARA SUBIR O BACKEND ⚠️

Usa FLASK (síncrono, sem asyncio). O asyncio trava no Windows 11
build 22631 — nenhum framework baseado nele funciona.

Uso:
    .venv\\Scripts\\activate
    python run_server.py
"""
import os

# 🔑 Variáveis de ambiente ANTES de qualquer import
os.environ["TORCHAUDIO_USE_BACKEND"] = "soundfile"
os.environ["HF_HUB_DISABLE_SYMLINKS"] = "1"
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
os.environ["HF_HUB_DISABLE_XET"] = "1"

print("[run_server] Iniciando Flask...", flush=True)

from app import app

if __name__ == "__main__":
    print("[run_server] Rodando app.run()...", flush=True)
    app.run(
        host="127.0.0.1",
        port=8000,
        threaded=True,
        debug=False,
        use_reloader=False,  # desabilita o reloader (que é instável no Windows)
    )