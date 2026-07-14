import base64
import logging
import mimetypes
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import HTTPException

from app.services.aiml_models import (
    IMAGE_MODEL_IDS,
    VIDEO_MODEL_IDS,
    build_aiml_payload,
    extract_output_urls,
)

logger = logging.getLogger(__name__)
BASE_URL = "https://api.aimlapi.com"
RUNS = {}
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"


def _api_key():
    key = os.getenv("AIMLAPI_KEY")
    if not key:
        raise HTTPException(
            status_code=400,
            detail=(
                "AIMLAPI_KEY is not set. Add it to server/.env to enable AI generation."
            ),
        )
    return key


def _headers():
    return {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
    }


def _local_media_to_data_url(value):
    if not isinstance(value, str) or not value.startswith("/api/uploads/"):
        return value
    filename = Path(value).name
    path = (UPLOAD_DIR / filename).resolve()
    if path.parent != UPLOAD_DIR.resolve() or not path.is_file():
        raise HTTPException(status_code=422, detail="Uploaded media file was not found")
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{media_type};base64,{encoded}"


def _resolve_local_media(payload):
    media_fields = {
        "image_url",
        "image_urls",
        "last_frame_image",
        "tail_image_url",
        "last_image_url",
        "audio_url",
        "audio_urls",
        "video_url",
        "video_urls",
    }
    return {
        key: (
            [_local_media_to_data_url(item) for item in value]
            if key in media_fields and isinstance(value, list)
            else _local_media_to_data_url(value)
            if key in media_fields
            else value
        )
        for key, value in payload.items()
    }


def _remote_error(response):
    try:
        body = response.json()
    except ValueError:
        body = {}
    detail = body.get("detail") or body.get("message")
    error = body.get("error")
    if not detail and isinstance(error, dict):
        detail = error.get("message") or error.get("detail")
    elif not detail and isinstance(error, str):
        detail = error
    if not detail and body.get("errors"):
        detail = str(body["errors"])
    return str(detail or f"AI/ML API returned HTTP {response.status_code}")


async def _request(method, path, *, payload=None, params=None):
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.request(
                method,
                f"{BASE_URL}{path}",
                headers=_headers(),
                json=payload,
                params=params,
            )
    except httpx.RequestError as error:
        logger.error("AI/ML API request failed: %s", error)
        raise HTTPException(
            status_code=502,
            detail="Unable to contact AI/ML API. Please try again.",
        ) from error

    if response.status_code not in {200, 201, 202}:
        raise HTTPException(response.status_code, _remote_error(response))
    return response.json()


def _output_type(model_id):
    return "image_url" if model_id in IMAGE_MODEL_IDS else "video_url"


def _result(node_run_id, model_id, urls, *, error=None):
    outputs = (
        [{"type": _output_type(model_id), "value": url} for url in urls]
        if not error
        else [{"type": "error", "value": {"error": error}}]
    )
    return {
        "id": node_run_id,
        "outputs": outputs,
    }


def _store_node_run(run_id, node_id, node_run):
    current_run = RUNS.get(run_id, {"nodes": {}})
    current_nodes = current_run.get("nodes", {})
    current_history = current_nodes.get(node_id, [])
    updated_run = {
        **current_run,
        "nodes": {
            **current_nodes,
            node_id: [*current_history, node_run],
        },
    }
    globals()["RUNS"] = {**RUNS, run_id: updated_run}


def _replace_node_run(run_id, node_id, node_run_id, replacement):
    current_run = RUNS.get(run_id, {"nodes": {}})
    current_nodes = current_run.get("nodes", {})
    history = current_nodes.get(node_id, [])
    updated_history = [
        replacement if item.get("node_run_id") == node_run_id else item
        for item in history
    ]
    globals()["RUNS"] = {
        **RUNS,
        run_id: {
            **current_run,
            "nodes": {**current_nodes, node_id: updated_history},
        },
    }


async def submit_node(node_id, model_id, params, run_id=None):
    try:
        request_payload = _resolve_local_media(build_aiml_payload(model_id, params))
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    run_id = run_id or str(uuid.uuid4())
    node_run_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc).isoformat()

    if model_id in IMAGE_MODEL_IDS:
        count = (
            1
            if model_id == "flux-kontext-pro"
            else max(1, min(4, int(params.get("num_outputs", 1) or 1)))
        )
        responses = [
            await _request("POST", "/v1/images/generations", payload=request_payload)
            for _ in range(count)
        ]
        urls = list(
            dict.fromkeys(
                url for response in responses for url in extract_output_urls(response)
            )
        )
        if not urls:
            raise HTTPException(502, "AI/ML API returned no generated image URL")
        node_run = {
            "node_run_id": node_run_id,
            "status": "succeeded",
            "started_at": started_at,
            "result": _result(node_run_id, model_id, urls),
        }
    elif model_id in VIDEO_MODEL_IDS:
        response = await _request(
            "POST", "/v2/video/generations", payload=request_payload
        )
        urls = extract_output_urls(response)
        external_id = response.get("id") or response.get("generation_id")
        if not urls and not external_id:
            raise HTTPException(502, "AI/ML API returned no video generation ID")
        node_run = {
            "node_run_id": node_run_id,
            "status": "succeeded" if urls else "processing",
            "started_at": started_at,
            "external_id": external_id,
            "model_id": model_id,
            "result": _result(node_run_id, model_id, urls),
        }
    else:
        raise HTTPException(422, f"Unsupported AI/ML API model: {model_id}")

    _store_node_run(run_id, node_id, node_run)
    return {"run_id": run_id, "node_run_id": node_run_id}


async def _refresh_node_run(run_id, node_id, node_run):
    external_id = node_run.get("external_id")
    if node_run.get("status") != "processing" or not external_id:
        return node_run

    response = await _request(
        "GET",
        "/v2/video/generations",
        params={"generation_id": external_id},
    )
    status = str(response.get("status", "processing")).lower()
    if status in {"completed", "succeeded", "success"}:
        urls = extract_output_urls(response)
        if not urls:
            return node_run
        replacement = {
            **node_run,
            "status": "succeeded",
            "result": _result(node_run["node_run_id"], node_run["model_id"], urls),
        }
    elif status in {"failed", "error", "cancelled"}:
        message = (
            response.get("error") or response.get("message") or "Generation failed"
        )
        if isinstance(message, dict):
            message = message.get("message") or "Generation failed"
        replacement = {
            **node_run,
            "status": "failed",
            "result": _result(
                node_run["node_run_id"],
                node_run["model_id"],
                [],
                error=message,
            ),
        }
    else:
        replacement = node_run

    _replace_node_run(run_id, node_id, node_run["node_run_id"], replacement)
    return replacement


async def get_run_status(run_id):
    run = RUNS.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Generation run not found")

    refreshed_nodes = {}
    for node_id, history in run.get("nodes", {}).items():
        refreshed_history = []
        for node_run in history:
            refreshed_history.append(await _refresh_node_run(run_id, node_id, node_run))
        refreshed_nodes[node_id] = refreshed_history
    return {"run_id": run_id, "nodes": refreshed_nodes}


def create_run():
    run_id = str(uuid.uuid4())
    globals()["RUNS"] = {**RUNS, run_id: {"nodes": {}}}
    return run_id


def delete_node_run(node_run_id):
    updated_runs = {}
    found = False
    for run_id, run in RUNS.items():
        updated_nodes = {}
        for node_id, history in run.get("nodes", {}).items():
            updated_history = [
                item for item in history if item.get("node_run_id") != node_run_id
            ]
            found = found or len(updated_history) != len(history)
            updated_nodes[node_id] = updated_history
        updated_runs[run_id] = {**run, "nodes": updated_nodes}
    globals()["RUNS"] = updated_runs
    if not found:
        raise HTTPException(status_code=404, detail="Node run not found")
    return {"message": "Node run deleted"}
