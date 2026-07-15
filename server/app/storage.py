import os
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent.parent


def get_data_dir() -> Path:
    configured_dir = os.getenv("WORKFLOW_DATA_DIR")
    if configured_dir:
        return Path(configured_dir).expanduser().resolve()
    return SERVER_DIR


def get_upload_dir() -> Path:
    return get_data_dir() / "uploads"
