# app.py
"""
Substitui o analyzer_service.py — usa FLASK (síncrono) em vez de FastAPI.
Elimina o asyncio, que trava no Windows 11 build 22631.
"""
import os

# 🔑 Variáveis de ambiente — ANTES de qualquer import
os.environ["TORCHAUDIO_USE_BACKEND"] = "soundfile"
os.environ["HF_HUB_DISABLE_SYMLINKS"] = "1"
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
os.environ["HF_HUB_DISABLE_XET"] = "1"

from flask import Flask, request, jsonify
from flask_cors import CORS
import tempfile
import time
import uuid
import traceback
import subprocess
import json
import threading

# 🔑 FFmpeg (só PATH — NÃO usa add_dll_directory)
FFMPEG_SHARED_BIN = r"C:\ffmpeg\ffmpeg-n7.1.1-57-g1b48158a23-win64-lgpl-shared-7.1\bin"
if os.path.isdir(FFMPEG_SHARED_BIN):
    os.environ["PATH"] = FFMPEG_SHARED_BIN + os.pathsep + os.environ.get("PATH", "")
    print(f"[startup] FFmpeg bin (PATH): {FFMPEG_SHARED_BIN}", flush=True)

# 🔑 S-KEY
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
SKEY_PYTHON = os.path.join(PROJECT_DIR, ".venv-skey", "Scripts", "python.exe")
SKEY_RUNNER = os.path.join(PROJECT_DIR, "skey_runner.py")

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "http://localhost:3000"}})

JOBS: dict = {}
JOBS_LOCK = threading.Lock()
ANALYZE_LOCK = threading.Lock()   # 🆕 serializa análises (só 1 GPU)

print("[startup] Flask app criado.", flush=True)


# ─────────────────────────────────────────────────────────────
# 🎵 DETECÇÃO DE TONALIDADE via S-KEY (subprocess SÍNCRONO)
# ─────────────────────────────────────────────────────────────

def detect_key_skey(audio_path: str) -> str:
    """Chama o S-KEY via subprocess SÍNCRONO (sem asyncio)."""
    if not os.path.isfile(SKEY_PYTHON):
        print(f"[key] .venv-skey não encontrado: {SKEY_PYTHON}", flush=True)
        return ''
    if not os.path.isfile(SKEY_RUNNER):
        print(f"[key] skey_runner.py não encontrado: {SKEY_RUNNER}", flush=True)
        return ''
    if not os.path.isfile(audio_path):
        print(f"[key] arquivo não existe: {audio_path}", flush=True)
        return ''

    try:
        print(f"[key] Rodando S-KEY em {os.path.basename(audio_path)}...", flush=True)
        t0 = time.time()

        result = subprocess.run(
            [SKEY_PYTHON, SKEY_RUNNER, audio_path],
            capture_output=True,
            text=True,
            timeout=300,  # 5 min
            encoding="utf-8",
            errors="replace",
        )

        elapsed = time.time() - t0

        if result.returncode != 0:
            print(f"[key] S-KEY retornou código {result.returncode}", flush=True)
            print(f"[key] stderr: {result.stderr[:500]}", flush=True)
            return ''

        stdout = result.stdout.strip()
        last_line = stdout.split('\n')[-1] if stdout else ''

        try:
            data = json.loads(last_line)
        except json.JSONDecodeError:
            print(f"[key] JSON inválido do S-KEY: {last_line[:300]}", flush=True)
            return ''

        if not data.get("ok"):
            print(f"[key] S-KEY erro: {data.get('error')}", flush=True)
            return ''

        key_str = data.get("key", "")
        camelot = data.get("camelot", "")
        print(f"[key] S-KEY OK em {elapsed:.1f}s: {key_str} → {camelot}", flush=True)
        return camelot

    except subprocess.TimeoutExpired:
        print(f"[key] S-KEY timeout (300s)", flush=True)
        return ''
    except Exception as e:
        print(f"[key] ERRO ao chamar S-KEY: {type(e).__name__}: {e}", flush=True)
        return ''


# ─────────────────────────────────────────────────────────────


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


def _run_analysis(job_id: str, tmp_path: str, original_name: str):
    """Roda a análise numa THREAD separada (não bloqueia o Flask)."""
    skey_path = tmp_path + ".skey.mp3"
    try:
        import shutil
        shutil.copy(tmp_path, skey_path)
    except Exception as e:
        print(f"[job {job_id}] Aviso: não copiei pro S-KEY: {e}", flush=True)
        skey_path = tmp_path

    try:
        print(f"[job {job_id}] Iniciando análise de {original_name}...", flush=True)
        with JOBS_LOCK:
            JOBS[job_id]["status"] = "processing"

        # 🆕 Lock global: só uma análise por vez.
        # Serializa o uso da GPU e evita disputa de contexto CUDA entre threads.
        with ANALYZE_LOCK:
            t0 = time.time()

            import torch
            torch.set_default_device("cuda")
            from allin1_infer import analyze
            result = analyze(
                tmp_path,
                device="cuda",
                demucs_fp16=True,
                demucs_overlap=0.25,     # 🆕 Reduzido de 0.5 → menos tempo segurando o GIL
                keep_byproducts=False,
                multiprocess=False,      # 🆕 Desligado (evita processos filhos + EADDRINUSE)
            )

            # S-KEY (síncrono) — também dentro do lock (usa GPU)
            key_camelot = ''
            if result.bpm and result.bpm >= 100:
                key_camelot = detect_key_skey(skey_path)
            else:
                print(f"[job {job_id}] BPM {result.bpm} < 100 — pulando key", flush=True)

            elapsed = time.time() - t0

        print(
            f"[job {job_id}] Concluído em {elapsed:.1f}s — "
            f"BPM {result.bpm}, {len(result.segments)} segmentos, key {key_camelot or '?'}",
            flush=True,
        )

        segments = [{
            "start": round(float(seg.start), 2),
            "end": round(float(seg.end), 2),
            "label": str(seg.label),
        } for seg in result.segments]

        with JOBS_LOCK:
            JOBS[job_id]["status"] = "done"
            JOBS[job_id]["result"] = {
                "bpm": round(float(result.bpm), 2),
                "key": key_camelot,
                "segments": segments,
            }
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[job {job_id}] ERRO: {e}\n{tb}", flush=True)
        with JOBS_LOCK:
            JOBS[job_id]["status"] = "error"
            JOBS[job_id]["error"] = str(e)
    finally:
        for p in [tmp_path, skey_path]:
            if p and os.path.exists(p):
                try:
                    os.unlink(p)
                except Exception:
                    pass


@app.route("/analyze", methods=["POST"])
def analyze_audio():
    if "file" not in request.files:
        return jsonify({"error": "Arquivo não enviado"}), 400

    file = request.files["file"]
    suffix = os.path.splitext(file.filename or ".mp3")[1] or ".mp3"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        file.save(tmp.name)
        tmp_path = tmp.name

    file_size_mb = round(os.path.getsize(tmp_path) / 1024 / 1024, 2)

    job_id = str(uuid.uuid4())
    with JOBS_LOCK:
        JOBS[job_id] = {
            "status": "queued",
            "filename": file.filename,
            "size_mb": file_size_mb,
            "created_at": time.time(),
            "result": None,
            "error": None,
        }

    print(f"[analyze] Job {job_id} criado para {file.filename} ({file_size_mb} MB)", flush=True)

    # 🔑 Roda em THREAD separada (background)
    thread = threading.Thread(
        target=_run_analysis,
        args=(job_id, tmp_path, file.filename or "unknown.mp3"),
    )
    thread.daemon = True
    thread.start()

    return jsonify({"job_id": job_id, "status": "queued"})


@app.route("/analyze-status/<job_id>", methods=["GET"])
def analyze_status(job_id):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
    if not job:
        return jsonify({"error": "Job não encontrado"}), 404
    return jsonify({
        "job_id": job_id,
        "status": job["status"],
        "result": job["result"],
        "error": job["error"],
    })


if __name__ == "__main__":
    print("[main] Rodando Flask direto (dev)...", flush=True)
    app.run(host="127.0.0.1", port=8000, threaded=True, debug=False)