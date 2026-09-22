# analyzer_service.py
import os

# 🔑 Variáveis de ambiente — ANTES de qualquer import
os.environ["TORCHAUDIO_USE_BACKEND"] = "soundfile"
os.environ["HF_HUB_DISABLE_SYMLINKS"] = "1"
...

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
    print(f"[startup] FFmpeg bin: {FFMPEG_SHARED_BIN}", flush=True)
else:
    print(f"[AVISO] FFmpeg shared não encontrado em: {FFMPEG_SHARED_BIN}", flush=True)

app = FastAPI(title="SetForge Audio Analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

print("[startup] FastAPI app criado. Aguardando Uvicorn...", flush=True)

JOBS: Dict[str, dict] = {}


# ─────────────────────────────────────────────────────────────
# 🎵 DETECÇÃO DE TONALIDADE (Camelot) via Librosa
# ─────────────────────────────────────────────────────────────

# Mapa: (nota, é_maior) → Camelot
CAMELOT_MAP = {
    ('C',  True):  '8B', ('C',  False): '5A',
    ('C#', True):  '3B', ('C#', False): '12A',
    ('D',  True):  '10B', ('D',  False): '7A',
    ('D#', True):  '5B', ('D#', False): '2A',
    ('E',  True):  '12B', ('E',  False): '9A',
    ('F',  True):  '7B', ('F',  False): '4A',
    ('F#', True):  '2B', ('F#', False): '11A',
    ('G',  True):  '9B', ('G',  False): '6A',
    ('G#', True):  '4B', ('G#', False): '1A',
    ('A',  True):  '11B', ('A',  False): '8A',
    ('A#', True):  '6B', ('A#', False): '3A',
    ('B',  True):  '1B', ('B',  False): '10A',
}

# Perfis de Krumhansl-Schmuckler (pesos por pitch class)
MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

PITCHES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def _correlate(profile: list, chroma: list) -> float:
    """Correlação de Pearson entre dois vetores."""
    n = len(profile)
    mean_p = sum(profile) / n
    mean_c = sum(chroma) / n

    num = sum((profile[i] - mean_p) * (chroma[i] - mean_c) for i in range(n))
    den_p = sum((profile[i] - mean_p) ** 2 for i in range(n)) ** 0.5
    den_c = sum((chroma[i] - mean_c) ** 2 for i in range(n)) ** 0.5

    if den_p == 0 or den_c == 0:
        return 0.0
    return num / (den_p * den_c)


def detect_key(audio_path: str) -> str:
    """
    Detecta tonalidade via Librosa + Krumhansl-Schmuckler.
    Retorna string Camelot (ex: '8A') ou '' se falhar.
    """
    try:
        import librosa
        import numpy as np

        y, sr = librosa.load(audio_path, sr=22050, mono=True, duration=90)

        if len(y) < sr * 5:
            return ''

        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_sum = np.sum(chroma, axis=1)
        chroma_norm = (chroma_sum / np.max(chroma_sum)).tolist()

        best_score = -2.0
        best_key = ('C', True)

        for i in range(12):
            rotated = chroma_norm[i:] + chroma_norm[:i]
            score_major = _correlate(MAJOR_PROFILE, rotated)
            score_minor = _correlate(MINOR_PROFILE, rotated)

            if score_major > best_score:
                best_score = score_major
                best_key = (PITCHES[i], True)

            if score_minor > best_score:
                best_score = score_minor
                best_key = (PITCHES[i], False)

        camelot = CAMELOT_MAP.get(best_key, '')
        print(f"[key] {os.path.basename(audio_path)} → {best_key[0]} {'maior' if best_key[1] else 'menor'} = {camelot} (score {best_score:.3f})", flush=True)
        return camelot

    except Exception as e:
        print(f"[key] ERRO ao detectar tonalidade: {e}", flush=True)
        return ''


# ─────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    return {"status": "ok"}


def _run_analysis(job_id: str, tmp_path: str, original_name: str):
    try:
        print(f"[job {job_id}] Iniciando análise de {original_name}...", flush=True)
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

        key_camelot = detect_key(tmp_path)

        elapsed = time.time() - t0
        print(f"[job {job_id}] Concluído em {elapsed:.1f}s — BPM {result.bpm}, {len(result.segments)} segmentos, key {key_camelot or '?'}", flush=True)

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
            "key": key_camelot,
            "segments": segments,
        }
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[job {job_id}] ERRO: {e}\n{tb}", flush=True)
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

    print(f"[analyze] Job {job_id} criado para {file.filename} ({JOBS[job_id]['size_mb']} MB)", flush=True)
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