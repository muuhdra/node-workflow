import os
import json
import uuid
import httpx
import logging
from datetime import datetime, timezone
from fastapi import HTTPException
from typing import Optional
from sqlalchemy import select, delete

from pathlib import Path
from app.database import AsyncSessionLocal
from app.models import Workflow

BASE_DIR = Path(__file__).resolve().parent.parent.parent
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MU_API_KEY = os.getenv("MU_API_KEY")


# ---------------------------------------------------------------------------
# Helper: API key (required only for AI execution calls)
# ---------------------------------------------------------------------------

async def get_api_key():
    api_key = os.getenv("MU_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="MU_API_KEY is not set. Add it to your .env file to enable AI generation."
        )
    return api_key


# ---------------------------------------------------------------------------
# Helper: proxy to muapi.ai (for AI execution endpoints only)
# ---------------------------------------------------------------------------

async def proxy_request_helper(method: str, url: str, payload: Optional[dict] = None):
    api_key = await get_api_key()
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
    }

    async with httpx.AsyncClient() as client:
        try:
            if method.upper() == "GET":
                response = await client.get(url, headers=headers, timeout=60.0)
            elif method.upper() == "POST":
                response = await client.post(url, json=payload, headers=headers, timeout=60.0)
            elif method.upper() == "DELETE":
                response = await client.delete(url, headers=headers, timeout=60.0)
            else:
                raise HTTPException(status_code=405, detail=f"Method {method} not supported in proxy")

        except httpx.RequestError as e:
            logger.error(f"HTTPx Request Error for {method} {url}: {e}")
            raise HTTPException(status_code=500, detail=f"Error contacting remote server: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error in proxy_request_helper for {method} {url}: {e}")
            raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

    try:
        if response.content:
            resp_json = response.json()
        else:
            resp_json = {}
    except ValueError:
        resp_json = {"detail": response.text or "Unknown error from remote server"}

    if response.status_code == 200:
        return resp_json
    else:
        error_detail = resp_json.get("detail", "Something went wrong")
        logger.warning(f"Remote server returned {response.status_code}: {error_detail}")
        raise HTTPException(status_code=response.status_code, detail=error_detail)


# ---------------------------------------------------------------------------
# Helper: serialize a Workflow ORM object to dict
# ---------------------------------------------------------------------------

def _workflow_to_dict(w: Workflow) -> dict:
    return {
        "id": w.id,
        "workflow_id": w.id,
        "name": w.name,
        "edges": json.loads(w.edges) if w.edges else [],
        "data": json.loads(w.data) if w.data else {"nodes": []},
        "run_history": {},
        "run_id": None,
        "is_owner": True,
        "is_published": False,
        "is_template": False,
        "show_temp_button": False,
        "category": w.category,
        "thumbnail": w.thumbnail,
        "created_at": w.created_at.isoformat() if w.created_at else None,
        "updated_at": w.updated_at.isoformat() if w.updated_at else None,
    }


# ---------------------------------------------------------------------------
# LOCAL CRUD — No API key required
# ---------------------------------------------------------------------------

async def create_or_update_workflow(payload: dict):
    """Create a new workflow or update an existing one — stored locally in SQLite."""
    workflow_id = payload.get("workflow_id")

    async with AsyncSessionLocal() as session:
        if workflow_id:
            # Update existing workflow
            result = await session.execute(select(Workflow).where(Workflow.id == workflow_id))
            workflow = result.scalar_one_or_none()
            if not workflow:
                raise HTTPException(status_code=404, detail="Workflow not found")

            if "name" in payload:
                workflow.name = payload["name"]
            if "edges" in payload:
                workflow.edges = json.dumps(payload["edges"])
            if "data" in payload:
                workflow.data = json.dumps(payload["data"])
            workflow.updated_at = datetime.now(timezone.utc)
        else:
            # Create new workflow
            workflow = Workflow(
                id=str(uuid.uuid4()),
                name=payload.get("name", "Untitled Workflow"),
                edges=json.dumps(payload.get("edges", [])),
                data=json.dumps(payload.get("data", {"nodes": []})),
            )
            session.add(workflow)

        await session.commit()
        await session.refresh(workflow)
        return _workflow_to_dict(workflow)


async def get_workflow_defs_helper():
    """List all workflows from local SQLite."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Workflow).order_by(Workflow.updated_at.desc()))
        workflows = result.scalars().all()
        return [_workflow_to_dict(w) for w in workflows]


async def get_workflow_def_helper(workflow_id: str):
    """Get a single workflow by ID from local SQLite."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Workflow).where(Workflow.id == workflow_id))
        workflow = result.scalar_one_or_none()
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        return _workflow_to_dict(workflow)


async def delete_workflow_def_by_id(workflow_id: str):
    """Delete a workflow from local SQLite."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Workflow).where(Workflow.id == workflow_id))
        workflow = result.scalar_one_or_none()
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        await session.execute(delete(Workflow).where(Workflow.id == workflow_id))
        await session.commit()
        return {"message": "Workflow deleted successfully"}


async def update_workflow_name_helper(workflow_id: str, payload: dict):
    """Rename a workflow in local SQLite."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Workflow).where(Workflow.id == workflow_id))
        workflow = result.scalar_one_or_none()
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        workflow.name = payload.get("name", workflow.name)
        workflow.updated_at = datetime.now(timezone.utc)
        await session.commit()
        return {"message": "Workflow renamed successfully"}


async def update_workflow_category_helper(workflow_id: str, payload: dict):
    """Update workflow category in local SQLite."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Workflow).where(Workflow.id == workflow_id))
        workflow = result.scalar_one_or_none()
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        workflow.category = payload.get("category", workflow.category)
        workflow.updated_at = datetime.now(timezone.utc)
        await session.commit()
        return {"message": "Category updated successfully"}


async def generate_thumbnail_helper(workflow_id: str, payload: dict):
    """Store a thumbnail URL for a workflow in local SQLite."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Workflow).where(Workflow.id == workflow_id))
        workflow = result.scalar_one_or_none()
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        workflow.thumbnail = payload.get("thumbnail_url", workflow.thumbnail)
        workflow.updated_at = datetime.now(timezone.utc)
        await session.commit()
        return {"message": "Thumbnail updated successfully"}


async def get_workflow_last_run(workflow_id: str):
    """Returns empty — run history is not stored locally."""
    return {}


# ---------------------------------------------------------------------------
# REMOTE AI EXECUTION — API key required
# ---------------------------------------------------------------------------

async def get_node_schemas_helper(workflow_id: str):
    url = f"https://api.muapi.ai/workflow/{workflow_id}/node-schemas"
    return await proxy_request_helper("GET", url)


async def get_api_node_schemas_helper(workflow_id: str):
    url = f"https://api.muapi.ai/workflow/{workflow_id}/api-node-schemas"
    return await proxy_request_helper("GET", url)


async def run_workflow_helper(workflow_id: str, payload: dict):
    url = f"https://api.muapi.ai/workflow/{workflow_id}/run"
    return await proxy_request_helper("POST", url, payload)


async def get_run_status_helper(run_id: str):
    url = f"https://api.muapi.ai/workflow/run/{run_id}/status"
    return await proxy_request_helper("GET", url)


async def run_node_helper(workflow_id: str, node_id: str, payload: dict):
    url = f"https://api.muapi.ai/workflow/{workflow_id}/node/{node_id}/run"
    return await proxy_request_helper("POST", url, payload)


async def publish_workflow_helper(workflow_id: str, payload: dict):
    url = f"https://api.muapi.ai/workflow/workflow/{workflow_id}/publish"
    return await proxy_request_helper("POST", url, payload)


async def template_workflow_helper(workflow_id: str, payload: dict):
    url = f"https://api.muapi.ai/workflow/workflow/{workflow_id}/template"
    return await proxy_request_helper("POST", url, payload)


async def cloudfront_signed_url_helper(payload: dict):
    url = "https://api.muapi.ai/workflow/cloudfront-signed-url"
    return await proxy_request_helper("POST", url, payload)


async def get_file_upload_url_helper(params: dict):
    import urllib.parse
    query_string = urllib.parse.urlencode(params)
    url = f"https://api.muapi.ai/app/get_file_upload_url?{query_string}"
    return await proxy_request_helper("GET", url)


async def architect_workflow_helper(payload: dict):
    url = "https://api.muapi.ai/workflow/architect"
    return await proxy_request_helper("POST", url, payload)


async def poll_architect_result_helper(id: str):
    url = f"https://api.muapi.ai/workflow/poll-architect/{id}/result"
    return await proxy_request_helper("GET", url)


async def delete_node_run_by_id_helper(node_run_id: str):
    url = f"https://api.muapi.ai/workflow/node-run/{node_run_id}"
    return await proxy_request_helper("DELETE", url)


async def get_workflow_api_inputs_helper(workflow_id: str):
    url = f"https://api.muapi.ai/workflow/{workflow_id}/api-inputs"
    return await proxy_request_helper("GET", url)


async def execute_workflow_via_api_helper(workflow_id: str, payload: dict):
    url = f"https://api.muapi.ai/workflow/{workflow_id}/api-execute"
    return await proxy_request_helper("POST", url, payload)


async def get_workflow_api_outputs_helper(run_id: str):
    url = f"https://api.muapi.ai/workflow/run/{run_id}/api-outputs"
    return await proxy_request_helper("GET", url)
