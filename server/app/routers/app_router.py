import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

from app.utils.workflow_helper import (
    calculate_dynamic_cost_helper,
)

router = APIRouter()
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
ALLOWED_MEDIA_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
    "video/mp4",
    "video/webm",
    "audio/mpeg",
    "audio/wav",
    "audio/webm",
}
MEDIA_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/webm": ".webm",
}


@router.post("/upload")
async def upload_file(request: Request, filename: str = "upload"):
    media_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
    if media_type not in ALLOWED_MEDIA_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported media type")

    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is larger than 50 MB")

    content = await request.body()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is larger than 50 MB")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{MEDIA_EXTENSIONS[media_type]}"
    (UPLOAD_DIR / stored_name).write_bytes(content)
    return {"url": f"/api/uploads/{stored_name}"}


@router.post("/calculate_dynamic_cost")
async def calculate_dynamic_cost(payload: dict):
    try:
        return await calculate_dynamic_cost_helper(payload)
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=400, detail=str(e))
