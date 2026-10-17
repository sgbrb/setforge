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
    print("[energy_detect] AVISO: librosa não instalada.", flush=True)


def detect_energy(audio_path: str, sr=22050) -> float:
    """
    Calcula a energia de uma faixa (0-10).
    """
    if not LIBROSA_AVAILABLE:
        return 5.0

    try:
        y, sr = librosa.load(audio_path, sr=sr, mono=True)

        if len(y) == 0:
            return 5.0

        # 1. RMS — volume médio
        rms = float(librosa.feature.rms(y=y)[0].mean())

        # 2. Spectral centroid — "brilho" (Hz)
        centroid = float(librosa.feature.spectral_centroid(y=y, sr=sr)[0].mean())

        # 3. Spectral flux — quanto o espectro muda
        S = np.abs(librosa.stft(y))
        flux = float(np.mean(np.sqrt(np.sum(np.diff(S, axis=1) ** 2, axis=0))))

        # 4. Zero crossing rate — percussividade
        zcr = float(librosa.feature.zero_crossing_rate(y)[0].mean())

        # print(f"[DEBUG] rms={rms:.4f} centroid={centroid:.1f} flux={flux:.2f} zcr={zcr:.4f}")

        rms_norm = min(rms / 0.25, 1.0)          # volta pra 0.25 (não importa muito)
        centroid_norm = min(centroid / 4000.0, 1.0)  # calibra pro range real (750-3790)
        flux_norm = min(flux / 120.0, 1.0)       # calibra pro range real (55-88)
        zcr_norm = min(zcr / 0.20, 1.0)          # calibra pro range real (0.03-0.19)

        # Fórmula (pesos empíricos)
        energy_0_1 = (
        0.05 * rms_norm +
        0.35 * centroid_norm +
        0.10 * flux_norm +
        0.50 * zcr_norm
        )

        energy = round(energy_0_1 * 10, 2)
        return max(0.0, min(10.0, energy))

    except Exception as e:
        print(f"[energy_detect] Erro em {audio_path}: {e}", flush=True)
        return 5.0


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        print(f"Energia: {detect_energy(sys.argv[1])}/10")
    else:
        print("Uso: python energy_detect.py <arquivo.mp3>")