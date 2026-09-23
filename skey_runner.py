"""
skey_runner.py

Script standalone que roda DENTRO do .venv-skey.
Recebe um caminho de MP3 (ou pasta) como argumento e retorna
a tonalidade detectada pelo S-KEY em notacao musical + Camelot.

Uso:
    .venv-skey\\Scripts\\python.exe skey_runner.py "C:\\caminho\\musica.mp3"

Retorna (stdout, JSON):
    {"ok": true, "key": "D# minor", "camelot": "2A"}
    ou
    {"ok": false, "error": "mensagem de erro"}
"""
import os
import sys
import json

# 🔧 Força UTF-8 no stdout/stderr (evita 'charmap' codec error no Windows)
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# ─────────────────────────────────────────────────────────────
# FFmpeg (necessário pro S-KEY)
# ─────────────────────────────────────────────────────────────
FFMPEG_SHARED_BIN = r"C:\ffmpeg\ffmpeg-n7.1.1-57-g1b48158a23-win64-lgpl-shared-7.1\bin"
if os.path.isdir(FFMPEG_SHARED_BIN):
    os.add_dll_directory(FFMPEG_SHARED_BIN)
    os.environ["PATH"] = FFMPEG_SHARED_BIN + os.pathsep + os.environ.get("PATH", "")


# ─────────────────────────────────────────────────────────────
# Tabela de conversão: notação musical → Camelot
# ─────────────────────────────────────────────────────────────
CAMELOT_MAP = {
    # MAJOR
    ('C', 'major'): '8B',
    ('C#', 'major'): '3B',
    ('Db', 'major'): '3B',
    ('D', 'major'): '10B',
    ('D#', 'major'): '5B',
    ('Eb', 'major'): '5B',
    ('E', 'major'): '12B',
    ('F', 'major'): '7B',
    ('F#', 'major'): '2B',
    ('Gb', 'major'): '2B',
    ('G', 'major'): '9B',
    ('G#', 'major'): '4B',
    ('Ab', 'major'): '4B',
    ('A', 'major'): '11B',
    ('A#', 'major'): '6B',
    ('Bb', 'major'): '6B',
    ('B', 'major'): '1B',
    ('Cb', 'major'): '1B',
    # MINOR
    ('C', 'minor'): '5A',
    ('C#', 'minor'): '12A',
    ('Db', 'minor'): '12A',
    ('D', 'minor'): '7A',
    ('D#', 'minor'): '2A',
    ('Eb', 'minor'): '2A',
    ('E', 'minor'): '9A',
    ('F', 'minor'): '4A',
    ('F#', 'minor'): '11A',
    ('Gb', 'minor'): '11A',
    ('G', 'minor'): '6A',
    ('G#', 'minor'): '1A',
    ('Ab', 'minor'): '1A',
    ('A', 'minor'): '8A',
    ('A#', 'minor'): '3A',
    ('Bb', 'minor'): '3A',
    ('B', 'minor'): '10A',
    ('Cb', 'minor'): '10A',
}


def parse_key(key_str: str) -> tuple:
    """
    Parseia "D# minor" em ("D#", "minor")
    """
    parts = key_str.strip().split()
    if len(parts) != 2:
        return (None, None)
    return (parts[0], parts[1].lower())


def to_camelot(key_str: str) -> str:
    """
    Converte "D# minor" em "2A"
    """
    note, mode = parse_key(key_str)
    if not note or not mode:
        return ''
    return CAMELOT_MAP.get((note, mode), '')


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Uso: skey_runner.py <caminho_mp3>"}))
        sys.exit(1)

    audio_path = sys.argv[1]

    if not os.path.exists(audio_path):
        print(json.dumps({"ok": False, "error": f"Arquivo não encontrado: {audio_path}"}))
        sys.exit(1)

    try:
        from skey import detect_key

        print(f"[key_runner] Chamando detect_key com audio_path={audio_path}", file=sys.stderr)

        # ⚠️ Não passar 'extension' quando é arquivo único (doc oficial)
        result = detect_key(
            audio_path=audio_path,
            device="cpu",
            cli=False,
        )

        print(f"[key_runner] detect_key retornou: type={type(result)}, value={result}", file=sys.stderr)

        if result is None:
            print(json.dumps({
                "ok": False,
                "error": "S-KEY retornou None (provavelmente falhou ao processar o arquivo)",
            }))
            sys.exit(1)

        if not isinstance(result, list) or len(result) == 0:
            print(json.dumps({
                "ok": False,
                "error": f"S-KEY retornou formato inesperado: {type(result)} = {result}",
            }))
            sys.exit(1)

        # Pega o primeiro resultado
        key_str = result[0]
        camelot = to_camelot(key_str)

        print(f"[key_runner] Key detectada: {key_str} → Camelot: {camelot}", file=sys.stderr)

        print(json.dumps({
            "ok": True,
            "key": key_str,
            "camelot": camelot,
        }))

    except Exception as e:
        import traceback
        print(f"[key_runner] EXCEÇÃO: {e}", file=sys.stderr)
        print(f"[key_runner] Traceback: {traceback.format_exc()}", file=sys.stderr)
        print(json.dumps({
            "ok": False,
            "error": str(e),
            "traceback": traceback.format_exc(),
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()