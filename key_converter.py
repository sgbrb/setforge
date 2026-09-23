"""
key_converter.py

Tabela de conversão: notação musical → Camelot.
Usado pelo analyzer_service.py pra converter o que o S-KEY retorna.
"""

# MAJOR e MINOR, com enharmônicos
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


def to_camelot(key_str: str) -> str:
    """
    Converte "D# minor" → "2A"
    Retorna '' se não conseguir converter.
    """
    if not key_str:
        return ''
    parts = key_str.strip().split()
    if len(parts) != 2:
        return ''
    note, mode = parts[0], parts[1].lower()
    return CAMELOT_MAP.get((note, mode), '')