from app.services.aiml_models import get_node_schemas

SOURCE_HANDLE_TYPES = {
    "text": {"textOutput": "text"},
    "image": {"imageOutput": "image"},
    "video": {
        "videoStartImageOutput": "image",
        "videoEndImageOutput": "image",
        "videoOutput": "video",
        "videoAudioOutput": "audio",
    },
    "audio": {"audioOutput": "audio"},
    "api": {"apiOutput": "image"},
}

TARGET_HANDLE_TYPES = {
    "text": {
        "textInput": "text",
        "textInput2": "image",
        "textInput3": "image",
        "textInput4": "text",
    },
    "image": {
        "imageInput": "text",
        "imageInput2": "image",
        "imageInput3": "image",
    },
    "video": {
        "videoInput": "text",
        "videoInput2": "image",
        "videoInput3": "image",
        "videoInput4": "video",
        "videoInput5": "audio",
        "videoInput6": "image",
        "videoInput7": "video",
        "videoInput8": "audio",
    },
    "audio": {
        "audioInput": "audio",
        "audioInput2": "text",
        "audioInput3": "image",
        "audioInput4": "video",
    },
    "api": {
        "apiInput": "text",
        "apiInput2": "image",
        "apiInput3": "image",
    },
}

PROPERTY_TARGET_HANDLES = {
    "image": {
        "prompt": "imageInput",
        "images_list": "imageInput2",
        "image_url": "imageInput3",
    },
    "video": {
        "prompt": "videoInput",
        "image_url": "videoInput2",
        "last_image": "videoInput3",
        "video_url": "videoInput4",
        "audio_url": "videoInput5",
        "images_list": "videoInput6",
        "videos_list": "videoInput7",
        "audios_list": "videoInput8",
    },
}

UTILITY_SOURCE_HANDLES = {
    "reference-images": {"imageOutput": "image"},
    "prompt-concatenator": {"concatOutput": "text"},
    "video-combiner": {"videoOutput": "video"},
}

UTILITY_TARGET_HANDLES = {
    "prompt-concatenator": {"concatInput": "text"},
    "video-combiner": {"videoInput7": "video"},
}


def _model_properties(node: dict) -> dict | None:
    category = node.get("category")
    model_id = node.get("model")
    model = (
        get_node_schemas()
        .get("categories", {})
        .get(category, {})
        .get("models", {})
        .get(model_id)
    )
    if not model:
        return None
    return (
        model.get("input_schema", {})
        .get("schemas", {})
        .get("input_data", {})
        .get("properties", {})
    )


def get_source_handle_types(node: dict) -> dict:
    if node.get("category") == "utility":
        return UTILITY_SOURCE_HANDLES.get(node.get("model"), {})
    return SOURCE_HANDLE_TYPES.get(node.get("category"), {})


def get_target_handle_types(node: dict) -> dict:
    category = node.get("category")
    model_id = node.get("model")
    if category == "utility":
        return UTILITY_TARGET_HANDLES.get(model_id, {})

    base_handles = TARGET_HANDLE_TYPES.get(category, {})
    properties = _model_properties(node)
    if properties is None:
        return base_handles
    if model_id and model_id.endswith("-passthrough"):
        return {}

    property_handles = PROPERTY_TARGET_HANDLES.get(category)
    if not property_handles:
        return base_handles
    exposed_handles = {
        handle
        for property_name, handle in property_handles.items()
        if property_name in properties
    }
    return {
        handle: media_type
        for handle, media_type in base_handles.items()
        if handle in exposed_handles
    }


def validate_connector_contract(
    source_node: dict,
    target_node: dict,
    source_handle: str,
    target_handle: str,
) -> None:
    source_handles = get_source_handle_types(source_node)
    target_handles = get_target_handle_types(target_node)
    if source_handle not in source_handles:
        raise ValueError(f"Unknown source handle: {source_handle}")
    if target_handle not in target_handles:
        raise ValueError(f"Unknown target handle: {target_handle}")
    if source_handles[source_handle] != target_handles[target_handle]:
        raise ValueError(
            "Incompatible connector types: "
            f"{source_handles[source_handle]} -> {target_handles[target_handle]}"
        )
