# analyzer_service.py
import os

# 🔑 Variáveis de ambiente — ANTES de qualquer import
os.environ["TORCHAUDIO_USE_BACKEND"] = "soundfile"
os.environ["HF_HUB_DISABLE_SYMLINKS"] = "1"
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
os.environ["HF_HUB_DISABLE_XET"] = "1"

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict
import tempfile
import time
import uuid
import traceback

# 🔑 FFmpeg 7 shared
FFMPEG_SHARED_BIN = r"C:\ffmpeg\ffmpeg-n7.1.1-57-g1b48158a23-win64-lgpl-shared-7.1\bin"

if os.path.isdir(FFMPEG_SHARED_BIN):
    os.add_dll_directory(FFMPEG_SHARED_BIN)
    os.environ["PATH"] = FFMPEG_SHARED_BIN + os.pathsep + os.environ.get("PATH", "")
    print(f"[startup] FFmpeg bin: {FFMPEG_SHARED_BIN}")
else:
    print(f"[AVISO] FFmpeg shared não encontrado em: {FFMPEG_SHARED_BIN}")

# 🚀 App SEM lifespan (evita travamento no startup)
app = FastAPI(title="SetForge Audio Analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

JOBS: Dict[str, dict] = {}


@app.get("/health")
async def health():
    return {"status": "ok"}


def _run_analysis(job_id: str, tmp_path: str, original_name: str):
    try:
        print(f"[job {job_id}] Iniciando análise de {original_name}...")
        JOBS[job_id]["status"] = "processing"
        t0 = time.time()

        import torch
        torch.set_default_device("cuda")

        from allin1_infer import analyze
        result = analyze(
    tmp_path,
    device="cuda",
    demucs_fp16=True,
    demucs_overlap=0.1,
)

        elapsed = time.time() - t0
        print(f"[job {job_id}] Concluído em {elapsed:.1f}s — BPM {result.bpm}, {len(result.segments)} segmentos")

        segments = []
        for seg in result.segments:
            segments.append({
                "start": round(float(seg.start), 2),
                "end": round(float(seg.end), 2),
                "label": str(seg.label),
            })

        JOBS[job_id]["status"] = "done"
        JOBS[job_id]["result"] = {
            "bpm": round(float(result.bpm), 2),
            "segments": segments,
        }
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[job {job_id}] ERRO: {e}\n{tb}")
        JOBS[job_id]["status"] = "error"
        JOBS[job_id]["error"] = str(e)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


@app.post("/analyze")
async def analyze_audio(
    background: BackgroundTasks,
    file: UploadFile = File(...),
):
    suffix = os.path.splitext(file.filename or ".mp3")[1] or ".mp3"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    job_id = str(uuid.uuid4())
    JOBS[job_id] = {
        "status": "queued",
        "filename": file.filename,
        "size_mb": round(len(content) / 1024 / 1024, 2),
        "created_at": time.time(),
        "result": None,
        "error": None,
    }

    print(f"[analyze] Job {job_id} criado para {file.filename} ({JOBS[job_id]['size_mb']} MB)")
    background.add_task(_run_analysis, job_id, tmp_path, file.filename or "unknown.mp3")

    return {"job_id": job_id, "status": "queued"}


@app.get("/analyze-status/{job_id}")
async def analyze_status(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    return {
        "job_id": job_id,
        "status": job["status"],
        "result": job["result"],
        "error": job["error"],
    }