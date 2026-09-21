# analyzer_service.py
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Dict
import tempfile
import os
import time
import uuid
import traceback
import shutil

# ⚠️ FFmpeg: tenta várias fontes, em ordem de prioridade
# 1. Variável de ambiente FFMPEG_BIN
# 2. ffmpeg.exe achado no PATH do sistema
# 3. Caminho hardcoded da máquina original (fallback)

def _find_ffmpeg_bin():
    # 1. Env var
    env_path = os.environ.get("FFMPEG_BIN")
    if env_path and os.path.isdir(env_path):
        return env_path, "env var FFMPEG_BIN"

    # 2. PATH do sistema
    ffmpeg_exe = shutil.which("ffmpeg")
    if ffmpeg_exe:
        return os.path.dirname(ffmpeg_exe), "PATH do sistema"

    # 3. Fallback hardcoded (máquina original)
    fallback = r"C:\Users\BGS13627\Desktop\EngComp\dlsss\ffmpeg-n7.1.1-57-g1b48158a23-win64-lgpl-shared-7.1\bin"
    if os.path.isdir(fallback):
        return fallback, "caminho hardcoded (máquina original)"

    return None, "não encontrado"

FFMPEG_BIN, FFMPEG_SOURCE = _find_ffmpeg_bin()

if FFMPEG_BIN:
    os.add_dll_directory(FFMPEG_BIN)
    print(f"[startup] FFmpeg encontrado em: {FFMPEG_BIN} ({FFMPEG_SOURCE})")
else:
    print("[AVISO] FFmpeg NÃO encontrado. Análise pode falhar.")
    print("[AVISO] Configure a variável de ambiente FFMPEG_BIN ou instale o FFmpeg no PATH.")


# 📦 Armazenamento em memória dos jobs
JOBS: Dict[str, dict] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[startup] Warmup: importando allin1_infer.analyze...")
    try:
        from allin1_infer import analyze  # noqa: F401
        print("[startup] OK. Servidor pronto.")
    except Exception as e:
        print(f"[startup] Aviso warmup: {e}")
    yield
    print("[shutdown] Encerrando analyzer_service.")


app = FastAPI(title="SetForge Audio Analyzer", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


def _run_analysis(job_id: str, tmp_path: str, original_name: str):
    """Roda em background. Atualiza JOBS[job_id] quando termina."""
    try:
        print(f"[job {job_id}] Iniciando análise de {original_name}...")
        JOBS[job_id]["status"] = "processing"
        t0 = time.time()

        from allin1_infer import analyze
        result = analyze(tmp_path)

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
    """
    Recebe o arquivo, cria um job e retorna IMEDIATAMENTE com o job_id.
    O processamento acontece em background. O cliente consulta /analyze-status/{job_id}.
    """
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
    """Consulta o status de um job. O frontend faz polling nesse endpoint."""
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")

    return {
        "job_id": job_id,
        "status": job["status"],
        "result": job["result"],
        "error": job["error"],
    }