"""
Detecção de energia (0-10) via librosa.

Baseado em 4 features normalizadas:
- RMS (volume médio)
- Loudness (percepção)
- Spectral centroid (brilho)
- Spectral flux (variação)
"""

import numpy as np

try:
    import librosa
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False
    print("[energy_detect] AVISO: librosa não instalada. Rode: pip install librosa", flush=True)


def detect_energy(audio_path: str, sr=22050) -> float:
    """
    Calcula a energia de uma faixa (0-10).

    Args:
        audio_path: caminho do arquivo de áudio
        sr: sample rate (22050 é ok pra análise)

    Returns:
        energia (float, 0-10)
    """
    if not LIBROSA_AVAILABLE:
        return 5.0  # fallback neutro

    try:
        # Carrega o áudio (mono, sr reduzido = rápido)
        y, sr = librosa.load(audio_path, sr=sr, mono=True)

        if len(y) == 0:
            return 5.0

        # 1. RMS — volume médio (0-1)
        rms = float(librosa.feature.rms(y=y)[0].mean())

        # 2. Spectral centroid — "brilho" (Hz)
        centroid = float(librosa.feature.spectral_centroid(y=y, sr=sr)[0].mean())

        # 3. Spectral flux — quanto o espectro muda
        S = np.abs(librosa.stft(y))
        flux = float(np.mean(np.sqrt(np.sum(np.diff(S, axis=1) ** 2, axis=0))))

        # 4. Zero crossing rate — percussividade
        zcr = float(librosa.feature.zero_crossing_rate(y)[0].mean())

        # Normalização (empírica — ajustar depois com dados reais)
        rms_norm = min(rms / 0.15, 1.0)          # RMS típico: 0.05-0.15
        centroid_norm = min(centroid / 3500.0, 1.0)  # 1kHz-3.5kHz
        flux_norm = min(flux / 50.0, 1.0)
        zcr_norm = min(zcr / 0.15, 1.0)

        # Fórmula (pesos empíricos)
        energy_0_1 = (
            0.45 * rms_norm +
            0.25 * centroid_norm +
            0.20 * flux_norm +
            0.10 * zcr_norm
        )

        # Converte pra 0-10
        energy = round(energy_0_1 * 10, 2)

        # Clamp 0-10
        return max(0.0, min(10.0, energy))

    except Exception as e:
        print(f"[energy_detect] Erro em {audio_path}: {e}", flush=True)
        return 5.0


# Teste rápido (só roda se executar direto o arquivo)
if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        print(f"Energia: {detect_energy(sys.argv[1])}/10")
    else:
        print("Uso: python energy_detect.py <arquivo.mp3>")