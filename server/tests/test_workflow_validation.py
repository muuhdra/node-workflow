import unittest

from fastapi import HTTPException

from app.utils.workflow_helper import _validate_workflow_graph


def node(node_id, category="text", input_params=None, model=None):
    result = {
        "id": node_id,
        "category": category,
        "input_params": input_params or {"prompt": ""},
    }
    if model:
        result["model"] = model
    return result


def edge(
    edge_id,
    source,
    target,
    target_handle="textInput",
    source_handle="textOutput",
):
    return {
        "id": edge_id,
        "source": source,
        "target": target,
        "sourceHandle": source_handle,
        "targetHandle": target_handle,
    }


class WorkflowGraphValidationTests(unittest.TestCase):
    def assert_invalid(self, payload, message):
        with self.assertRaises(HTTPException) as context:
            _validate_workflow_graph(payload)
        self.assertEqual(context.exception.status_code, 422)
        self.assertIn(message, context.exception.detail)

    def test_accepts_an_acyclic_graph(self):
        payload = {
            "data": {"nodes": [node("text1"), node("text2")]},
            "edges": [edge("edge1", "text1", "text2")],
        }
        _validate_workflow_graph(payload)

    def test_rejects_duplicate_node_ids(self):
        payload = {"data": {"nodes": [node("text1"), node("text1")]}, "edges": []}
        self.assert_invalid(payload, "Duplicate node id")

    def test_rejects_malformed_node_input_params(self):
        malformed = node("api1", "api")
        malformed["input_params"] = "not-an-object"
        payload = {"data": {"nodes": [malformed]}, "edges": []}
        self.assert_invalid(payload, "input_params must be an object")

    def test_rejects_invalid_input_image_identity(self):
        invalid_values = (
            ({"node_label": {"name": "Maya"}}, "node_label must be a string"),
            ({"node_label": "A" * 61}, "node_label must contain at most 60"),
            ({"node_description": ["red coat"]}, "node_description must be a string"),
            (
                {"node_description": "B" * 181},
                "node_description must contain at most 180",
            ),
        )

        for input_params, message in invalid_values:
            with self.subTest(message=message):
                payload = {
                    "data": {
                        "nodes": [
                            node(
                                "image1",
                                "image",
                                input_params,
                                "image-passthrough",
                            )
                        ]
                    },
                    "edges": [],
                }
                self.assert_invalid(payload, message)

    def test_rejects_edges_that_reference_missing_nodes(self):
        payload = {
            "data": {"nodes": [node("text1")]},
            "edges": [edge("edge1", "missing", "text1")],
        }
        self.assert_invalid(payload, "unknown source node")

    def test_rejects_duplicate_edge_ids_and_connections(self):
        nodes = [node("text1"), node("text2"), node("text3")]
        duplicate_ids = {
            "data": {"nodes": nodes},
            "edges": [
                edge("same", "text1", "text2"),
                edge("same", "text2", "text3"),
            ],
        }
        self.assert_invalid(duplicate_ids, "Duplicate edge id")

        duplicate_connections = {
            "data": {"nodes": nodes},
            "edges": [
                edge("edge1", "text1", "text2"),
                edge("edge2", "text1", "text2"),
            ],
        }
        self.assert_invalid(duplicate_connections, "Duplicate connection")

    def test_rejects_multiple_sources_on_a_scalar_handle(self):
        payload = {
            "data": {"nodes": [node("text1"), node("text2"), node("text3")]},
            "edges": [
                edge("edge1", "text1", "text3"),
                edge("edge2", "text2", "text3"),
            ],
        }
        self.assert_invalid(payload, "Multiple sources")

    def test_accepts_multiple_sources_on_a_list_handle(self):
        payload = {
            "data": {
                "nodes": [
                    node("image1", "image"),
                    node("image2", "image"),
                    node("image3", "image", {"images_list": []}),
                ]
            },
            "edges": [
                edge("edge1", "image1", "image3", "imageInput2", "imageOutput"),
                edge("edge2", "image2", "image3", "imageInput2", "imageOutput"),
            ],
        }
        _validate_workflow_graph(payload)

    def test_rejects_cycles(self):
        payload = {
            "data": {"nodes": [node("text1"), node("text2"), node("text3")]},
            "edges": [
                edge("edge1", "text1", "text2"),
                edge("edge2", "text2", "text3"),
                edge("edge3", "text3", "text1"),
            ],
        }
        self.assert_invalid(payload, "cycle")

    def test_rejects_unknown_and_incompatible_handles(self):
        unknown = {
            "data": {
                "nodes": [node("text1"), node("image1", "image")],
            },
            "edges": [
                edge(
                    "edge1",
                    "text1",
                    "image1",
                    source_handle="doesNotExist",
                    target_handle="alsoMissing",
                )
            ],
        }
        self.assert_invalid(unknown, "Unknown source handle")

        incompatible = {
            "data": {
                "nodes": [node("image1", "image"), node("text1")],
            },
            "edges": [
                edge(
                    "edge1",
                    "image1",
                    "text1",
                    source_handle="imageOutput",
                    target_handle="textInput",
                )
            ],
        }
        self.assert_invalid(incompatible, "Incompatible connector types")

    def test_rejects_handle_not_exposed_by_selected_model(self):
        payload = {
            "data": {
                "nodes": [
                    node("videoSource", "video"),
                    node(
                        "videoTarget",
                        "video",
                        model="klingai/video-v2-6-pro-image-to-video",
                    ),
                ],
            },
            "edges": [
                edge(
                    "edge1",
                    "videoSource",
                    "videoTarget",
                    source_handle="videoOutput",
                    target_handle="videoInput7",
                )
            ],
        }
        self.assert_invalid(payload, "Unknown target handle")

    def test_accepts_reference_and_text_inputs_for_image_generation(self):
        payload = {
            "data": {
                "nodes": [
                    node("text1", model="text-passthrough"),
                    node(
                        "reference1",
                        "utility",
                        model="reference-images",
                    ),
                    node(
                        "image1",
                        "image",
                        model="google/nano-banana-2",
                    ),
                ],
            },
            "edges": [
                edge("edge1", "text1", "image1", target_handle="imageInput"),
                edge(
                    "edge2",
                    "reference1",
                    "image1",
                    source_handle="imageOutput",
                    target_handle="imageInput2",
                ),
            ],
        }

        _validate_workflow_graph(payload)


if __name__ == "__main__":
    unittest.main()
