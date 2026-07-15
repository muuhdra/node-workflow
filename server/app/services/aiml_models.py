from copy import deepcopy

NANO_BANANA_UPSTREAM_ID = "google/gemini-3-1-flash-image-preview"

IMAGE_MODEL_IDS = (
    "google/nano-banana-2",
    "bytedance/seedream-5-0-lite-preview",
    "flux-kontext-pro",
)

VIDEO_MODEL_IDS = (
    "klingai/video-v2-6-pro-image-to-video",
    "alibaba/wan-2-6-image-to-video-flash",
    "google/veo-3.1-i2v-fast",
    "seedance-2",
)


def _field(field_type, title, **options):
    return {"type": field_type, "title": title, **options}


def _model(name, properties, required, *, available=True, unavailable_reason=None):
    model = {
        "name": name,
        "available": available,
        "input_schema": {
            "schemas": {
                "input_data": {
                    "type": "object",
                    "properties": properties,
                    "required": required,
                }
            }
        },
    }
    if unavailable_reason:
        model["unavailable_reason"] = unavailable_reason
    return model


PROMPT = _field("string", "Prompt", field="textarea", default="")
IMAGE_URL = _field("string", "Start image", field="image", default="")
IMAGES_LIST = _field(
    "array",
    "Reference images",
    field="image",
    items={"type": "string"},
    default=[],
)
ASPECT_RATIO = _field(
    "string",
    "Aspect ratio",
    enum=["16:9", "9:16", "1:1", "4:3", "3:4"],
    default="16:9",
)


IMAGE_MODELS = {
    "image-passthrough": _model(
        "Input Image",
        {"image_url": _field("string", "Image URL", field="image", default="")},
        ["image_url"],
    ),
    "google/nano-banana-2": _model(
        "Nano Banana 2",
        {
            "prompt": PROMPT,
            "images_list": {**IMAGES_LIST, "maxItems": 5},
            "aspect_ratio": ASPECT_RATIO,
            "resolution": _field(
                "string", "Resolution", enum=["1K", "2K", "4K"], default="2K"
            ),
            "enable_web_search": _field("boolean", "Enable web search", default=False),
            "num_outputs": _field(
                "integer", "Outputs", minimum=1, maximum=4, default=1
            ),
        },
        ["prompt"],
    ),
    "bytedance/seedream-5-0-lite-preview": _model(
        "Seedream 5.0 Lite",
        {
            "prompt": PROMPT,
            "images_list": {**IMAGES_LIST, "maxItems": 14},
            "width": _field("integer", "Width", minimum=1, default=2048),
            "height": _field("integer", "Height", minimum=1, default=2048),
            "response_format": _field(
                "string", "Response format", enum=["url"], default="url"
            ),
            "seed": _field("integer", "Seed", minimum=0, default=1),
            "watermark": _field("boolean", "Watermark", default=False),
        },
        ["prompt"],
    ),
    "flux-kontext-pro": _model(
        "Flux Kontext Pro",
        {
            "prompt": PROMPT,
            "images_list": {**IMAGES_LIST, "maxItems": 4},
            "aspect_ratio": ASPECT_RATIO,
            "num_outputs": _field(
                "integer", "Outputs", minimum=1, maximum=4, default=1
            ),
            "seed": _field("integer", "Seed", minimum=0, default=1),
            "guidance_scale": _field("number", "Guidance scale", minimum=0, default=1),
            "safety_tolerance": _field(
                "string",
                "Safety tolerance",
                enum=["0", "1", "2", "3", "4", "5", "6"],
                default="2",
            ),
            "output_format": _field(
                "string", "Output format", enum=["jpeg", "png"], default="jpeg"
            ),
        },
        ["prompt"],
    ),
}


VIDEO_MODELS = {
    "video-passthrough": _model(
        "Input Video",
        {"video_url": _field("string", "Video URL", field="video", default="")},
        ["video_url"],
    ),
    "klingai/video-v2-6-pro-image-to-video": _model(
        "Kling 2.6 Pro I2V",
        {
            "provider": _field("string", "Provider", enum=["auto"], default="auto"),
            "prompt": PROMPT,
            "image_url": IMAGE_URL,
            "last_image": _field("string", "End image", field="image", default=""),
            "duration": _field("integer", "Duration", enum=[5, 10], default=5),
            "negative_prompt": _field(
                "string", "Negative prompt", field="textarea", default=""
            ),
            "generate_audio": _field("boolean", "Generate audio", default=True),
        },
        ["prompt", "image_url"],
    ),
    "alibaba/wan-2-6-image-to-video-flash": _model(
        "Wan 2.6 Flash I2V",
        {
            "prompt": PROMPT,
            "image_url": IMAGE_URL,
            "audio_url": _field("string", "Audio input", field="audio", default=""),
            "resolution": _field(
                "string", "Resolution", enum=["720p", "1080p"], default="720p"
            ),
            "duration": _field("integer", "Duration", enum=[5, 10, 15], default=5),
            "negative_prompt": _field(
                "string", "Negative prompt", field="textarea", default=""
            ),
            "shot_type": _field(
                "string", "Shot type", enum=["single", "multi"], default="single"
            ),
            "generate_audio": _field("boolean", "Generate audio", default=True),
            "seed": _field("integer", "Seed", minimum=0, default=1),
            "enhance_prompt": _field("boolean", "Enhance prompt", default=True),
        },
        ["prompt", "image_url"],
    ),
    "google/veo-3.1-i2v-fast": _model(
        "Veo 3.1 Fast I2V",
        {
            "prompt": PROMPT,
            "image_url": IMAGE_URL,
            "provider": _field("string", "Provider", enum=["auto"], default="auto"),
            "aspect_ratio": _field(
                "string",
                "Aspect ratio",
                enum=["16:9", "9:16"],
                default="16:9",
            ),
            "resolution": _field(
                "string", "Resolution", enum=["720p", "1080p"], default="1080p"
            ),
            "duration": _field("integer", "Duration", enum=[4, 6, 8], default=4),
            "generate_audio": _field("boolean", "Generate audio", default=True),
        },
        ["prompt", "image_url"],
    ),
    "seedance-2": _model(
        "Seedance 2",
        {
            "provider": _field("string", "Provider", enum=["auto"], default="auto"),
            "prompt": PROMPT,
            "image_url": IMAGE_URL,
            "last_image": _field("string", "End image", field="image", default=""),
            "audio_url": _field("string", "Audio input", field="audio", default=""),
            "video_url": _field("string", "Reference video", field="video", default=""),
            "images_list": {**IMAGES_LIST, "maxItems": 10},
            "audios_list": _field(
                "array",
                "Audio references",
                field="audio",
                items={"type": "string"},
                default=[],
            ),
            "videos_list": _field(
                "array",
                "Video references",
                field="video",
                items={"type": "string"},
                default=[],
            ),
            "aspect_ratio": ASPECT_RATIO,
            "resolution": _field("string", "Resolution", enum=["720p"], default="720p"),
            "duration": _field("integer", "Duration", enum=[4], default=4),
            "generate_audio": _field("boolean", "Generate audio", default=True),
            "seed": _field("integer", "Seed", minimum=0, default=1),
            "watermark": _field("boolean", "Watermark", default=False),
        },
        ["prompt", "image_url"],
    ),
}


PASSTHROUGH_MODELS = {
    "text": {
        "text-passthrough": _model(
            "Input Text",
            {"prompt": PROMPT},
            ["prompt"],
        )
    },
    "audio": {
        "audio-passthrough": _model(
            "Input Audio",
            {"audio_url": _field("string", "Audio URL", field="audio", default="")},
            ["audio_url"],
        )
    },
}


def get_node_schemas():
    def with_ids(models):
        return {
            model_id: {**model, "id": model_id} for model_id, model in models.items()
        }

    return deepcopy(
        {
            "provider": "aimlapi",
            "categories": {
                "image": {"models": with_ids(IMAGE_MODELS)},
                "video": {"models": with_ids(VIDEO_MODELS)},
                "text": {"models": with_ids(PASSTHROUGH_MODELS["text"])},
                "audio": {"models": with_ids(PASSTHROUGH_MODELS["audio"])},
                "utility": {"models": {}},
                "api": {"models": {}},
            },
        }
    )


def _clean_payload(params):
    ignored = {"num_outputs", "make_output", "make_input"}
    return {
        key: value
        for key, value in params.items()
        if key not in ignored and value not in (None, "", [])
    }


def build_aiml_payload(model_id, params):
    known_models = {*IMAGE_MODEL_IDS, *VIDEO_MODEL_IDS}
    if model_id not in known_models:
        raise ValueError(f"Unsupported AI/ML API model: {model_id}")

    prompt = params.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("Prompt is required before generating media")

    raw_references = params.get("images_list") or []
    if model_id == "google/nano-banana-2" and len(raw_references) > 5:
        raise ValueError("Nano Banana 2 accepts up to 5 reference images")

    output_count = max(1, min(4, int(params.get("num_outputs", 1) or 1)))
    payload = _clean_payload(params)
    references = payload.pop("images_list", [])

    if model_id == "flux-kontext-pro":
        payload["num_images"] = output_count
        if references:
            payload["model"] = "flux/kontext-pro/image-to-image"
            payload["image_url"] = references
        else:
            payload["model"] = "flux/kontext-pro/text-to-image"
        return payload

    if model_id == "bytedance/seedream-5-0-lite-preview":
        width = payload.pop("width", None)
        height = payload.pop("height", None)
        if width is not None and height is not None:
            payload["image_size"] = {"width": width, "height": height}
        payload["model"] = model_id
        if references:
            payload["image_urls"] = references
        return payload

    if model_id == "klingai/video-v2-6-pro-image-to-video":
        last_image = payload.pop("last_image", None)
        if last_image:
            payload["tail_image_url"] = last_image

    if model_id == "seedance-2":
        last_image = payload.pop("last_image", None)
        audio_references = payload.pop("audios_list", [])
        video_references = payload.pop("videos_list", [])
        if last_image:
            payload["last_image_url"] = last_image
        if references:
            payload["image_urls"] = references
        if audio_references:
            payload["audio_urls"] = audio_references
        if video_references:
            payload["video_urls"] = video_references
        payload["model"] = "bytedance/dreamina-seedance-2-0"
        return payload

    payload["model"] = (
        NANO_BANANA_UPSTREAM_ID
        if model_id == "google/nano-banana-2"
        else model_id
    )

    if references:
        payload["image_urls"] = references

    if model_id not in {
        "klingai/video-v2-6-pro-image-to-video",
        "alibaba/wan-2-6-image-to-video-flash",
        "google/veo-3.1-i2v-fast",
    }:
        payload.pop("generate_audio", None)

    return payload


def calculate_generation_cost(model_id, params):
    count = max(1, int(params.get("num_outputs", 1) or 1))
    image_prices = {
        "google/nano-banana-2": 0.039,
        "bytedance/seedream-5-0-lite-preview": 0.0455,
        "flux-kontext-pro": 0.052,
    }
    if model_id in image_prices:
        return round(image_prices[model_id] * count, 4)

    duration = max(1, int(params.get("duration", 5) or 5))
    if model_id == "klingai/video-v2-6-pro-image-to-video":
        rate = 0.182 if params.get("generate_audio") else 0.091
        return round(rate * duration, 4)
    if model_id == "google/veo-3.1-i2v-fast":
        rate = 0.195 if params.get("generate_audio") else 0.13
        return round(rate * duration, 4)
    if model_id == "seedance-2":
        return round(0.3944 * duration, 4)
    return None


def extract_output_urls(response):
    urls = []
    for collection_name in ("data", "images"):
        collection = response.get(collection_name)
        if isinstance(collection, list):
            urls.extend(
                item.get("url")
                for item in collection
                if isinstance(item, dict) and item.get("url")
            )

    video = response.get("video")
    if isinstance(video, dict) and video.get("url"):
        urls.append(video["url"])
    elif isinstance(video, str) and video:
        urls.append(video)

    output = response.get("output")
    if isinstance(output, dict) and output.get("url"):
        urls.append(output["url"])
    elif isinstance(output, list):
        urls.extend(
            item.get("url") if isinstance(item, dict) else item
            for item in output
            if (isinstance(item, str) and item)
            or (isinstance(item, dict) and item.get("url"))
        )

    return list(dict.fromkeys(urls))
