const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createEdgeId,
  findRemovedEdges,
  getWorkflowConnectionListValues,
  getWorkflowConnectionValue,
  getModelInputProperties,
  getVideoInputHandles,
  hasScalarInputConflict,
  reconcileRemovedConnections,
  sanitizeWorkflowEdges,
  wouldCreateCycle,
} = require("../dist/components/connectionState");
const {
  getInputImageIdentity,
  sanitizeNodeIdentity,
} = require("../dist/components/nodeIdentity");

const edge = (id, source, target, targetHandle, sourceHandle = "output") => ({
  id,
  source,
  target,
  sourceHandle,
  targetHandle,
});

const source = (id, value) => ({ id, data: { resultUrl: value } });
const target = (id, type, formValues, taskData = {}) => ({ id, type, data: { formValues, taskData } });
const getValues = (node) => Array.isArray(node?.data?.resultUrl)
  ? node.data.resultUrl
  : node?.data?.resultUrl
    ? [node.data.resultUrl]
    : [];

test("input image identity uses a stable default and trims persisted metadata", () => {
  assert.deepEqual(getInputImageIdentity({}, "image12"), {
    label: "Input Image #12",
    description: "",
  });
  assert.deepEqual(getInputImageIdentity({
    node_label: "  Main character  ",
    node_description: "  Keep the red coat and round glasses  ",
  }, "image1"), {
    label: "Main character",
    description: "Keep the red coat and round glasses",
  });
});

test("input image identity is bounded before workflow persistence", () => {
  const identity = sanitizeNodeIdentity({
    label: `  ${"A".repeat(80)}  `,
    description: `  ${"B".repeat(220)}  `,
  });

  assert.equal(identity.node_label.length, 60);
  assert.equal(identity.node_description.length, 180);
  assert.equal(identity.node_label, "A".repeat(60));
  assert.equal(identity.node_description, "B".repeat(180));
});

test("findRemovedEdges detects removals independently of array identity", () => {
  const first = edge("a", "text1", "image1", "imageInput", "textOutput");
  const second = edge("b", "image1", "video1", "videoInput2", "imageOutput");
  assert.deepEqual(findRemovedEdges([first, second], [{ ...second }]), [first]);
});

test("clears a scalar field when its last connection is removed", () => {
  const removed = edge("a", "image1", "video1", "videoInput2", "imageOutput");
  const nodes = [source("image1", "image-a.png"), target("video1", "videoNode", {
    image_url: "image-a.png",
    duration: 5,
  })];

  const result = reconcileRemovedConnections(nodes, [], [removed], getValues);
  assert.equal(result[1].data.formValues.image_url, null);
  assert.equal(result[1].data.formValues.duration, 5);
});

test("recalculates a scalar field from the remaining connection", () => {
  const first = edge("a", "image1", "video1", "videoInput2", "imageOutput");
  const second = edge("b", "image2", "video1", "videoInput2", "imageOutput");
  const nodes = [
    source("image1", "image-a.png"),
    source("image2", "image-b.png"),
    target("video1", "videoNode", { image_url: "image-b.png" }),
  ];

  const result = reconcileRemovedConnections(nodes, [first], [second], getValues);
  assert.equal(result[2].data.formValues.image_url, "image-a.png");
});

test("rebuilds list fields and flattens reference node outputs", () => {
  const references = edge("a", "reference1", "image1", "imageInput2", "imageOutput");
  const single = edge("b", "image2", "image1", "imageInput2", "imageOutput");
  const nodes = [
    source("reference1", ["ref-a.png", "ref-b.png"]),
    source("image2", "image-c.png"),
    target("image1", "imageNode", { images_list: ["stale.png", "image-c.png"] }),
  ];

  const result = reconcileRemovedConnections(nodes, [references], [single], getValues);
  assert.deepEqual(result[2].data.formValues.images_list, ["ref-a.png", "ref-b.png"]);
});

test("clears audio and video list aliases", () => {
  const videoEdge = edge("a", "video1", "video2", "videoInput7", "videoOutput");
  const audioEdge = edge("b", "audio1", "video2", "videoInput8", "audioOutput");
  const nodes = [
    source("video1", "clip.mp4"),
    source("audio1", "track.mp3"),
    target("video2", "videoNode", { video_files: ["clip.mp4"], audio_files: ["track.mp3"] }),
  ];

  const result = reconcileRemovedConnections(nodes, [], [videoEdge, audioEdge], getValues);
  assert.deepEqual(result[2].data.formValues.video_files, []);
  assert.deepEqual(result[2].data.formValues.audio_files, []);
});

test("reconciles exposed API array fields by their real handle name", () => {
  const removed = edge("a", "image1", "api1", "reference_images", "imageOutput");
  const nodes = [
    source("image1", "image.png"),
    target("api1", "apiNode", { reference_images: ["image.png"], prompt: "manual" }, {
      reference_images: { type: "array" },
    }),
  ];

  const result = reconcileRemovedConnections(nodes, [], [removed], getValues);
  assert.deepEqual(result[1].data.formValues.reference_images, []);
  assert.equal(result[1].data.formValues.prompt, "manual");
});

test("video handles are derived strictly from the selected model schema", () => {
  const properties = {
    prompt: { type: "string" },
    image_url: { type: "string" },
    last_image: { type: "string" },
  };
  assert.deepEqual(getVideoInputHandles(properties, "video-model"), [
    "videoInput",
    "videoInput2",
    "videoInput3",
  ]);
});

test("video list aliases expose only their matching connectors", () => {
  const properties = {
    video_files: { type: "array" },
    audio_files: { type: "array" },
    images_list: { type: "array" },
  };
  assert.deepEqual(getVideoInputHandles(properties, "video-model"), [
    "videoInput6",
    "videoInput7",
    "videoInput8",
  ]);
});

test("passthrough and unknown video schemas expose no input handles", () => {
  assert.deepEqual(getVideoInputHandles({ prompt: {} }, "video-passthrough"), []);
  assert.deepEqual(getVideoInputHandles(null, "video-model"), []);
});

test("model properties can be resolved from backend and local model shapes", () => {
  const backendProperties = { prompt: { type: "string" } };
  const schemas = {
    categories: {
      video: {
        models: {
          modelA: {
            input_schema: { schemas: { input_data: { properties: backendProperties } } },
          },
        },
      },
    },
  };
  assert.equal(getModelInputProperties({ id: "modelA" }, schemas, "video"), backendProperties);

  const localProperties = { image_url: { type: "string" } };
  assert.equal(getModelInputProperties({
    id: "local",
    input_params: { properties: localProperties },
  }, {}, "video"), localProperties);
});

test("detects direct and indirect workflow cycles", () => {
  const edges = [
    edge("a", "nodeA", "nodeB", "input", "output"),
    edge("b", "nodeB", "nodeC", "input", "output"),
  ];
  assert.equal(wouldCreateCycle(edges, "nodeA", "nodeA"), true);
  assert.equal(wouldCreateCycle(edges, "nodeC", "nodeA"), true);
  assert.equal(wouldCreateCycle(edges, "nodeC", "nodeB"), true);
});

test("allows connections that keep the workflow acyclic", () => {
  const edges = [edge("a", "nodeA", "nodeB", "input", "output")];
  assert.equal(wouldCreateCycle(edges, "nodeA", "nodeC"), false);
  assert.equal(wouldCreateCycle(edges, "nodeB", "nodeC"), false);
  assert.equal(wouldCreateCycle(edges, "nodeC", "nodeA"), false);
});

test("rejects a second source on every scalar input handle", () => {
  const existing = [edge("a", "image1", "video1", "videoInput2", "imageOutput")];
  const connection = edge("b", "image2", "video1", "videoInput2", "imageOutput");
  const video = target("video1", "videoNode", { image_url: "image-a.png" });
  assert.equal(hasScalarInputConflict(existing, connection, video), true);
});

test("allows different scalar handles on the same target", () => {
  const existing = [edge("a", "image1", "video1", "videoInput2", "imageOutput")];
  const connection = edge("b", "image2", "video1", "videoInput3", "imageOutput");
  const video = target("video1", "videoNode", { image_url: "a.png", last_image: "b.png" });
  assert.equal(hasScalarInputConflict(existing, connection, video), false);
});

test("allows multiple sources on built-in list handles", () => {
  const existing = [edge("a", "reference1", "image1", "imageInput2", "imageOutput")];
  const connection = edge("b", "reference2", "image1", "imageInput2", "imageOutput");
  const image = target("image1", "imageNode", { images_list: [] });
  assert.equal(hasScalarInputConflict(existing, connection, image), false);
});

test("uses API field metadata to distinguish scalar and array handles", () => {
  const scalarExisting = [edge("a", "text1", "api1", "prompt", "textOutput")];
  const scalarConnection = edge("b", "text2", "api1", "prompt", "textOutput");
  const arrayExisting = [edge("c", "image1", "api1", "references", "imageOutput")];
  const arrayConnection = edge("d", "image2", "api1", "references", "imageOutput");
  const api = target("api1", "apiNode", { prompt: "", references: [] }, {
    prompt: { type: "string" },
    references: { type: "array" },
  });
  assert.equal(hasScalarInputConflict(scalarExisting, scalarConnection, api), true);
  assert.equal(hasScalarInputConflict(arrayExisting, arrayConnection, api), false);
});

test("removes disconnected values from every built-in list handle", () => {
  const cases = [
    { type: "textNode", handle: "textInput3", field: "images_list" },
    { type: "imageNode", handle: "imageInput2", field: "images_list" },
    { type: "videoNode", handle: "videoInput6", field: "images_list" },
    { type: "videoNode", handle: "videoInput7", field: "videos_list" },
    { type: "videoNode", handle: "videoInput8", field: "audios_list" },
    { type: "vidConcatNode", handle: "videoInput7", field: "videos_list" },
  ];

  cases.forEach(({ type, handle, field }, index) => {
    const targetId = `target${index}`;
    const first = edge(`first${index}`, "source1", targetId, handle, "output");
    const second = edge(`second${index}`, "source2", targetId, handle, "output");
    const nodes = [
      source("source1", "keep-value"),
      source("source2", "remove-value"),
      target(targetId, type, { [field]: ["keep-value", "remove-value"] }),
    ];

    const result = reconcileRemovedConnections(nodes, [first], [second], getValues);
    assert.deepEqual(result[2].data.formValues[field], ["keep-value"], `${type}:${handle}`);
  });
});

test("removes disconnected values from a dynamic API list handle", () => {
  const first = edge("a", "image1", "api1", "reference_images", "imageOutput");
  const second = edge("b", "image2", "api1", "reference_images", "imageOutput");
  const nodes = [
    source("image1", "keep.png"),
    source("image2", "remove.png"),
    target("api1", "apiNode", { reference_images: ["keep.png", "remove.png"] }, {
      reference_images: { type: "array" },
    }),
  ];

  const result = reconcileRemovedConnections(nodes, [first], [second], getValues);
  assert.deepEqual(result[2].data.formValues.reference_images, ["keep.png"]);
});

test("reference outputs become a flat workflow payload list", () => {
  const connection = edge("a", "reference1", "image1", "imageInput2", "imageOutput");
  const nodes = [{
    id: "reference1",
    type: "referenceNode",
    data: { resultUrl: ["ref-a.png", "ref-b.png"] },
  }];

  assert.deepEqual(
    getWorkflowConnectionListValues([connection], nodes, getValues),
    ["ref-a.png", "ref-b.png"],
  );
});

test("ordinary generated outputs remain dynamic workflow references", () => {
  const connection = edge("a", "image1", "video1", "videoInput6", "imageOutput");
  const imageNode = source("image1", "generated.png");
  imageNode.type = "imageNode";

  assert.equal(
    getWorkflowConnectionValue(connection, imageNode, getValues),
    "{{ image1.outputs[0].value }}",
  );
  assert.deepEqual(
    getWorkflowConnectionListValues([connection], [imageNode], getValues),
    ["{{ image1.outputs[0].value }}"],
  );
});

test("creates unique edge IDs for different handles on the same nodes", () => {
  const first = edge("", "video1", "video2", "videoInput2", "videoStartImageOutput");
  const second = edge("", "video1", "video2", "videoInput3", "videoEndImageOutput");
  assert.notEqual(createEdgeId(first, 0), createEdgeId(second, 0));
});

test("creates unique edge IDs for otherwise identical architect edges", () => {
  const connection = edge("", "text1", "image1", "imageInput", "textOutput");
  assert.notEqual(createEdgeId(connection, 0), createEdgeId(connection, 1));
});

test("removes restored edges that reference missing nodes", () => {
  const nodes = [
    target("text1", "textNode", { prompt: "" }),
    target("image1", "imageNode", { prompt: "" }),
  ];
  const edges = [
    edge("valid", "text1", "image1", "imageInput", "textOutput"),
    edge("dangling", "missing", "image1", "imageInput", "textOutput"),
  ];

  assert.deepEqual(sanitizeWorkflowEdges(nodes, edges).map(({ id }) => id), ["valid"]);
});

test("removes handles that are not exposed by the selected video model", () => {
  const selectedModel = {
    id: "image-to-video",
    input_schema: { properties: { prompt: {}, image_url: {} } },
  };
  const nodes = [
    target("image1", "imageNode", { prompt: "" }),
    {
      ...target("video1", "videoNode", { prompt: "", image_url: null }),
      data: { formValues: { prompt: "", image_url: null }, selectedModel },
    },
  ];
  const edges = [
    edge("image", "image1", "video1", "videoInput2", "imageOutput"),
    edge("audio", "image1", "video1", "videoInput5", "imageOutput"),
  ];

  assert.deepEqual(sanitizeWorkflowEdges(nodes, edges).map(({ id }) => id), ["image"]);
});

test("uses persisted video fields while remote schemas are still loading", () => {
  const nodes = [
    target("image1", "imageNode", { prompt: "" }),
    {
      ...target("video1", "videoNode", { prompt: "", image_url: null }),
      data: {
        formValues: { prompt: "", image_url: null },
        selectedModel: { id: "image-to-video" },
      },
    },
  ];
  const connection = edge(
    "image",
    "image1",
    "video1",
    "videoInput2",
    "imageOutput",
  );

  assert.equal(sanitizeWorkflowEdges(nodes, [connection]).length, 1);
});

test("removes duplicate scalar connections and workflow cycles", () => {
  const nodes = [
    target("text1", "textNode", { prompt: "" }),
    target("text2", "textNode", { prompt: "", image_url: null }),
    target("image1", "imageNode", { prompt: "" }),
  ];
  const edges = [
    edge("first", "text1", "image1", "imageInput", "textOutput"),
    edge("second", "text2", "image1", "imageInput", "textOutput"),
    edge("forward", "image1", "text2", "textInput2", "imageOutput"),
    edge("cycle", "text2", "text1", "textInput", "textOutput"),
  ];

  assert.deepEqual(
    sanitizeWorkflowEdges(nodes, edges).map(({ id }) => id),
    ["first", "forward"],
  );
});

test("preserves multiple compatible sources on list handles", () => {
  const nodes = [
    target("reference1", "referenceNode", { images_list: ["a.png"] }),
    target("reference2", "referenceNode", { images_list: ["b.png"] }),
    target("image1", "imageNode", { prompt: "", images_list: [] }),
  ];
  const edges = [
    edge("first", "reference1", "image1", "imageInput2", "imageOutput"),
    edge("second", "reference2", "image1", "imageInput2", "imageOutput"),
  ];

  assert.equal(sanitizeWorkflowEdges(nodes, edges).length, 2);
});

test("repairs duplicate edge IDs without losing valid connections", () => {
  const nodes = [
    target("text1", "textNode", { prompt: "" }),
    target("image1", "imageNode", { prompt: "", images_list: [] }),
  ];
  const edges = [
    edge("duplicate", "text1", "image1", "imageInput", "textOutput"),
    edge("duplicate", "image1", "image1", "imageInput2", "imageOutput"),
  ];
  edges[1].source = "reference1";
  nodes.push(target("reference1", "referenceNode", { images_list: [] }));

  const result = sanitizeWorkflowEdges(nodes, edges);
  assert.equal(result.length, 2);
  assert.equal(new Set(result.map(({ id }) => id)).size, 2);
});

test("normalizes legacy prompt edges that omitted explicit handles", () => {
  const nodes = [
    target("text1", "textNode", { prompt: "" }),
    target("image1", "imageNode", { prompt: "" }),
  ];
  const legacyEdge = { id: "legacy", source: "text1", target: "image1" };

  assert.deepEqual(sanitizeWorkflowEdges(nodes, [legacyEdge]), [{
    ...legacyEdge,
    sourceHandle: "textOutput",
    targetHandle: "imageInput",
  }]);
});
