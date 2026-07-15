import json
import logging
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import delete, select

from app.database import AsyncSessionLocal
from app.models import Workflow
from app.services.aiml_client import (
    delete_node_run,
    get_run_status,
    submit_node,
)
from app.services.aiml_models import calculate_generation_cost, get_node_schemas
from app.services.connector_contract import validate_connector_contract
from app.services.run_repository import delete_workflow_runs, get_latest_run

BASE_DIR = Path(__file__).resolve().parent.parent.parent
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

LIST_TARGET_HANDLES = {
    "concatInput",
    "textInput3",
    "imageInput2",
    "videoInput6",
    "videoInput7",
    "videoInput8",
    "apiInput2",
}

WORKFLOW_COVER_PATTERN = re.compile(
    r"^/api/uploads/[0-9a-f]{32}\.(?:avif|gif|jpe?g|png|webp)$",
    re.IGNORECASE,
)


def normalize_workflow_cover_url(value: object) -> str | None:
    """Accept only locally uploaded images, or None to remove a cover."""
    if value is None:
        return None
    if not isinstance(value, str) or not WORKFLOW_COVER_PATTERN.fullmatch(value):
        raise HTTPException(
            status_code=422,
            detail="Cover must be a locally uploaded image",
        )
    return value


def normalize_workflow_category(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise HTTPException(status_code=422, detail="Category must be a string")
    category = value.strip()
    if not category or len(category) > 100:
        raise HTTPException(
            status_code=422,
            detail="Category must contain 1-100 characters",
        )
    return category


def _invalid_workflow(detail: str):
    raise HTTPException(status_code=422, detail=detail)


def _is_list_target(node: dict, target_handle: str) -> bool:
    if target_handle in LIST_TARGET_HANDLES:
        return True
    if node.get("category") != "api":
        return False
    return isinstance(node.get("input_params", {}).get(target_handle), list)


def _validate_input_image_identity(node: dict, node_id: str) -> None:
    if node.get("category") != "image" or node.get("model") != "image-passthrough":
        return

    input_params = node.get("input_params", {})
    field_limits = {
        "node_label": 60,
        "node_description": 180,
    }
    for field, limit in field_limits.items():
        if field not in input_params:
            continue
        value = input_params[field]
        if not isinstance(value, str):
            _invalid_workflow(f"Node {node_id} {field} must be a string")
        if len(value) > limit:
            _invalid_workflow(
                f"Node {node_id} {field} must contain at most {limit} characters"
            )


def _validate_workflow_graph(payload: dict):
    """Reject malformed workflow graphs before they reach persistence."""
    if not isinstance(payload, dict):
        _invalid_workflow("Workflow payload must be an object")

    data = payload.get("data")
    edges = payload.get("edges")
    if not isinstance(data, dict) or not isinstance(data.get("nodes"), list):
        _invalid_workflow("Workflow data.nodes must be a list")
    if not isinstance(edges, list):
        _invalid_workflow("Workflow edges must be a list")

    node_by_id = {}
    for index, node in enumerate(data["nodes"]):
        if not isinstance(node, dict):
            _invalid_workflow(f"Node at index {index} must be an object")
        node_id = node.get("id")
        if not isinstance(node_id, str) or not node_id.strip():
            _invalid_workflow(f"Node at index {index} has an invalid id")
        if not isinstance(node.get("input_params", {}), dict):
            _invalid_workflow(f"Node {node_id} input_params must be an object")
        _validate_input_image_identity(node, node_id)
        if node_id in node_by_id:
            _invalid_workflow(f"Duplicate node id: {node_id}")
        node_by_id = {**node_by_id, node_id: node}

    edge_ids = set()
    connection_keys = set()
    scalar_targets = set()
    adjacency = {node_id: [] for node_id in node_by_id}
    indegrees = {node_id: 0 for node_id in node_by_id}

    required_fields = ("id", "source", "target", "sourceHandle", "targetHandle")
    for index, edge in enumerate(edges):
        if not isinstance(edge, dict):
            _invalid_workflow(f"Edge at index {index} must be an object")
        for field in required_fields:
            value = edge.get(field)
            if not isinstance(value, str) or not value.strip():
                _invalid_workflow(f"Edge at index {index} has an invalid {field}")

        edge_id = edge["id"]
        source = edge["source"]
        target = edge["target"]
        source_handle = edge["sourceHandle"]
        target_handle = edge["targetHandle"]

        if edge_id in edge_ids:
            _invalid_workflow(f"Duplicate edge id: {edge_id}")
        edge_ids = {*edge_ids, edge_id}

        if source not in node_by_id:
            _invalid_workflow(
                f"Edge {edge_id} references an unknown source node: {source}"
            )
        if target not in node_by_id:
            _invalid_workflow(
                f"Edge {edge_id} references an unknown target node: {target}"
            )

        try:
            validate_connector_contract(
                node_by_id[source],
                node_by_id[target],
                source_handle,
                target_handle,
            )
        except ValueError as error:
            _invalid_workflow(f"Edge {edge_id}: {error}")

        connection_key = (source, source_handle, target, target_handle)
        if connection_key in connection_keys:
            _invalid_workflow(f"Duplicate connection on edge: {edge_id}")
        connection_keys = {*connection_keys, connection_key}

        scalar_target = (target, target_handle)
        if not _is_list_target(node_by_id[target], target_handle):
            if scalar_target in scalar_targets:
                _invalid_workflow(
                    "Multiple sources connected to scalar input: "
                    f"{target}.{target_handle}"
                )
            scalar_targets = {*scalar_targets, scalar_target}

        adjacency = {
            **adjacency,
            source: [*adjacency[source], target],
        }
        indegrees = {
            **indegrees,
            target: indegrees[target] + 1,
        }

    queue = [node_id for node_id, degree in indegrees.items() if degree == 0]
    visited_count = 0
    while queue:
        current, *queue = queue
        visited_count += 1
        for neighbor in adjacency[current]:
            next_degree = indegrees[neighbor] - 1
            indegrees = {**indegrees, neighbor: next_degree}
            if next_degree == 0:
                queue = [*queue, neighbor]

    if visited_count != len(node_by_id):
        _invalid_workflow("Workflow graph contains a cycle")


# ---------------------------------------------------------------------------
# Helper: serialize a Workflow ORM object to dict
# ---------------------------------------------------------------------------


def _workflow_to_dict(w: Workflow, run: dict | None = None) -> dict:
    return {
        "id": w.id,
        "workflow_id": w.id,
        "name": w.name,
        "edges": json.loads(w.edges) if w.edges else [],
        "data": json.loads(w.data) if w.data else {"nodes": []},
        "run_history": run.get("nodes", {}) if run else {},
        "run_id": run.get("id") if run else None,
        "is_owner": True,
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
            result = await session.execute(
                select(Workflow).where(Workflow.id == workflow_id)
            )
            workflow = result.scalar_one_or_none()
            if not workflow:
                raise HTTPException(status_code=404, detail="Workflow not found")

            candidate_payload = {
                "edges": payload.get(
                    "edges", json.loads(workflow.edges) if workflow.edges else []
                ),
                "data": payload.get(
                    "data",
                    json.loads(workflow.data) if workflow.data else {"nodes": []},
                ),
            }
            _validate_workflow_graph(candidate_payload)

            if "name" in payload:
                workflow.name = payload["name"]
            if "edges" in payload:
                workflow.edges = json.dumps(payload["edges"])
            if "data" in payload:
                workflow.data = json.dumps(payload["data"])
            if "category" in payload:
                workflow.category = normalize_workflow_category(payload["category"])
            workflow.updated_at = datetime.now(timezone.utc)
        else:
            # Create new workflow
            candidate_payload = {
                "edges": payload.get("edges", []),
                "data": payload.get("data", {"nodes": []}),
            }
            _validate_workflow_graph(candidate_payload)
            workflow = Workflow(
                id=str(uuid.uuid4()),
                name=payload.get("name", "Untitled Workflow"),
                edges=json.dumps(payload.get("edges", [])),
                data=json.dumps(payload.get("data", {"nodes": []})),
                category=normalize_workflow_category(payload.get("category")),
            )
            session.add(workflow)

        await session.commit()
        await session.refresh(workflow)
        return _workflow_to_dict(workflow)


async def get_workflow_defs_helper():
    """List all workflows from local SQLite."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Workflow).order_by(Workflow.updated_at.desc())
        )
        workflows = result.scalars().all()
        return [_workflow_to_dict(w) for w in workflows]


async def get_workflow_def_helper(workflow_id: str):
    """Get a single workflow by ID from local SQLite."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Workflow).where(Workflow.id == workflow_id)
        )
        workflow = result.scalar_one_or_none()
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        latest_run = await get_latest_run(workflow_id)
        return _workflow_to_dict(workflow, latest_run)


async def delete_workflow_def_by_id(workflow_id: str):
    """Delete a workflow from local SQLite."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Workflow).where(Workflow.id == workflow_id)
        )
        workflow = result.scalar_one_or_none()
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        await session.execute(delete(Workflow).where(Workflow.id == workflow_id))
        await session.commit()
        await delete_workflow_runs(workflow_id)
        return {"message": "Workflow deleted successfully"}


async def update_workflow_name_helper(workflow_id: str, payload: dict):
    """Rename a workflow in local SQLite."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Workflow).where(Workflow.id == workflow_id)
        )
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
        result = await session.execute(
            select(Workflow).where(Workflow.id == workflow_id)
        )
        workflow = result.scalar_one_or_none()
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        if "category" in payload:
            workflow.category = normalize_workflow_category(payload["category"])
        workflow.updated_at = datetime.now(timezone.utc)
        await session.commit()
        return {"message": "Category updated successfully"}


async def generate_thumbnail_helper(workflow_id: str, payload: dict):
    """Store a thumbnail URL for a workflow in local SQLite."""
    if "thumbnail_url" not in payload:
        raise HTTPException(status_code=422, detail="thumbnail_url is required")
    thumbnail_url = normalize_workflow_cover_url(payload["thumbnail_url"])

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Workflow).where(Workflow.id == workflow_id)
        )
        workflow = result.scalar_one_or_none()
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        workflow.thumbnail = thumbnail_url
        workflow.updated_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(workflow)
        return {
            "message": "Cover updated successfully",
            "thumbnail": workflow.thumbnail,
            "updated_at": workflow.updated_at.isoformat(),
        }


async def get_workflow_last_run(workflow_id: str):
    """Return the latest persisted generation run for a workflow."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Workflow.id).where(Workflow.id == workflow_id)
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Workflow not found")
    return await get_latest_run(workflow_id) or {}


# ---------------------------------------------------------------------------
# AI/ML API EXECUTION
# ---------------------------------------------------------------------------


async def get_node_schemas_helper(workflow_id: str):
    return get_node_schemas()


async def get_api_node_schemas_helper(workflow_id: str):
    return {"categories": {"api": {"models": {}}}}


async def run_workflow_helper(workflow_id: str, payload: dict):
    raise HTTPException(
        status_code=501,
        detail=(
            "Run All is temporarily unavailable while workflow orchestration is "
            "being migrated to AI/ML API. Run image and video nodes individually."
        ),
    )


async def get_run_status_helper(run_id: str):
    return await get_run_status(run_id)


async def run_node_helper(workflow_id: str, node_id: str, payload: dict):
    if not isinstance(payload, dict) or not isinstance(payload.get("params", {}), dict):
        raise HTTPException(status_code=422, detail="Node run payload is invalid")

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Workflow).where(Workflow.id == workflow_id)
        )
        workflow = result.scalar_one_or_none()
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")

        workflow_data = json.loads(workflow.data) if workflow.data else {"nodes": []}
        node = next(
            (
                item
                for item in workflow_data.get("nodes", [])
                if item.get("id") == node_id
            ),
            None,
        )
        if not node:
            raise HTTPException(status_code=404, detail="Workflow node not found")

    persisted_model = node.get("model")
    if payload.get("model") != persisted_model:
        raise HTTPException(
            status_code=422,
            detail="Requested model does not match the persisted workflow node",
        )

    return await submit_node(
        workflow_id,
        node_id,
        persisted_model,
        payload.get("params", {}),
        payload.get("run_id"),
    )


async def calculate_dynamic_cost_helper(payload: dict):
    cost = calculate_generation_cost(
        payload.get("task_name", ""), payload.get("payload", {})
    )
    return {"cost": cost}


async def delete_node_run_by_id_helper(node_run_id: str):
    return await delete_node_run(node_run_id)
