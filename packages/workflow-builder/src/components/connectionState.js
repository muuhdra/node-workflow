const HANDLE_FIELDS = {
  textInput: "prompt",
  textInput2: "image_url",
  textInput3: "images_list",
  textInput4: "system_prompt",
  imageInput: "prompt",
  imageInput2: "images_list",
  imageInput3: "image_url",
  videoInput: "prompt",
  videoInput2: "image_url",
  videoInput3: "last_image",
  videoInput4: "video_url",
  videoInput5: "audio_url",
  videoInput6: "images_list",
  audioInput: "audio_url",
  audioInput2: "prompt",
  audioInput3: "image_url",
  audioInput4: "video_url",
  concatInput: "prompt",
  apiInput: "prompt",
  apiInput2: "images",
  apiInput3: "image",
};

const LIST_HANDLES = new Set([
  "textInput3",
  "imageInput2",
  "videoInput6",
  "videoInput7",
  "videoInput8",
  "apiInput2",
]);

const VIDEO_HANDLE_FIELDS = [
  ["videoInput", ["prompt"]],
  ["videoInput2", ["image_url"]],
  ["videoInput3", ["last_image"]],
  ["videoInput4", ["video_url"]],
  ["videoInput5", ["audio_url"]],
  ["videoInput6", ["images_list"]],
  ["videoInput7", ["videos_list", "video_files"]],
  ["videoInput8", ["audios_list", "audio_files"]],
];

const SOURCE_HANDLES = {
  textNode: ["textOutput"],
  imageNode: ["imageOutput"],
  referenceNode: ["imageOutput"],
  videoNode: [
    "videoStartImageOutput",
    "videoEndImageOutput",
    "videoOutput",
    "videoAudioOutput",
  ],
  audioNode: ["audioOutput"],
  apiNode: ["apiOutput"],
  concatNode: ["concatOutput"],
  vidConcatNode: ["videoOutput"],
};

const DEFAULT_SOURCE_HANDLES = Object.fromEntries(
  Object.entries(SOURCE_HANDLES).map(([type, handles]) => [type, handles[0]]),
);

const DEFAULT_TARGET_HANDLES = {
  textNode: "textInput",
  imageNode: "imageInput",
  videoNode: "videoInput",
  audioNode: "audioInput2",
  apiNode: "apiInput",
  concatNode: "concatInput",
  vidConcatNode: "videoInput7",
};

const HANDLE_COLORS = {
  textOutput: "blue",
  concatOutput: "blue",
  imageOutput: "green",
  videoStartImageOutput: "green",
  videoEndImageOutput: "green",
  videoOutput: "orange",
  videoAudioOutput: "yellow",
  audioOutput: "yellow",
  textInput: "blue",
  textInput2: "green",
  textInput3: "green",
  textInput4: "blue",
  imageInput: "blue",
  imageInput2: "green",
  imageInput3: "green",
  videoInput: "blue",
  videoInput2: "green",
  videoInput3: "green",
  videoInput4: "orange",
  videoInput5: "yellow",
  videoInput6: "green",
  videoInput7: "orange",
  videoInput8: "yellow",
  audioInput: "yellow",
  audioInput2: "blue",
  audioInput3: "green",
  audioInput4: "orange",
  concatInput: "blue",
  apiInput: "blue",
  apiInput2: "green",
  apiInput3: "green",
};

export const getModelInputProperties = (selectedModel, nodeSchemas, category) => {
  if (!selectedModel?.id) return null;
  const backendModel = nodeSchemas?.categories?.[category]?.models?.[selectedModel.id];
  return backendModel?.input_schema?.schemas?.input_data?.properties
    || backendModel?.input_schema?.properties
    || selectedModel?.input_schema?.schemas?.input_data?.properties
    || selectedModel?.input_schema?.properties
    || selectedModel?.input_params?.properties
    || null;
};

export const getVideoInputHandles = (properties, modelId = "") => {
  if (!properties || modelId.includes("passthrough")) return [];
  return VIDEO_HANDLE_FIELDS
    .filter(([, fields]) => fields.some((field) => Object.prototype.hasOwnProperty.call(properties, field)))
    .map(([handle]) => handle);
};

export const wouldCreateCycle = (edges, source, target) => {
  if (!source || !target || source === target) return true;
  const adjacency = edges.reduce((graph, edge) => ({
    ...graph,
    [edge.source]: [...(graph[edge.source] || []), edge.target],
  }), {});

  const hasPath = (current, destination, visited = new Set()) => {
    if (current === destination) return true;
    if (visited.has(current)) return false;
    const nextVisited = new Set([...visited, current]);
    return (adjacency[current] || []).some(
      (nextNode) => hasPath(nextNode, destination, nextVisited),
    );
  };

  return hasPath(target, source);
};

const edgeKey = (edge) => [
  edge.id || "",
  edge.source || "",
  edge.sourceHandle || "",
  edge.target || "",
  edge.targetHandle || "",
].join("::");

export const createEdgeId = (edge, index = 0, prefix = "edge") => [
  prefix,
  edge.source || "source",
  edge.sourceHandle || "output",
  edge.target || "target",
  edge.targetHandle || "input",
  index,
].map((part) => encodeURIComponent(String(part))).join("__");

export const findRemovedEdges = (previousEdges = [], currentEdges = []) => {
  const currentCounts = currentEdges.reduce((counts, edge) => {
    const key = edgeKey(edge);
    return { ...counts, [key]: (counts[key] || 0) + 1 };
  }, {});

  return previousEdges.reduce(({ counts, removed }, edge) => {
    const key = edgeKey(edge);
    if (!counts[key]) return { counts, removed: [...removed, edge] };
    return {
      counts: { ...counts, [key]: counts[key] - 1 },
      removed,
    };
  }, { counts: currentCounts, removed: [] }).removed;
};

const getTargetField = (node, handle) => {
  const formValues = node?.data?.formValues || {};
  if (handle === "videoInput7") {
    return Object.prototype.hasOwnProperty.call(formValues, "video_files")
      ? "video_files"
      : "videos_list";
  }
  if (handle === "videoInput8") {
    return Object.prototype.hasOwnProperty.call(formValues, "audio_files")
      ? "audio_files"
      : "audios_list";
  }
  if (node?.type === "apiNode" && !HANDLE_FIELDS[handle]) return handle;
  return HANDLE_FIELDS[handle] || null;
};

const isListField = (node, handle, field) => {
  if (handle === "concatInput" || LIST_HANDLES.has(handle)) return true;
  if (Array.isArray(node?.data?.formValues?.[field])) return true;
  return node?.type === "apiNode" && node?.data?.taskData?.[handle]?.type === "array";
};

export const hasScalarInputConflict = (edges, connection, targetNode) => {
  const field = getTargetField(targetNode, connection.targetHandle);
  if (!field || isListField(targetNode, connection.targetHandle, field)) return false;
  return edges.some(
    (edge) => edge.target === connection.target
      && edge.targetHandle === connection.targetHandle,
  );
};

const handlesForFields = (formValues, fields) => fields
  .filter(([, field]) => Object.prototype.hasOwnProperty.call(formValues, field))
  .map(([handle]) => handle);

const getValidTargetHandles = (node, nodeSchemas) => {
  const formValues = node?.data?.formValues || {};
  switch (node?.type) {
    case "textNode":
      return handlesForFields(formValues, [
        ["textInput", "prompt"],
        ["textInput2", "image_url"],
        ["textInput3", "images_list"],
        ["textInput4", "system_prompt"],
      ]);
    case "imageNode":
      return handlesForFields(formValues, [
        ["imageInput", "prompt"],
        ["imageInput2", "images_list"],
        ["imageInput3", "image_url"],
      ]);
    case "videoNode": {
      const selectedModel = node.data?.selectedModel;
      const properties = getModelInputProperties(selectedModel, nodeSchemas, "video");
      if (!properties && !selectedModel?.id?.includes("passthrough")) {
        return handlesForFields(formValues, VIDEO_HANDLE_FIELDS.flatMap(
          ([handle, fields]) => fields.map((field) => [handle, field]),
        ));
      }
      return getVideoInputHandles(properties, selectedModel?.id || "");
    }
    case "audioNode":
      return handlesForFields(formValues, [
        ["audioInput", "audio_url"],
        ["audioInput2", "prompt"],
        ["audioInput3", "image_url"],
        ["audioInput4", "video_url"],
      ]);
    case "apiNode": {
      const exposedHandles = node.data?.exposedHandles || [];
      const taskHandles = Object.keys(node.data?.taskData || {});
      const persistedHandles = Object.keys(formValues);
      return [...new Set([...exposedHandles, ...taskHandles, ...persistedHandles])]
        .filter((handle) => handle !== "apiOutput");
    }
    case "concatNode":
      return ["concatInput"];
    case "vidConcatNode":
      return ["videoInput7"];
    default:
      return [];
  }
};

const getApiOutputColor = (node) => {
  const output = node?.data?.outputs?.[0];
  const modelType = node?.data?.formValues?.model_type;
  if (output?.type === "text" || modelType === "chat") return "blue";
  if (output?.type === "video_url" || modelType === "video") return "orange";
  if (output?.type === "audio_url" || modelType === "audio") return "yellow";
  return "green";
};

const connectionTuple = (edge) => [
  edge.source,
  edge.sourceHandle,
  edge.target,
  edge.targetHandle,
].join("::");

const withUniqueEdgeId = (edge, index, usedIds) => {
  if (edge.id && !usedIds.has(edge.id)) return edge;
  let attempt = 0;
  let id = createEdgeId(edge, index, "sanitized");
  while (usedIds.has(id)) {
    attempt += 1;
    id = createEdgeId(edge, `${index}-${attempt}`, "sanitized");
  }
  return { ...edge, id };
};

export const sanitizeWorkflowEdges = (nodes = [], edges = [], nodeSchemas = {}) => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  return edges.reduce((state, rawEdge, index) => {
    if (!rawEdge || typeof rawEdge !== "object") return state;
    const sourceNode = nodeMap.get(rawEdge.source);
    const targetNode = nodeMap.get(rawEdge.target);
    if (!sourceNode || !targetNode) return state;

    const sourceHandle = rawEdge.sourceHandle && rawEdge.sourceHandle !== "output"
      ? rawEdge.sourceHandle
      : DEFAULT_SOURCE_HANDLES[sourceNode.type];
    const targetHandle = rawEdge.targetHandle && rawEdge.targetHandle !== "prompt"
      ? rawEdge.targetHandle
      : DEFAULT_TARGET_HANDLES[targetNode.type];
    if (!sourceHandle || !targetHandle) return state;

    const edge = { ...rawEdge, sourceHandle, targetHandle };
    if (!(SOURCE_HANDLES[sourceNode.type] || []).includes(sourceHandle)) return state;
    if (!getValidTargetHandles(targetNode, nodeSchemas).includes(targetHandle)) return state;

    const sourceColor = sourceHandle === "apiOutput"
      ? getApiOutputColor(sourceNode)
      : HANDLE_COLORS[sourceHandle];
    const targetColor = targetNode.type === "apiNode" ? "white" : HANDLE_COLORS[targetHandle];
    if (!sourceColor || !targetColor || (targetColor !== "white" && sourceColor !== targetColor)) {
      return state;
    }

    const tuple = connectionTuple(edge);
    if (state.connectionKeys.has(tuple)) return state;
    if (hasScalarInputConflict(state.edges, edge, targetNode)) return state;
    if (wouldCreateCycle(state.edges, edge.source, edge.target)) return state;

    const uniqueEdge = withUniqueEdgeId(edge, index, state.edgeIds);
    return {
      edges: [...state.edges, uniqueEdge],
      edgeIds: new Set([...state.edgeIds, uniqueEdge.id]),
      connectionKeys: new Set([...state.connectionKeys, tuple]),
    };
  }, {
    edges: [],
    edgeIds: new Set(),
    connectionKeys: new Set(),
  }).edges;
};

const uniqueValues = (values) => values.reduce(
  (items, value) => items.includes(value) ? items : [...items, value],
  [],
);

export const getWorkflowConnectionValue = (connection, sourceNode, getSourceValues) => {
  const sourceHandle = connection?.sourceHandle;
  if (sourceNode?.type === "referenceNode") {
    return getSourceValues(sourceNode, {}, sourceHandle);
  }

  const isVideoPassthroughOutput = sourceNode?.type === "videoNode" && [
    "videoStartImageOutput",
    "videoEndImageOutput",
    "videoAudioOutput",
  ].includes(sourceHandle);
  if (isVideoPassthroughOutput) {
    const value = getSourceValues(sourceNode, {}, sourceHandle)[0];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }

  return `{{ ${connection.source}.outputs[0].value }}`;
};

export const getWorkflowConnectionListValues = (connections, nodes, getSourceValues) => uniqueValues(
  connections.flatMap((connection) => {
    const sourceNode = nodes.find((node) => node.id === connection.source);
    const value = getWorkflowConnectionValue(connection, sourceNode, getSourceValues);
    return Array.isArray(value) ? value : [value];
  }).filter((value) => typeof value === "string" && value.trim() !== ""),
);

export const reconcileRemovedConnections = (
  nodes,
  currentEdges,
  removedEdges,
  getSourceValues,
) => {
  const affectedHandles = uniqueValues(
    removedEdges
      .filter((edge) => edge.target && edge.targetHandle)
      .map((edge) => `${edge.target}::${edge.targetHandle}`),
  );

  if (affectedHandles.length === 0) return nodes;

  return nodes.map((node) => {
    const handles = affectedHandles
      .filter((key) => key.startsWith(`${node.id}::`))
      .map((key) => key.slice(node.id.length + 2));
    if (handles.length === 0) return node;

    const nextFormValues = handles.reduce((formValues, handle) => {
      const field = getTargetField(node, handle);
      if (!field) return formValues;

      const remainingEdges = currentEdges.filter(
        (edge) => edge.target === node.id && edge.targetHandle === handle,
      );
      const values = uniqueValues(remainingEdges.flatMap((edge) => {
        const sourceNode = nodes.find((candidate) => candidate.id === edge.source);
        return getSourceValues(sourceNode, {}, edge.sourceHandle);
      }));

      if (handle === "concatInput") {
        return { ...formValues, [field]: values.join(" ").trim() };
      }
      if (isListField(node, handle, field)) {
        return { ...formValues, [field]: values };
      }

      const emptyValue = ["prompt", "system_prompt"].includes(field) ? "" : null;
      return { ...formValues, [field]: values[values.length - 1] ?? emptyValue };
    }, { ...(node.data?.formValues || {}) });

    return {
      ...node,
      data: {
        ...node.data,
        formValues: nextFormValues,
      },
    };
  });
};
