import json
from datetime import datetime, timezone

from sqlalchemy import delete, select

from app.database import AsyncSessionLocal
from app.models import GenerationRun


def _to_dict(run: GenerationRun) -> dict:
    return {
        "id": run.id,
        "workflow_id": run.workflow_id,
        "nodes": json.loads(run.nodes) if run.nodes else {},
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "updated_at": run.updated_at.isoformat() if run.updated_at else None,
    }


async def get_run(run_id: str) -> dict | None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(GenerationRun).where(GenerationRun.id == run_id)
        )
        run = result.scalar_one_or_none()
        return _to_dict(run) if run else None


async def get_latest_run(workflow_id: str) -> dict | None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(GenerationRun)
            .where(GenerationRun.workflow_id == workflow_id)
            .order_by(GenerationRun.updated_at.desc())
            .limit(1)
        )
        run = result.scalar_one_or_none()
        return _to_dict(run) if run else None


async def save_run(run_id: str, workflow_id: str, nodes: dict) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(GenerationRun).where(GenerationRun.id == run_id)
        )
        run = result.scalar_one_or_none()
        if run:
            run.nodes = json.dumps(nodes)
            run.updated_at = datetime.now(timezone.utc)
        else:
            run = GenerationRun(
                id=run_id,
                workflow_id=workflow_id,
                nodes=json.dumps(nodes),
            )
            session.add(run)
        await session.commit()
        await session.refresh(run)
        return _to_dict(run)


async def delete_node_run(node_run_id: str) -> bool:
    found = False
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(GenerationRun))
        for run in result.scalars().all():
            current_nodes = json.loads(run.nodes) if run.nodes else {}
            updated_nodes = {}
            run_changed = False
            for node_id, history in current_nodes.items():
                updated_history = [
                    item
                    for item in history
                    if item.get("node_run_id") != node_run_id
                ]
                if len(updated_history) != len(history):
                    found = True
                    run_changed = True
                updated_nodes = {**updated_nodes, node_id: updated_history}
            if run_changed:
                run.nodes = json.dumps(updated_nodes)
                run.updated_at = datetime.now(timezone.utc)
        await session.commit()
    return found


async def delete_workflow_runs(workflow_id: str) -> None:
    async with AsyncSessionLocal() as session:
        await session.execute(
            delete(GenerationRun).where(GenerationRun.workflow_id == workflow_id)
        )
        await session.commit()
