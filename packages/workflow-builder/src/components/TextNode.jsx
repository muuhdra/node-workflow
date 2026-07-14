import React, { useEffect, useMemo, useState, useRef } from "react";
import { Handle, Position, useReactFlow, useStore, useUpdateNodeInternals } from "reactflow";
import { FaAngleLeft, FaAngleRight } from "react-icons/fa6";
import axios from "axios";
import { getRunId, getWorkflowId } from "./WorkflowStore";
import { toast } from "react-hot-toast";
import { IoImageOutline, IoPlay, IoSettingsOutline, IoTrashOutline } from "react-icons/io5";
import UploadNode from "./UploadNode"
import { TfiText } from "react-icons/tfi";
import NodeSendButton from "./NodeSendButton";
import NodeOptionsMenu from "./NodeOptionsMenu";
import { useGenerationCost } from "./useGenerationCost";

const inputHandles = [
  "textInput",
  "textInput2",
  "textInput3",
  "textInput4",
];

const outputHandles = [
  "textOutput",
];

const TextGeneration = ({ id, data, selected }) => {
  const models = useMemo(() => {
    return data.nodeSchemas?.categories?.text?.models 
      ? Object.values(data.nodeSchemas.categories.text.models) 
      : [];
  }, [data.nodeSchemas]);
  const [selectedModel, setSelectedModel] = useState(data.selectedModel || models[1] || models[0] || {});
  const [connectedInputs, setConnectedInputs] = useState({});
  const [connectedOutputs, setConnectedOutputs] = useState({});
  const [formValues, setFormValues] = useState(data.formValues || {});
  const [dropDown, setDropDown] = useState(0);
  const [loading, setLoading] = useState(0);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);
  const [currentOutputIndex, setCurrentOutputIndex] = useState(0);
  const outputHistory = data.outputHistory || [];
  const prevHistoryLengthRef = useRef(outputHistory.length);
  const workflowId = getWorkflowId();
  const runId = data.runId ?? getRunId();
  const nodeSchemas = data.nodeSchemas || {};
  const { setNodes, setEdges } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const edges = useStore((state) => state.edges);
  const properties = nodeSchemas?.categories?.text?.models?.[selectedModel.id]?.input_schema?.schemas?.input_data?.properties;
  const { generationCost, isRefreshingCost } = useGenerationCost(selectedModel, formValues);
  
  useEffect(() => {
    if (data.cost !== generationCost) {
      data.onDataChange?.(id, { cost: generationCost });
    }
  }, [id, generationCost, data.cost]);

  const textareaRef = useRef(null);

  const initializeFormData = (schemaProperties) => {
    const initialData = {};
    const fieldEntries = Object.entries(schemaProperties || {});

    fieldEntries.forEach(([fieldName, fieldSchema]) => {
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
    const UI_KEYS = ["make_output", "make_input"];
    UI_KEYS.forEach((k) => {
      if (data.formValues?.[k] !== undefined) merged[k] = data.formValues[k];
    });

    setFormValues(merged);
  }
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
        setCurrentOutputIndex(0);
      } else if (data.outputHistory.length > prevHistoryLengthRef.current) {
        setCurrentHistoryIndex(data.outputHistory.length - 1);
        setCurrentOutputIndex(0);
      }
    }
    prevHistoryLengthRef.current = data.outputHistory ? data.outputHistory.length : 0;
  }, [data.selectedModel, data.triggerRun, data.outputHistory]);

  useEffect(() => {
    updateNodeInternals(id);
  }, [formValues, id]);

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
    if (data?.onDataChange && data?.selectedModel?.id !== "text-passthrough") {
      data.onDataChange(id, { selectedModel, formValues, loading });
    }
  }, [selectedModel, formValues, loading]);

  const handleChange = (key, value) => {
    setFormValues(prev => ({ ...prev, [key]: value }));
    setDropDown(-1);
  };

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
          setCurrentOutputIndex(0);
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
        toast.error(`Failed to get workflow status Text ${id.replace(/^\D+/g, "")}`);
      });
    }, 3000);
  };

  const handleRunSingleNode = async () => {
    if (!runId) {
      toast.error("No run_id available!. Click 'Run All' button");
      return;
    }

    try {
      data.onDataChange(id, { isLoading: true });
      const workflow_id = await data.handleSaveWorkFlow();

      if (!workflow_id) {
        toast.error("Failed to save workflow before running node");
        data.onDataChange(id, { isLoading: false });
        return;
      }

      const modelSchema = nodeSchemas?.categories?.text?.models[selectedModel.id]?.input_schema?.schemas?.input_data;
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
        node_id: "AI Text"
      });
      pollNodeStatus(response.data.run_id);
    } catch(error) {
      data.onDataChange(id, { isLoading: false });
      toast.error(error.response?.data?.detail || "Error running node");
      console.error(error);
    };
  };

  const handleDeleteNode = () => {
    if (window.confirm(`Are you sure you want to delete this ${id} node?`)) {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      toast.success(`Deleted node ${id}`);
    };
  };

  const hasPrompt = properties && "prompt" in properties && !data.selectedModel?.id?.includes("passthrough");
  const hasImagesList = properties && "images_list" in properties && !data.selectedModel?.id?.includes("passthrough");
  const hasImageUrl = properties && "image_url" in properties && !data.selectedModel?.id?.includes("passthrough");
  const hasSystemPrompt = properties && "system_prompt" in properties && !data.selectedModel?.id?.includes("passthrough");

  useEffect(() => {
    const timeout = setTimeout(() => {
      const validHandles = [
        hasPrompt && "textInput",
        hasImageUrl && "textInput2",
        hasImagesList && "textInput3",
        hasSystemPrompt && "textInput4",
      ].filter(Boolean);

      setEdges((prevEdges) =>
        prevEdges.filter((edge) => {
          if (edge.target !== id) return true;
          return validHandles.includes(edge.targetHandle);
        })
      );
      }, 2000);
    return () => clearTimeout(timeout);
  }, [hasPrompt, hasImageUrl, hasImagesList, hasSystemPrompt, id, setEdges]);

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
      setCurrentOutputIndex(0);
      
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
      setCurrentOutputIndex(0);
      
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
    ? currentOutputList[currentOutputIndex]?.value || currentOutputList[0]?.value || data.resultUrl
    : data.resultUrl;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "0px";
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${Math.max(scrollHeight, 210)}px`;
    }
  }, [currentOutput, currentHistoryIndex, selectedModel.name]);

  const currentModelId = selectedModel?.id || data.selectedModel?.id || "";
  const isGeneratorModel = !currentModelId.includes("passthrough");
  const promptValue = formValues.prompt || "";
  const stopNodeDrag = (event) => event.stopPropagation();
  const visibilityClasses = selected
    ? "pointer-events-auto opacity-100"
    : "pointer-events-none opacity-0";
  const openPropertiesPanel = () => {
    data.openPropertiesPanel?.(id);
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        selected: node.id === id,
      }))
    );
  };

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

  const inputHandleItems = [
    { id: "textInput", label: "Text", icon: <span className="text-lg font-black leading-none">T</span>, color: "blue", enabled: hasPrompt },
    { id: "textInput2", label: "Image", icon: <IoImageOutline size={22} />, color: "green", enabled: hasImageUrl },
    { id: "textInput3", label: "References", icon: <IoImageOutline size={22} />, color: "green", enabled: hasImagesList },
    { id: "textInput4", label: "System", icon: <TfiText size={20} />, color: "blue", enabled: hasSystemPrompt },
  ].filter((handle) => handle.enabled);

  const renderInputHandle = (handle, index) => {
    const connected = connectedInputs[handle.id];
    const classes = colorClasses[handle.color];
    return (
      <div
        key={handle.id}
        className={`group/handle absolute -left-16 z-20 flex h-[52px] w-[52px] items-center justify-center rounded-full transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 ${connected ? "pointer-events-auto opacity-100" : visibilityClasses}`}
        style={{ top: 170 + index * 86 }}
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
    const connected = connectedOutputs.textOutput;
    const classes = colorClasses.blue;
    return (
      <div
        className={`group/handle absolute -right-16 top-8 z-20 flex h-[52px] w-[52px] items-center justify-center rounded-full transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 ${connected ? "pointer-events-auto opacity-100" : visibilityClasses}`}
      >
        <Handle
          type="source"
          position={Position.Right}
          id="textOutput"
          style={{
            right: 0,
            top: 26,
            width: 52,
            height: 52,
            opacity: 1,
            pointerEvents: "auto",
          }}
          className={`!rounded-full !border-[3px] transition-all ${connected ? classes.active : classes.idle}`}
          data-type="blue"
        />
        <span className="pointer-events-none relative z-10 text-lg font-black leading-none text-current">T</span>
        <span className={`pointer-events-none absolute left-16 hidden w-24 text-left text-[10px] font-semibold uppercase tracking-wide ${classes.label} group-hover/handle:block`}>
          Text
        </span>
      </div>
    );
  };

  return (
    <div
      style={{ '--loader-color': '#2563eb' }}
      className={`
        nowheel group relative flex w-[620px] flex-col rounded-[32px] border-[3px]
        bg-[#151515]/95 text-zinc-100 shadow-2xl transition-all duration-300 ease-in-out
        ${selected
          ? "border-blue-500 shadow-[0_0_32px_rgba(59,130,246,0.24)] ring-2 ring-blue-500/25"
          : "border-[#252525] hover:border-zinc-500"}
      `}
    >
      {data.isLoading && (
        <div className="loader-border" />
      )}

      <div className="absolute -top-9 left-6 flex items-center gap-2">
        <TfiText size={18} className="text-zinc-300" />
        <h4 className="text-base font-black tracking-tight text-zinc-100">
          Text #{id.replace(/^\D+/g, "") || "1"}
        </h4>
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
            currentOutputIndex={currentOutputIndex}
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
        />
      </div>

      {data.selectedModel?.id === "text-passthrough" ? (
        <div className="min-h-[360px] w-full flex-1 overflow-hidden rounded-[29px]">
          <UploadNode id={id} data={data} formValues={formValues} setFormValues={setFormValues} selectedModel={selectedModel} loading={loading} uploadType="text" acceptType="text" />
        </div>
      ) : (
        <div className="relative flex min-h-[360px] w-full flex-grow overflow-hidden rounded-[29px] transition-all duration-500">
          {data.isLoading ? (
            <div className="flex h-full min-h-[360px] w-full animate-pulse items-center justify-center overflow-hidden bg-white/5">
              <div className="flex flex-col items-center gap-3">
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300">Generating...</span>
              </div>
            </div>
          ) : data.errorMsg ? (
            <div className="m-8 w-full self-start rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs font-medium text-red-300">
              {data.errorMsg || "Generation failed"}
            </div>
          ) : currentOutput && !data.isLoading ? ( 
            <div className="relative flex h-full min-h-[360px] w-full flex-col gap-2 p-8">
              <textarea
                ref={textareaRef}
                readOnly
                value={currentOutput || ""}
                placeholder="Output will appear here..."
                className="nodrag nowheel h-full min-h-[280px] w-full resize-none bg-transparent text-xl font-medium leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-500"
              />
              {currentOutputList.length > 1 && (
                <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/60 px-2 py-0.5 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    suppressHydrationWarning={true}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentOutputIndex((prev) => (prev > 0 ? prev - 1 : currentOutputList.length - 1));
                    }}
                    className="p-0.5 text-white hover:text-blue-400"
                  >
                    <FaAngleLeft size={12} />
                  </button>
                  <span className="text-[10px] text-white/80 tabular-nums">
                    {currentOutputIndex + 1}/{currentOutputList.length}
                  </span>
                  <button
                    type="button"
                    suppressHydrationWarning={true}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentOutputIndex((prev) => (prev < currentOutputList.length - 1 ? prev + 1 : 0));
                    }}
                    className="p-0.5 text-white hover:text-blue-400"
                  >
                    <FaAngleRight size={12} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {hasPrompt && (
                <textarea
                  value={promptValue}
                  onChange={(event) => handleChange("prompt", event.target.value)}
                  onPointerDown={stopNodeDrag}
                  placeholder='Try "Happy dog with sunglasses and floating ring"'
                  className="nodrag nowheel h-full min-h-[280px] w-full resize-none bg-transparent p-8 text-xl font-medium leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-500"
                />
              )}
              {!hasPrompt && (
                <div className="flex h-full min-h-[360px] w-full items-center justify-center text-zinc-700">
                  <TfiText size={72} />
                </div>
              )}
            </>
          )}

          <div className={`absolute bottom-7 left-8 z-20 flex items-center gap-3 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 ${visibilityClasses}`}>
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

          <button
            type="button"
            suppressHydrationWarning={true}
            onPointerDown={stopNodeDrag}
            onClick={handleRunSingleNode}
            disabled={data.isLoading || loading}
            className={`nodrag nowheel absolute bottom-7 right-8 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-300 text-zinc-900 transition hover:bg-white group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 disabled:cursor-not-allowed ${
              selected ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
            }`}
            title="Run text node"
          >
            <IoPlay size={28} className="translate-x-0.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default TextGeneration;
