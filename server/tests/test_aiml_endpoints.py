import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app


class AimlEndpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_node_schema_endpoint_returns_selected_provider_catalog(self):
        response = self.client.get("/api/workflow/local/node-schemas")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["provider"], "aimlapi")

    def test_upload_accepts_supported_media_and_returns_local_url(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch("app.routers.app_router.UPLOAD_DIR", Path(directory)):
                response = self.client.post(
                    "/api/app/upload?filename=reference.png",
                    content=b"small-test-image",
                    headers={"content-type": "image/png"},
                )

                self.assertEqual(response.status_code, 200)
                self.assertTrue(response.json()["url"].startswith("/api/uploads/"))
                self.assertEqual(len(list(Path(directory).iterdir())), 1)

    def test_generation_without_aiml_key_returns_a_clear_error(self):
        with patch.dict(os.environ, {"AIMLAPI_KEY": ""}):
            response = self.client.post(
                "/api/workflow/local/node/image1/run",
                json={
                    "model": "google/nano-banana-2",
                    "params": {"prompt": "A cinematic animated city"},
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("AIMLAPI_KEY", response.json()["detail"])

    def test_run_all_does_not_report_a_false_success(self):
        response = self.client.post(
            "/api/workflow/local/run",
            json={"cost": 0},
        )

        self.assertEqual(response.status_code, 501)
        self.assertIn("Run All is temporarily unavailable", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
