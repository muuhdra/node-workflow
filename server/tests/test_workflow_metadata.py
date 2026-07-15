import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.database import Base
from app.utils import workflow_helper


class WorkflowMetadataTests(unittest.IsolatedAsyncioTestCase):
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

    async def asyncTearDown(self):
        self.session_patch.stop()
        await self.engine.dispose()
        self.directory.cleanup()

    async def test_category_survives_create_and_update(self):
        created = await workflow_helper.create_or_update_workflow(
            {
                "name": "YouTube workflow",
                "category": "Animation",
                "edges": [],
                "data": {"nodes": []},
            }
        )
        self.assertEqual(created["category"], "Animation")

        updated = await workflow_helper.create_or_update_workflow(
            {
                "workflow_id": created["workflow_id"],
                "category": "Documentary",
                "edges": [],
                "data": {"nodes": []},
            }
        )
        self.assertEqual(updated["category"], "Documentary")

    async def test_input_image_identity_survives_workflow_reload(self):
        created = await workflow_helper.create_or_update_workflow(
            {
                "name": "Character references",
                "edges": [],
                "data": {
                    "nodes": [
                        {
                            "id": "image1",
                            "category": "image",
                            "model": "image-passthrough",
                            "input_params": {
                                "image_url": "/api/uploads/character.png",
                                "node_label": "Maya",
                                "node_description": "Red coat and round glasses",
                            },
                            "output_params": {},
                            "position": {"x": 0, "y": 0},
                        }
                    ]
                },
            }
        )

        workflows = await workflow_helper.get_workflow_defs_helper()
        restored = next(
            workflow
            for workflow in workflows
            if workflow["workflow_id"] == created["workflow_id"]
        )
        identity = restored["data"]["nodes"][0]["input_params"]

        self.assertEqual(identity["node_label"], "Maya")
        self.assertEqual(
            identity["node_description"],
            "Red coat and round glasses",
        )
