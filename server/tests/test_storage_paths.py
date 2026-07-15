import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.storage import get_data_dir, get_upload_dir


class StoragePathTests(unittest.TestCase):
    def test_storage_paths_default_to_server_directory(self):
        with patch.dict(os.environ, {}, clear=True):
            expected = Path(__file__).resolve().parents[1]

            self.assertEqual(get_data_dir(), expected)
            self.assertEqual(get_upload_dir(), expected / "uploads")

    def test_storage_paths_use_configured_data_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory) / "workflow-data"
            with patch.dict(
                os.environ, {"WORKFLOW_DATA_DIR": str(data_dir)}, clear=True
            ):
                self.assertEqual(get_data_dir(), data_dir.resolve())
                self.assertEqual(get_upload_dir(), data_dir.resolve() / "uploads")


if __name__ == "__main__":
    unittest.main()
