import unittest

from fastapi import HTTPException

from app.utils.workflow_helper import normalize_workflow_cover_url


class WorkflowCoverValidationTests(unittest.TestCase):
    def test_accepts_local_uploaded_image(self):
        cover_url = "/api/uploads/0123456789abcdef0123456789abcdef.webp"

        self.assertEqual(normalize_workflow_cover_url(cover_url), cover_url)

    def test_accepts_none_to_remove_cover(self):
        self.assertIsNone(normalize_workflow_cover_url(None))

    def test_rejects_external_or_non_image_urls(self):
        invalid_urls = (
            "https://example.com/cover.png",
            "/api/uploads/0123456789abcdef0123456789abcdef.mp4",
            "javascript:alert(1)",
        )

        for invalid_url in invalid_urls:
            with self.subTest(invalid_url=invalid_url):
                with self.assertRaises(HTTPException) as context:
                    normalize_workflow_cover_url(invalid_url)

                self.assertEqual(context.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
