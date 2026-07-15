import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.database import Base
from app.models import Workflow
from app.utils import workflow_helper


class RunNodeValidationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        database_path = Path(self.directory.name) / "workflow.db"
        self.engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
        self.session_factory = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.session_patch = patch.object(
            workflow_helper, "AsyncSessionLocal", self.session_factory
        )
        self.session_patch.start()

        async with self.session_factory() as session:
            session.add(
                Workflow(
                    id="workflow-1",
                    name="Workflow",
                    edges="[]",
                    data=json.dumps(
                        {
                            "nodes": [
                                {
                                    "id": "image1",
                                    "category": "image",
                                    "model": "google/nano-banana-2",
                                    "input_params": {"prompt": "Saved prompt"},
                                }
                            ]
                        }
                    ),
                )
            )
            await session.commit()

    async def asyncTearDown(self):
        self.session_patch.stop()
        await self.engine.dispose()
        self.directory.cleanup()

    async def assert_http_error(self, workflow_id, node_id, payload, status_code):
        with self.assertRaises(HTTPException) as context:
            await workflow_helper.run_node_helper(workflow_id, node_id, payload)
        self.assertEqual(context.exception.status_code, status_code)

    async def test_rejects_unknown_workflow_and_node(self):
        payload = {"model": "google/nano-banana-2", "params": {"prompt": "Hi"}}

        await self.assert_http_error("missing", "image1", payload, 404)
        await self.assert_http_error("workflow-1", "missing", payload, 404)

    async def test_rejects_model_that_differs_from_persisted_node(self):
        await self.assert_http_error(
            "workflow-1",
            "image1",
            {"model": "flux-kontext-pro", "params": {"prompt": "Hi"}},
            422,
        )

    async def test_executes_the_persisted_node_model(self):
        submit = AsyncMock(return_value={"run_id": "run-1"})
        with patch.object(workflow_helper, "submit_node", submit):
            result = await workflow_helper.run_node_helper(
                "workflow-1",
                "image1",
                {
                    "model": "google/nano-banana-2",
                    "params": {"prompt": "New prompt"},
                    "run_id": None,
                },
            )

        self.assertEqual(result, {"run_id": "run-1"})
        submit.assert_awaited_once_with(
            "workflow-1",
            "image1",
            "google/nano-banana-2",
            {"prompt": "New prompt"},
            None,
        )
