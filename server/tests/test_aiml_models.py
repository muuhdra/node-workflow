import unittest

from app.services.aiml_models import (
    IMAGE_MODEL_IDS,
    VIDEO_MODEL_IDS,
    build_aiml_payload,
    calculate_generation_cost,
    extract_output_urls,
    get_node_schemas,
)


class AimlModelCatalogTests(unittest.TestCase):
    def test_catalog_contains_only_selected_generation_models(self):
        schemas = get_node_schemas()

        self.assertEqual(
            set(schemas["categories"]["image"]["models"]),
            {"image-passthrough", *IMAGE_MODEL_IDS},
        )
        self.assertEqual(
            set(schemas["categories"]["video"]["models"]),
            {"video-passthrough", *VIDEO_MODEL_IDS},
        )

    def test_seedream_uses_the_documented_payload(self):
        payload = build_aiml_payload(
            "bytedance/seedream-5-0-lite-preview",
            {
                "prompt": "Animated city",
                "images_list": ["https://example.com/style.png"],
                "width": 2048,
                "height": 2048,
                "response_format": "url",
                "seed": 1,
                "watermark": False,
            },
        )

        self.assertEqual(payload["model"], "bytedance/seedream-5-0-lite")
        self.assertEqual(payload["image_urls"], ["https://example.com/style.png"])
        self.assertEqual(payload["image_size"], {"width": 2048, "height": 2048})
        self.assertEqual(payload["response_format"], "url")
        self.assertEqual(payload["seed"], 1)
        self.assertFalse(payload["watermark"])
        self.assertNotIn("width", payload)
        self.assertNotIn("height", payload)
        self.assertNotIn("images_list", payload)

    def test_nano_banana_uses_the_documented_gemini_payload(self):
        payload = build_aiml_payload(
            "google/nano-banana-2",
            {
                "prompt": "Animated city",
                "images_list": ["https://example.com/style.png"],
                "aspect_ratio": "1:1",
                "resolution": "1K",
                "enable_web_search": False,
            },
        )

        self.assertEqual(payload["model"], "google/gemini-3-1-flash-image-preview")
        self.assertEqual(payload["image_urls"], ["https://example.com/style.png"])
        self.assertEqual(payload["aspect_ratio"], "1:1")
        self.assertEqual(payload["resolution"], "1K")
        self.assertFalse(payload["enable_web_search"])

    def test_nano_banana_rejects_an_empty_prompt_before_calling_provider(self):
        with self.assertRaisesRegex(ValueError, "Prompt is required"):
            build_aiml_payload("google/nano-banana-2", {"prompt": "  "})

    def test_nano_banana_rejects_more_than_five_references(self):
        with self.assertRaisesRegex(ValueError, "up to 5 reference images"):
            build_aiml_payload(
                "google/nano-banana-2",
                {
                    "prompt": "Animated city",
                    "images_list": [
                        f"https://example.com/{index}.png" for index in range(6)
                    ],
                },
            )

    def test_flux_uses_text_or_image_mode_based_on_references(self):
        text_payload = build_aiml_payload(
            "flux-kontext-pro",
            {
                "prompt": "Animated city",
                "images_list": [],
                "num_outputs": 1,
                "seed": 1,
                "guidance_scale": 1,
                "safety_tolerance": "2",
                "output_format": "jpeg",
                "aspect_ratio": "16:9",
            },
        )
        edit_payload = build_aiml_payload(
            "flux-kontext-pro",
            {
                "prompt": "Animated city",
                "images_list": ["https://example.com/style.png"],
            },
        )

        self.assertEqual(text_payload["model"], "flux-pro/kontext/text-to-image")
        self.assertEqual(text_payload["num_images"], 1)
        self.assertEqual(text_payload["seed"], 1)
        self.assertEqual(text_payload["guidance_scale"], 1)
        self.assertEqual(text_payload["safety_tolerance"], "2")
        self.assertEqual(text_payload["output_format"], "jpeg")
        self.assertEqual(text_payload["aspect_ratio"], "16:9")
        self.assertEqual(edit_payload["model"], "flux/kontext-pro/image-to-image")
        self.assertEqual(edit_payload["image_url"], ["https://example.com/style.png"])

    def test_wan_uses_the_documented_image_to_video_payload(self):
        payload = build_aiml_payload(
            "alibaba/wan-2-6-image-to-video-flash",
            {
                "prompt": "Slow camera push",
                "image_url": "https://example.com/start.png",
                "audio_url": "https://example.com/audio.mp3",
                "resolution": "720p",
                "duration": 5,
                "negative_prompt": "flicker",
                "shot_type": "single",
                "generate_audio": True,
                "seed": 1,
                "enhance_prompt": True,
            },
        )

        self.assertEqual(payload["model"], "alibaba/wan2.6-i2v-flash")
        self.assertEqual(payload["image_url"], "https://example.com/start.png")
        self.assertEqual(payload["audio_url"], "https://example.com/audio.mp3")
        self.assertEqual(payload["resolution"], "720p")
        self.assertEqual(payload["duration"], 5)
        self.assertEqual(payload["negative_prompt"], "flicker")
        self.assertEqual(payload["shot_type"], "single")
        self.assertTrue(payload["generate_audio"])
        self.assertEqual(payload["seed"], 1)
        self.assertTrue(payload["enhance_prompt"])

    def test_kling_uses_the_documented_image_to_video_payload(self):
        payload = build_aiml_payload(
            "klingai/video-v2-6-pro-image-to-video",
            {
                "provider": "auto",
                "prompt": "Slow camera push",
                "image_url": "https://example.com/start.png",
                "last_image": "https://example.com/end.png",
                "duration": 5,
                "negative_prompt": "flicker",
                "generate_audio": True,
            },
        )

        self.assertEqual(payload["model"], "klingai/video-v2-6-pro-image-to-video")
        self.assertEqual(payload["provider"], "auto")
        self.assertEqual(payload["image_url"], "https://example.com/start.png")
        self.assertEqual(payload["tail_image_url"], "https://example.com/end.png")
        self.assertEqual(payload["duration"], 5)
        self.assertEqual(payload["negative_prompt"], "flicker")
        self.assertTrue(payload["generate_audio"])
        self.assertNotIn("last_image", payload)

    def test_veo_uses_the_documented_fast_image_to_video_payload(self):
        payload = build_aiml_payload(
            "google/veo-3.1-i2v-fast",
            {
                "prompt": "Slow camera push",
                "image_url": "https://example.com/start.png",
                "provider": "auto",
                "aspect_ratio": "16:9",
                "resolution": "1080p",
                "duration": 4,
                "generate_audio": True,
            },
        )

        self.assertEqual(payload["model"], "veo3.1/fast/image-to-video")
        self.assertEqual(payload["image_url"], "https://example.com/start.png")
        self.assertEqual(payload["provider"], "auto")
        self.assertEqual(payload["aspect_ratio"], "16:9")
        self.assertEqual(payload["resolution"], "1080p")
        self.assertEqual(payload["duration"], 4)
        self.assertTrue(payload["generate_audio"])

    def test_seedance_uses_the_documented_multimodal_payload(self):
        schemas = get_node_schemas()
        seedance = schemas["categories"]["video"]["models"]["seedance-2"]
        payload = build_aiml_payload(
            "seedance-2",
            {
                "provider": "auto",
                "prompt": "Animate",
                "image_url": "https://example.com/start.png",
                "last_image": "https://example.com/end.png",
                "audio_url": "https://example.com/audio.mp3",
                "video_url": "https://example.com/video.mp4",
                "images_list": ["https://example.com/reference.png"],
                "audios_list": ["https://example.com/reference.mp3"],
                "videos_list": ["https://example.com/reference.mp4"],
                "aspect_ratio": "16:9",
                "resolution": "720p",
                "duration": 4,
                "generate_audio": True,
                "seed": 1,
                "watermark": False,
            },
        )

        self.assertTrue(seedance["available"])
        self.assertEqual(payload["model"], "bytedance/dreamina-seedance-2-0")
        self.assertEqual(payload["provider"], "auto")
        self.assertEqual(payload["image_url"], "https://example.com/start.png")
        self.assertEqual(payload["last_image_url"], "https://example.com/end.png")
        self.assertEqual(payload["audio_url"], "https://example.com/audio.mp3")
        self.assertEqual(payload["video_url"], "https://example.com/video.mp4")
        self.assertEqual(payload["image_urls"], ["https://example.com/reference.png"])
        self.assertEqual(payload["audio_urls"], ["https://example.com/reference.mp3"])
        self.assertEqual(payload["video_urls"], ["https://example.com/reference.mp4"])
        self.assertTrue(payload["generate_audio"])
        self.assertFalse(payload["watermark"])
        self.assertNotIn("last_image", payload)
        self.assertNotIn("audios_list", payload)
        self.assertNotIn("videos_list", payload)

    def test_cost_estimates_are_local_and_duration_aware(self):
        self.assertEqual(
            calculate_generation_cost(
                "klingai/video-v2-6-pro-image-to-video",
                {"duration": 10, "generate_audio": False},
            ),
            0.91,
        )
        self.assertEqual(
            calculate_generation_cost(
                "klingai/video-v2-6-pro-image-to-video",
                {"duration": 10, "generate_audio": True},
            ),
            1.82,
        )

    def test_image_and_video_responses_are_normalized_to_urls(self):
        self.assertEqual(
            extract_output_urls({"data": [{"url": "https://cdn/image.png"}]}),
            ["https://cdn/image.png"],
        )
        self.assertEqual(
            extract_output_urls({"video": {"url": "https://cdn/video.mp4"}}),
            ["https://cdn/video.mp4"],
        )
        self.assertEqual(
            extract_output_urls({"images": [{"url": "https://cdn/flux.jpg"}]}),
            ["https://cdn/flux.jpg"],
        )


if __name__ == "__main__":
    unittest.main()
