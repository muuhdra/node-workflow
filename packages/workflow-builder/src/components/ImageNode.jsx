import React, { useEffect, useMemo, useRef, useState } from "react";
import { Handle, Position, useReactFlow, useStore, useUpdateNodeInternals } from "reactflow";
import { FaAngleDown, FaAngleLeft, FaAngleRight } from "react-icons/fa6";
import { getRunId, getWorkflowId } from "./WorkflowStore";
import axios from "axios";
import { toast } from "react-hot-toast";
import { IoCheckmark, IoClose, IoImageOutline, IoPencilOutline, IoPlay, IoSettingsOutline, IoTrashOutline } from "react-icons/io5";
import UploadNode from "./UploadNode";
import NodeSendButton from "./NodeSendButton";
import NodeOptionsMenu from "./NodeOptionsMenu";
import { useGenerationCost } from "./useGenerationCost";
import { getInputImageIdentity, sanitizeNodeIdentity } from "./nodeIdentity";

const inputHandles = [
  "imageInput",
  "imageInput2",
  "imageInput3",
];

const outputHandles = [
  "imageOutput",
];

const ImageGeneration = ({ id, data, selected }) => {
  const models = useMemo(() => {
    const schemaModels = data.nodeSchemas?.categories?.image?.models
      ? Object.entries(data.nodeSchemas.categories.image.models).map(([modelId, model]) => ({
        ...model,
        id: model.id || modelId,
      }))
      : [];

    return schemaModels;
  }, [data.nodeSchemas]);
  
  const [selectedModel, setSelectedModel] = useState(data.selectedModel || models[1] || models[0] || {});
  const [connectedInputs, setConnectedInputs] = useState({});
  const [connectedOutputs, setConnectedOutputs] = useState({});
  const [formValues, setFormValues] = useState(data.formValues || {});
  const [isIdentityEditing, setIsIdentityEditing] = useState(false);
  const [identityDraft, setIdentityDraft] = useState(() => getInputImageIdentity(data.formValues, id));
  const [dropDown, setDropDown] = useState(0);
  const [loading, setLoading] = useState(0);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageMetadata, setImageMetadata] = useState({ width: 0, height: 0, size: null });
  const outputHistory = data.outputHistory || [];
  const prevHistoryLengthRef = useRef(outputHistory.length);
  const resumedRunRef = useRef(null);
  const workflowId = getWorkflowId();
  const runId = data.runId ?? getRunId();
  const nodeSchemas = data.nodeSchemas || {};
  const { setNodes, setEdges } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const edges = useStore((state) => state.edges);
  const properties = nodeSchemas?.categories?.image?.models?.[selectedModel.id]?.input_schema?.schemas?.input_data?.properties;
  const { generationCost, isRefreshingCost } = useGenerationCost(selectedModel, formValues);
  
  useEffect(() => {
    if (data.cost !== generationCost) {
      data.onDataChange?.(id, { cost: generationCost });
    }
  }, [id, generationCost, data.cost]);

  const initializeFormData = (schemaProperties) => {
    const initialData = {};
    const fieldEntries = Object.entries(schemaProperties || {});

    fieldEntries.forEach(([fieldName, fieldSchema]) => {
      if (fieldName === "prompt") {
        initialData[fieldName] = "";
        return;
      }

      if (fieldSchema.type === "array") {
        if (fieldSchema.items?.type === "object") {
          const examples = fieldSchema.examples;
          if (Array.isArray(examples) && examples.length > 0) {
            initialData[fieldName] = examples.map((ex) => ({ ...ex }));
          } else {
            initialData[fieldName] = [];
          }
        } else {
          initialData[fieldName] = fieldSchema.examples || [];
        }

      } else if (fieldSchema.type === "object") {
        const nestedProps = fieldSchema.properties || {};
        initialData[fieldName] = initializeFormData(nestedProps);

      } else if (fieldSchema.default !== undefined) {
        initialData[fieldName] = fieldSchema.default;

      } else if (fieldSchema.examples && fieldSchema.examples.length > 0) {
        initialData[fieldName] = fieldSchema.examples[0];

      } else {
        switch (fieldSchema.type) {
          case "boolean":
            initialData[fieldName] = false;
            break;
          case "int":
          case "number":
            initialData[fieldName] = 0;
            break;
          default:
            initialData[fieldName] = "";
        }
      }
    });

    return initialData;
  };

  const addFormValuesInTaskData = (properties) => {
    const defaults = initializeFormData(properties);

    const validKeys = Object.keys(properties);
    const filteredFormValues = Object.entries(data.formValues || {}).reduce((acc, [key, val]) => {
      if (validKeys.includes(key)) acc[key] = val;
      return acc;
    }, {});

    const merged = Object.entries({ ...defaults, ...filteredFormValues }).reduce(
      (acc, [key, val]) => {
        const meta = properties[key];
        if (meta?.enum && !meta.enum.includes(val)) {
          acc[key] = meta.default ?? meta.enum[0] ?? "";
        } else {
          acc[key] = val;
        }
        return acc;
      },
      {}
    );

    // Preserve UI-only flags that are not part of the model schema
    const UI_KEYS = ["make_output", "make_input", "node_label", "node_description"];
    UI_KEYS.forEach((k) => {
      if (data.formValues?.[k] !== undefined) merged[k] = data.formValues[k];
    });

    setFormValues(merged);
  };

  useEffect(() => {
    setLoading(1);
    if (properties) {
      addFormValuesInTaskData(properties);
    }
    setLoading(0);
  }, [selectedModel]);

  useEffect(() => {
    if (data.selectedModel) {
      setSelectedModel(data.selectedModel);
    }

    if (data.triggerRun) {
      handleRunSingleNode();
      data.onDataChange(id, { triggerRun: false });
    }

    if (data.outputHistory && data.outputHistory.length > 0) {
      if (currentHistoryIndex === -1) {
        setCurrentHistoryIndex(data.outputHistory.length - 1);
        setCurrentImageIndex(0);
      } else if (data.outputHistory.length > prevHistoryLengthRef.current) {
        setCurrentHistoryIndex(data.outputHistory.length - 1);
        setCurrentImageIndex(0);
      }
    }
    prevHistoryLengthRef.current = data.outputHistory ? data.outputHistory.length : 0;
  }, [data.selectedModel, data.triggerRun, data.outputHistory]);

  useEffect(() => {
    updateNodeInternals(id);
  }, [formValues, id]);

  const handleChange = (key, value) => {
    setFormValues(prev => ({ ...prev, [key]: value }));
    setDropDown(-1);
  };

  useEffect(() => {
    if (!data.formValues) return;
    const incoming = JSON.stringify(data.formValues);
    const current = JSON.stringify(formValues);
    if (incoming === current) return;
    
    const timer = setTimeout(() => {
      if (Object.entries(data.formValues || {}).length > 0) {
        setFormValues(data.formValues);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [data.formValues]);

  useEffect(() => {
    if (data?.onDataChange && data?.selectedModel?.id !== "image-passthrough") {
      data.onDataChange(id, { selectedModel, formValues, loading });
    }
  }, [selectedModel, formValues, loading]);
  
  const pollNodeStatus = (run_id) => {
    const interval = setInterval(() => {
      axios.get(`/api/workflow/run/${run_id}/status`)
      .then((response) => {
        const nodesInRes = response.data.nodes || {};
        const nodeData = nodesInRes[id] || Object.entries(nodesInRes).find(([key]) => 
          key.toLowerCase().replace(/\s+/g, '') === id.toLowerCase().replace(/\s+/g, '')
        )?.[1];
        if (!nodeData || nodeData.length === 0) return;
        const latest = nodeData[nodeData.length - 1];
        if (latest.status === "succeeded" || latest.status === "completed") {
          const output = latest.result.outputs;
          const val = output[0]?.value || "";
          
          const currentHistory = data.outputHistory || [];
          const result = latest.result;
          const isAlreadyInHistory = currentHistory.some(h => h.result?.id === result.id);
          const newHistory = isAlreadyInHistory 
            ? currentHistory.map(h => h.result?.id === result.id ? latest : h)
            : [...currentHistory, latest];

          data?.onDataChange?.(id, { outputs: output, resultUrl: val, isLoading: false, errorMsg: null, outputHistory: newHistory });
          setCurrentHistoryIndex(newHistory.length - 1);
          setCurrentImageIndex(0);
          clearInterval(interval);
        }

        if (latest.status === "failed") {
          const outputs = latest?.result?.outputs;
          let errorMsg = "Generation failed";

          if (outputs && outputs[0]?.value?.error) {
            errorMsg = outputs[0].value.error; 
          }
          toast.error(`Node ${id} failed`);
          
          const currentHistory = data.outputHistory || [];
          data.onDataChange(id, { isLoading: false, errorMsg, outputHistory: currentHistory });
          clearInterval(interval);
        }
      })
      .catch((error) => {
        console.log(error);
        clearInterval(interval);
        data.onDataChange(id, { isLoading: false });
        toast.error(`Failed to get workflow status Image ${id.replace(/^\D+/g, "")}`);
      });
    }, 3000);
  };

  useEffect(() => {
    if (!data.isLoading || !runId || resumedRunRef.current === runId) return;
    resumedRunRef.current = runId;
    pollNodeStatus(runId);
  }, [data.isLoading, runId]);

  const handleRunSingleNode = async () => {
    try {
      data.onDataChange(id, { isLoading: true });
      const workflow_id = await data.handleSaveWorkFlow();

      if (!workflow_id) {
        toast.error("Failed to save workflow before running node");
        data.onDataChange(id, { isLoading: false });
        return;
      }

      const modelSchema = nodeSchemas?.categories?.image?.models[selectedModel.id]?.input_schema?.schemas?.input_data;
      if (!modelSchema || !modelSchema.properties) {
        toast.error("No input schema found for this model");
        data.onDataChange(id, { isLoading: false });
        return;
      }
      const params = {};
      const inputSchema = modelSchema.properties;
      const localSources = formValues || {};
      for (const [key, meta] of Object.entries(inputSchema)) {
        if (localSources.hasOwnProperty(key)) {
          params[key] = localSources[key];
        } else {
          params[key] = meta.default ?? null;
        }
      }

      const response = await axios.post(`/api/workflow/${workflow_id}/node/${id}/run`, {
        run_id: runId,
        model: selectedModel.id,
        params: params,
        cost: generationCost,
        node_id: "AI Image"
      });
      pollNodeStatus(response.data.run_id);
    } catch(error) {
      data.onDataChange(id, { isLoading: false });
      const detail = error.response?.data?.detail || "Error running node";
      toast.error(detail);
      console.warn("Image generation failed", {
        status: error.response?.status,
        detail,
        model: selectedModel.id,
      });
    };
  };

  const handleDeleteNode = () => {
    if (window.confirm(`Are you sure you want to delete this ${id} node?`)) {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      toast.success(`Deleted node ${id}`);
    };
  };

  const currentModelId = selectedModel?.id || data.selectedModel?.id || "";
  const isGeneratorModel = !currentModelId.includes("passthrough");
  const inputImageIdentity = useMemo(
    () => getInputImageIdentity(formValues, id),
    [formValues, id]
  );
  const hasPrompt = isGeneratorModel && (properties ? "prompt" in properties : true);
  const hasImagesList = isGeneratorModel && (properties ? "images_list" in properties : true);
  const hasImageUrl = isGeneratorModel && (properties ? "image_url" in properties : false);

  useEffect(() => {
    if (!isIdentityEditing) setIdentityDraft(inputImageIdentity);
  }, [inputImageIdentity.label, inputImageIdentity.description, isIdentityEditing]);

  const openIdentityEditor = (event) => {
    event.stopPropagation();
    setIdentityDraft(inputImageIdentity);
    setIsIdentityEditing(true);
  };

  const closeIdentityEditor = (event) => {
    event.stopPropagation();
    setIdentityDraft(inputImageIdentity);
    setIsIdentityEditing(false);
  };

  const saveIdentity = (event) => {
    event.stopPropagation();
    const identity = sanitizeNodeIdentity(identityDraft);
    setFormValues((current) => ({ ...current, ...identity }));
    setIsIdentityEditing(false);
  };

  useEffect(() => {
    if (!isGeneratorModel) return;

    setFormValues((prev) => {
      const defaults = {
        prompt: "",
        images_list: [],
        num_outputs: 1,
        aspect_ratio: "1:1",
      };
      const hasMissingDefault = Object.keys(defaults).some((key) => !(key in prev));
      return hasMissingDefault ? { ...defaults, ...prev } : prev;
    });
  }, [isGeneratorModel, properties]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const validHandles = [
        hasPrompt && "imageInput",
        hasImageUrl && "imageInput3",
        hasImagesList && "imageInput2",
      ].filter(Boolean);

      setEdges((prevEdges) =>
        prevEdges.filter((edge) => {
          if (edge.target !== id) return true;
          return validHandles.includes(edge.targetHandle);
        })
      );
    }, 2000);
    return () => clearTimeout(timeout);
  }, [hasPrompt, hasImageUrl, hasImagesList, id, setEdges]);

  useEffect(() => {
    const connectedInputs = {};
    inputHandles.forEach((h) => {
      connectedInputs[h] = edges.some(
        (e) => e.target === id && e.targetHandle === h
      );
    });

    const connectedOutputs = {};
    outputHandles.forEach((h) => {
      connectedOutputs[h] = edges.some(
        (e) => e.source === id && e.sourceHandle === h
      );
    });

    setConnectedInputs(connectedInputs);
    setConnectedOutputs(connectedOutputs);
  }, [edges, id]);

  const handlePrev = (e) => {
    e.stopPropagation();
    if (currentHistoryIndex > 0) {
      const newIndex = currentHistoryIndex - 1;
      setCurrentHistoryIndex(newIndex);
      setCurrentImageIndex(0);
      const viewing = outputHistory[newIndex]?.result?.outputs?.[0]?.value;
      setNodes((nds) => nds.map((n) => {
        if (n.id === id) {
          return { ...n, data: { ...n.data, viewingOutput: viewing } };
        }
        return n;
      }));
    }
  };

  const handleNext = (e) => {
    e.stopPropagation();
    if (currentHistoryIndex < outputHistory.length - 1) {
      const newIndex = currentHistoryIndex + 1;
      setCurrentHistoryIndex(newIndex);
      setCurrentImageIndex(0);
      const viewing = outputHistory[newIndex]?.result?.outputs?.[0]?.value;
      setNodes((nds) => nds.map((n) => {
        if (n.id === id) {
          return { ...n, data: { ...n.data, viewingOutput: viewing } };
        }
        return n;
      }));
    }
  };

  const handleDeleteHistory = async (e) => {
    e.stopPropagation();
    const currentHistory = outputHistory[currentHistoryIndex];
    if (!currentHistory || !currentHistory.node_run_id) return;

    if (window.confirm("Are you sure you want to delete this history entry?")) {
      try {
        await axios.delete(`/api/workflow/node-run/${currentHistory.node_run_id}`);
        const newHistory = outputHistory.filter((_, i) => i !== currentHistoryIndex);
        
        data?.onDataChange?.(id, { 
          outputHistory: newHistory,
          ...(newHistory.length === 0 ? { outputs: [], resultUrl: null } : {})
        });

        if (newHistory.length === 0) {
          setCurrentHistoryIndex(-1);
        } else {
          setCurrentHistoryIndex(Math.max(0, currentHistoryIndex - 1));
        }
        toast.success("History entry deleted");
      } catch (error) {
        toast.error(error.response?.data?.detail || "Failed to delete history entry");
        console.error(error);
      }
    }
  };

  const currentOutputList = currentHistoryIndex !== -1 && outputHistory[currentHistoryIndex]
    ? outputHistory[currentHistoryIndex]?.result?.outputs || []
    : (data.outputs || []);

  const currentOutput = currentOutputList.length > 0
    ? currentOutputList[currentImageIndex]?.value || currentOutputList[0]?.value || data.resultUrl
    : data.resultUrl;

  useEffect(() => {
    if (currentOutput) {
      const img = new Image();
      img.onload = () => {
        setImageMetadata(prev => ({ 
          ...prev, 
          width: img.naturalWidth, 
          height: img.naturalHeight 
        }));
      };
      img.src = currentOutput;
      
      fetch(currentOutput, { method: 'HEAD' })
        .then(res => {
          const size = res.headers.get('content-length');
          if (size) {
            const sizeInMB = (parseInt(size) / (1024 * 1024)).toFixed(2);
            setImageMetadata(prev => ({ ...prev, size: sizeInMB + ' MB' }));
          } else {
            setImageMetadata(prev => ({ ...prev, size: null }));
          }
        })
        .catch(() => {
          setImageMetadata(prev => ({ ...prev, size: null }));
        });
    } else {
      setImageMetadata({ width: 0, height: 0, size: null });
    }
  }, [currentOutput]);

  const updateWorkflowThumbnail = async (thumbnail) => {
    const workflow_id = await data.handleSaveWorkFlow();
    if (!workflow_id) {
      toast.error("Workflow id not found");
      return;
    }

    if (!thumbnail) {
      toast.error("Thumbnail URL is required");
      return;
    }
    try { 
      const response = await axios.post(`/api/workflow/${workflow_id}/thumbnail`, { 
        thumbnail 
      });
      if (response.data.success) toast.success("Cover image updated successfully");
    } catch(error) {
      toast.error(error.response?.data?.detail || "Failed to save thumbnail");
      console.error(error);
    };
  };

  const getFirstField = (...keys) => keys.find((key) => properties && key in properties);
  const countKey = getFirstField("num_outputs", "num_images", "n", "batch_size") || "num_outputs";
  const aspectRatioKey = getFirstField("aspect_ratio", "ratio", "size") || "aspect_ratio";
  const widthKey = getFirstField("width");
  const heightKey = getFirstField("height");
  const promptValue = formValues.prompt || "";
  const countValue = Number(formValues[countKey] || properties?.[countKey]?.default || 1);
  const aspectRatioOptions = properties?.[aspectRatioKey]?.enum || ["1:1", "16:9", "9:16", "4:3", "3:4"];
  const aspectRatioValue = formValues[aspectRatioKey] || (
    formValues[widthKey] && formValues[heightKey]
      ? `${formValues[widthKey] === formValues[heightKey] ? "1:1" : "custom"}`
      : properties?.[aspectRatioKey]?.default || "1:1"
  );
  const isAspectMenuOpen = dropDown === "aspect";
  const hasAspectControl = Boolean(
    getFirstField("aspect_ratio", "ratio", "size") || (widthKey && heightKey)
  );
  const stopNodeDrag = (event) => event.stopPropagation();
  const changeCount = (delta) => {
    handleChange(countKey, Math.min(10, Math.max(1, countValue + delta)));
  };
  const setAspectValue = (value) => {
    if (properties?.[aspectRatioKey]) {
      handleChange(aspectRatioKey, value);
      return;
    }

    if (widthKey && heightKey) {
      const dimensions = {
        "1:1": [1024, 1024],
        "16:9": [1344, 768],
        "9:16": [768, 1344],
        "4:3": [1152, 896],
        "3:4": [896, 1152],
      }[value] || [1024, 1024];
      setFormValues((prev) => ({ ...prev, [widthKey]: dimensions[0], [heightKey]: dimensions[1] }));
      setDropDown(0);
    }
  };
  const openPropertiesPanel = () => {
    setDropDown(0);
    data.openPropertiesPanel?.(id);
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        selected: node.id === id,
      }))
    );
  };
  const visibilityClasses = selected
    ? "pointer-events-auto opacity-100"
    : "pointer-events-none opacity-0";

  const inputHandleItems = [
    { id: "imageInput", label: "Text", icon: <span className="text-lg font-black leading-none">T</span>, color: "blue", enabled: hasPrompt },
    { id: "imageInput3", label: "Image", icon: <IoImageOutline size={20} />, color: "green", enabled: hasImageUrl },
    { id: "imageInput2", label: "References", icon: <IoImageOutline size={20} />, color: "green", enabled: hasImagesList },
  ].filter((handle) => handle.enabled);

  const colorClasses = {
    blue: {
      active: "!bg-blue-500 !border-blue-300 text-white shadow-[0_0_18px_rgba(59,130,246,0.75)]",
      idle: "!bg-[#252525] !border-[#252525] text-zinc-300 hover:!border-blue-400",
      label: "text-blue-400",
    },
    green: {
      active: "!bg-emerald-500 !border-emerald-300 text-white shadow-[0_0_18px_rgba(16,185,129,0.75)]",
      idle: "!bg-[#252525] !border-[#252525] text-zinc-300 hover:!border-emerald-400",
      label: "text-emerald-400",
    },
  };

  const renderInputHandle = (handle, index) => {
    const connected = connectedInputs[handle.id];
    const classes = colorClasses[handle.color];
    return (
      <div
        key={handle.id}
        className={`group/handle absolute -left-16 z-20 flex h-[52px] w-[52px] items-center justify-center rounded-full transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 ${connected ? "pointer-events-auto opacity-100" : visibilityClasses}`}
        style={{ top: 455 + index * 76 }}
      >
        <Handle
          type="target"
          position={Position.Left}
          id={handle.id}
          style={{
            left: 0,
            top: 26,
            width: 52,
            height: 52,
            opacity: 1,
            pointerEvents: "auto",
          }}
          className={`!rounded-full !border-[3px] transition-all ${connected ? classes.active : classes.idle}`}
          data-type={handle.color}
        />
        <span className="pointer-events-none relative z-10 scale-125 text-current">{handle.icon}</span>
        <span className={`pointer-events-none absolute -left-24 hidden w-20 text-right text-[10px] font-semibold uppercase tracking-wide ${classes.label} group-hover/handle:block`}>
          {handle.label}
        </span>
      </div>
    );
  };

  const renderOutputHandle = () => {
    const connected = connectedOutputs.imageOutput;
    const classes = colorClasses.green;
    return (
      <div
        className={`group/handle absolute -right-16 top-8 z-20 flex h-[52px] w-[52px] items-center justify-center rounded-full transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 ${connected ? "pointer-events-auto opacity-100" : visibilityClasses}`}
      >
        <Handle
          type="source"
          position={Position.Right}
          id="imageOutput"
          style={{
            right: 0,
            top: 26,
            width: 52,
            height: 52,
            opacity: 1,
            pointerEvents: "auto",
          }}
          className={`!rounded-full !border-[3px] transition-all ${connected ? classes.active : classes.idle}`}
          data-type="green"
        />
        <span className="pointer-events-none relative z-10 scale-125 text-current"><IoImageOutline size={20} /></span>
        <span className={`pointer-events-none absolute left-16 hidden w-24 text-left text-[10px] font-semibold uppercase tracking-wide ${classes.label} group-hover/handle:block`}>
          Image
        </span>
      </div>
    );
  };

  return (
    <div
      style={{ '--loader-color': '#10b981' }}
      className={`
        nowheel group relative flex w-[720px] flex-col rounded-[32px] border-[3px]
        bg-[#151515]/95 text-zinc-100 shadow-2xl transition-all duration-300 ease-in-out
        ${selected
          ? "border-emerald-500 shadow-[0_0_32px_rgba(16,185,129,0.24)] ring-2 ring-emerald-500/25"
          : "border-[#3d3d3d] hover:border-zinc-500"}
      `}
    >
      {data.isLoading && (
        <div className="loader-border" />
      )}

      <div className="absolute -top-9 left-6 flex items-center gap-2">
        <IoImageOutline size={18} className="text-zinc-300" />
        <h4 className="max-w-[520px] truncate text-base font-black tracking-tight text-zinc-100" title={currentModelId === "image-passthrough" ? inputImageIdentity.label : undefined}>
          {currentModelId === "image-passthrough"
            ? inputImageIdentity.label
            : `Image Generator #${id.replace(/^\D+/g, "") || "1"}`}
        </h4>
        {currentModelId === "image-passthrough" && (
          <button
            type="button"
            onPointerDown={stopNodeDrag}
            onClick={openIdentityEditor}
            className={`nodrag nowheel flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/10 hover:text-white ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
            title="Rename input image"
          >
            <IoPencilOutline size={14} />
          </button>
        )}
        {generationCost !== null && isGeneratorModel && (
          <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-300">
            {isRefreshingCost ? (
              <div className="h-2 w-2 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white" />
            ) : (
              <span>{generationCost === 0 ? "Free" : `$${generationCost}`}</span>
            )}
          </span>
        )}
      </div>

      {inputHandleItems.map(renderInputHandle)}
      {renderOutputHandle()}

      {currentModelId === "image-passthrough" && inputImageIdentity.description && !isIdentityEditing && (
        <div className="pointer-events-none absolute left-16 right-20 top-5 z-20 max-h-24 overflow-hidden rounded-lg border border-white/10 bg-black/65 px-3 py-2 text-sm leading-relaxed text-zinc-200 shadow-lg backdrop-blur-sm">
          {inputImageIdentity.description}
        </div>
      )}

      {currentModelId === "image-passthrough" && isIdentityEditing && (
        <div
          className="nodrag nowheel absolute left-5 right-20 top-5 z-50 flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-[#101010]/95 p-4 shadow-2xl backdrop-blur-xl"
          onPointerDown={stopNodeDrag}
        >
          <input
            autoFocus
            value={identityDraft.label}
            maxLength={60}
            onChange={(event) => setIdentityDraft((current) => ({ ...current, label: event.target.value }))}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveIdentity(event);
              if (event.key === "Escape") closeIdentityEditor(event);
            }}
            placeholder="Name"
            className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-bold text-white outline-none transition focus:border-emerald-400/60"
          />
          <textarea
            value={identityDraft.description}
            maxLength={180}
            rows={2}
            onChange={(event) => setIdentityDraft((current) => ({ ...current, description: event.target.value }))}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeIdentityEditor(event);
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") saveIdentity(event);
            }}
            placeholder="Short description"
            className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm leading-relaxed text-zinc-200 outline-none transition focus:border-emerald-400/60"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeIdentityEditor}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
              title="Cancel"
            >
              <IoClose size={19} />
            </button>
            <button
              type="button"
              onClick={saveIdentity}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-emerald-950 transition hover:bg-emerald-400"
              title="Save"
            >
              <IoCheckmark size={20} />
            </button>
          </div>
        </div>
      )}

      {outputHistory.length > 0 && (
        <div className="absolute -top-12 right-2 z-30 flex items-center gap-1 rounded-full border border-white/10 bg-[#101010]/95 p-1 shadow-xl">
          <button
            type="button"
            suppressHydrationWarning={true}
            onClick={handlePrev}
            disabled={currentHistoryIndex <= 0}
            className="flex h-6 w-6 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            title="Previous"
          >
            <FaAngleLeft size={11} />
          </button>
          <span className="px-1 text-[10px] font-bold tabular-nums text-white/80">
            {currentHistoryIndex + 1}/{outputHistory.length}
          </span>
          <button
            type="button"
            suppressHydrationWarning={true}
            onClick={handleDeleteHistory}
            className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 transition hover:bg-red-500/10 hover:text-red-400"
            title="Delete history"
          >
            <IoTrashOutline size={12} />
          </button>
          <NodeSendButton
            id={id}
            data={data}
            outputHistory={outputHistory}
            currentHistoryIndex={currentHistoryIndex}
            currentOutputIndex={currentImageIndex}
          />
          <button
            type="button"
            suppressHydrationWarning={true}
            onClick={handleNext}
            disabled={currentHistoryIndex >= outputHistory.length - 1}
            className="flex h-6 w-6 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            title="Next"
          >
            <FaAngleRight size={11} />
          </button>
        </div>
      )}

      <div className={`absolute right-5 top-5 z-30 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 ${selected ? "opacity-100" : "opacity-0"}`}>
        <NodeOptionsMenu
          nodeId={id}
          onDuplicate={data.duplicateNode}
          onDelete={handleDeleteNode}
          downloadUrl={currentOutput}
          showThumbnailOption={true}
          onSetThumbnail={() => updateWorkflowThumbnail(currentOutput)}
        />
      </div>

      {currentModelId === "image-passthrough" ? (
        <div className="flex min-h-[620px] w-full flex-1 overflow-hidden rounded-[29px]">
          <UploadNode id={id} data={data} formValues={formValues} setFormValues={setFormValues} selectedModel={selectedModel} loading={loading} uploadType="upload" acceptType="image" />
        </div>
      ) : (
        <div className="relative flex min-h-[620px] w-full flex-grow items-center justify-center overflow-hidden rounded-[29px] transition-all duration-500">
          {data.isLoading ? (
            <div className="flex h-full min-h-[620px] w-full animate-pulse items-center justify-center overflow-hidden bg-white/5">
              <div className="flex flex-col items-center gap-3">
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Generating...</span>
              </div>
            </div>
          ) : data.errorMsg ? (
            <div className="mx-8 w-full rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs font-medium text-red-300">
              {data.errorMsg || "Generation failed"}
            </div>
          ) : currentOutput && !data.isLoading ? (
            <div className="relative h-full min-h-[620px] w-full group/image">
              {currentOutputList.length > 1 && (
                <>
                  <button
                    type="button"
                    suppressHydrationWarning={true}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : currentOutputList.length - 1));
                    }}
                    className="absolute left-4 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover/image:opacity-100"
                  >
                    <FaAngleLeft size={16} />
                  </button>
                  <button
                    type="button"
                    suppressHydrationWarning={true}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentImageIndex((prev) => (prev < currentOutputList.length - 1 ? prev + 1 : 0));
                    }}
                    className="absolute right-4 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover/image:opacity-100"
                  >
                    <FaAngleRight size={16} />
                  </button>
                </>
              )}
              <img
                key={currentOutput}
                src={currentOutput}
                alt="Generated"
                className="h-full min-h-[620px] w-full animate-in rounded-[29px] object-contain duration-500 fade-in"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-[29px] bg-gradient-to-t from-black/80 via-black/40 to-transparent p-6 opacity-0 transition-opacity duration-300 group-hover/image:opacity-100">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-tighter text-white/50">Dimensions</span>
                    <span className="text-xs font-medium tabular-nums text-white">
                      {imageMetadata.width} x {imageMetadata.height}
                    </span>
                  </div>
                  {imageMetadata.size && (
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-tighter text-white/50">File Size</span>
                      <span className="text-xs font-medium tabular-nums text-white">{imageMetadata.size}</span>
                    </div>
                  )}
                </div>
              </div>
              {currentOutputList.length > 1 && (
                <div className="absolute bottom-24 left-1/2 z-30 flex -translate-x-1/2 gap-1">
                  {currentOutputList.map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-1.5 w-1.5 rounded-full transition-all ${
                        idx === currentImageIndex ? "scale-125 bg-white" : "bg-white/40"
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className={`pointer-events-none absolute inset-0 flex items-center justify-center text-zinc-700 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 ${
              selected ? "opacity-100" : "opacity-0"
            }`}>
              <IoImageOutline size={72} />
            </div>
          )}

          <div className={`absolute inset-x-8 bottom-8 z-20 flex flex-col gap-5 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 ${visibilityClasses}`}>
            {hasPrompt && (
              <textarea
                value={promptValue}
                onChange={(event) => handleChange("prompt", event.target.value)}
                onPointerDown={stopNodeDrag}
                placeholder="Describe the image you want to generate..."
                className="nodrag nowheel h-24 w-full resize-none bg-transparent text-2xl font-medium leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-500"
              />
            )}
            <div className="flex items-center gap-3 pr-24">
              <div className="nodrag nowheel flex h-11 w-32 flex-none items-center justify-between rounded-full bg-[#242424]/95 px-4 text-base font-black text-zinc-300">
                <button
                  type="button"
                  onPointerDown={stopNodeDrag}
                  onClick={() => changeCount(-1)}
                  className="text-2xl leading-none text-zinc-500 transition hover:text-white"
                >
                  -
                </button>
                <span>x{countValue || 1}</span>
                <button
                  type="button"
                  onPointerDown={stopNodeDrag}
                  onClick={() => changeCount(1)}
                  className="text-2xl leading-none text-zinc-400 transition hover:text-white"
                >
                  +
                </button>
              </div>
              {hasAspectControl && <div className="relative">
                {isAspectMenuOpen && (
                  <div
                    className="nodrag nowheel absolute bottom-full left-1/2 z-40 mb-3 flex min-w-full -translate-x-1/2 flex-col gap-1 rounded-2xl border border-white/10 bg-[#111111]/95 p-1.5 shadow-2xl backdrop-blur-xl"
                    onPointerDown={stopNodeDrag}
                  >
                    {aspectRatioOptions.map((option) => (
                      <button
                        key={String(option)}
                        type="button"
                        onPointerDown={stopNodeDrag}
                        onClick={() => setAspectValue(option)}
                        className={`h-9 rounded-xl px-4 text-left text-sm font-bold transition ${
                          String(option) === String(aspectRatioValue)
                            ? "bg-white text-zinc-950"
                            : "text-zinc-300 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {String(option)}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onPointerDown={stopNodeDrag}
                  onClick={() => setDropDown((current) => current === "aspect" ? 0 : "aspect")}
                  className={`nodrag nowheel flex h-11 w-36 flex-none items-center justify-center gap-2 rounded-full px-6 text-base font-black transition ${
                    isAspectMenuOpen
                      ? "bg-[#303030] text-white ring-1 ring-emerald-400/35"
                      : "bg-[#242424]/95 text-zinc-300 hover:bg-[#303030] hover:text-white"
                  }`}
                >
                  <span className={`inline-block h-3 w-3 rounded-[3px] border ${isAspectMenuOpen ? "border-white" : "border-zinc-400"}`} />
                  {String(aspectRatioValue || "1:1")}
                  <FaAngleDown size={13} className={`transition ${isAspectMenuOpen ? "rotate-180" : ""}`} />
                </button>
              </div>}
              <button
                type="button"
                onPointerDown={stopNodeDrag}
                onClick={openPropertiesPanel}
                className="nodrag nowheel flex h-11 w-11 items-center justify-center rounded-full bg-[#242424]/95 text-zinc-300 transition hover:bg-[#303030] hover:text-white"
                title="Settings"
              >
                <IoSettingsOutline size={21} />
              </button>
            </div>
          </div>

          <button
            type="button"
            suppressHydrationWarning={true}
            onPointerDown={stopNodeDrag}
            onClick={handleRunSingleNode}
            disabled={data.isLoading || loading}
            className={`nodrag nowheel absolute bottom-8 right-8 z-30 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-300 text-zinc-900 transition hover:bg-white group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 disabled:cursor-not-allowed ${
              selected ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
            }`}
            title="Run image node"
          >
            <IoPlay size={32} className="translate-x-0.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default ImageGeneration;
