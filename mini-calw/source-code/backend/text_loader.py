"""Utilities for loading text files with encoding fallbacks."""

from pathlib import Path

PRIMARY_ENCODINGS = ("utf-8", "utf-8-sig")
FALLBACK_ENCODINGS = ("gb18030", "cp936")


def read_text_file(path: Path) -> str:
    """Read a text file and recover from legacy or mixed Windows encodings."""
    raw = path.read_bytes()

    for encoding in PRIMARY_ENCODINGS:
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue

    decoded_lines: list[str] = []
    for raw_line in raw.splitlines(keepends=True):
        for encoding in (*PRIMARY_ENCODINGS, *FALLBACK_ENCODINGS):
            try:
                decoded_lines.append(raw_line.decode(encoding))
                break
            except UnicodeDecodeError:
                continue
        else:
            decoded_lines.append(raw_line.decode("utf-8", errors="replace"))

    return "".join(decoded_lines)
