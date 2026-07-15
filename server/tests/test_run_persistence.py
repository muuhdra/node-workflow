import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.database import Base
from app.services import aiml_client, run_repository


class GenerationRunPersistenceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        database_path = Path(self.directory.name) / "runs.db"
        self.engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
        self.session_factory = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.session_patch = patch.object(
            run_repository, "AsyncSessionLocal", self.session_factory
        )
        self.session_patch.start()

    async def asyncTearDown(self):
        self.session_patch.stop()
        await self.engine.dispose()
        self.directory.cleanup()

    async def test_run_survives_a_new_database_session(self):
        nodes = {
            "video1": [
                {
                    "node_run_id": "node-run-1",
                    "status": "processing",
                    "external_id": "provider-run-1",
                }
            ]
        }
        await run_repository.save_run("run-1", "workflow-1", nodes)

        restored = await run_repository.get_run("run-1")
        latest = await run_repository.get_latest_run("workflow-1")

        self.assertEqual(restored["nodes"], nodes)
        self.assertEqual(latest["id"], "run-1")
        self.assertEqual(latest["workflow_id"], "workflow-1")

    async def test_delete_node_run_updates_persisted_history(self):
        await run_repository.save_run(
            "run-1",
            "workflow-1",
            {
                "video1": [
                    {"node_run_id": "keep", "status": "succeeded"},
                    {"node_run_id": "remove", "status": "failed"},
                ]
            },
        )

        deleted = await run_repository.delete_node_run("remove")
        restored = await run_repository.get_run("run-1")

        self.assertTrue(deleted)
        self.assertEqual(
            [item["node_run_id"] for item in restored["nodes"]["video1"]],
            ["keep"],
        )

    async def test_rejects_foreign_run_before_calling_provider(self):
        await run_repository.save_run("run-1", "workflow-1", {})
        request = AsyncMock()

        with patch.object(aiml_client, "_request", request):
            with self.assertRaises(HTTPException) as context:
                await aiml_client.submit_node(
                    "workflow-2",
                    "image1",
                    "google/nano-banana-2",
                    {"prompt": "Animated city"},
                    "run-1",
                )

        self.assertEqual(context.exception.status_code, 409)
        request.assert_not_awaited()
