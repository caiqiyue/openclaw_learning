"""Global configuration management — JSON-based persistence."""

import json
from pathlib import Path
from typing import Any

CONFIG_FILE = Path(__file__).resolve().parent / "config.json"

_DEFAULT_CONFIG: dict[str, Any] = {
    "rag_mode": False,
}


def load_config() -> dict[str, Any]:
    """Load configuration from disk, returning defaults if missing."""
    if not CONFIG_FILE.exists():
        return dict(_DEFAULT_CONFIG)
    try:
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        return {**_DEFAULT_CONFIG, **data}
    except Exception:
        return dict(_DEFAULT_CONFIG)


def save_config(config: dict[str, Any]) -> None:
    """Persist configuration to disk."""
    CONFIG_FILE.write_text(
        json.dumps(config, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def get_rag_mode() -> bool:
    """Get current RAG mode setting."""
    return bool(load_config().get("rag_mode", False))


def set_rag_mode(enabled: bool) -> None:
    """Set RAG mode on/off."""
    config = load_config()
    config["rag_mode"] = enabled
    save_config(config)
