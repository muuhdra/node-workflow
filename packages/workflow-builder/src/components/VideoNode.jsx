import { downloadFile, videoModels } from "./utility";
import React, { useEffect, useMemo, useState, useRef } from "react";
import { BsArrowUpCircleFill } from "react-icons/bs";
import { IoImageOutline, IoImagesOutline, IoSettingsOutline, IoVideocamOutline, IoTrashOutline, IoPlay, IoPause, IoVolumeHigh, IoVolumeMute } from "react-icons/io5";
import { Handle, Position, useReactFlow, useStore, useUpdateNodeInternals } from "reactflow";
import { getRunId, getWorkflowId } from "./WorkflowStore";
import axios from "axios";
import { toast } from "react-hot-toast";
import UploadNode from "./UploadNode";
import { SlOptions } from "react-icons/sl";
import { MdOutlineFileDownload } from "react-icons/md";
import NodeSendButton from "./NodeSendButton";
import { FaAngleDown, FaAngleLeft, FaAngleRight } from "react-icons/fa6";
import NodeOptionsMenu from "./NodeOptionsMenu";
import { useGenerationCost } from "./useGenerationCost";
import VideoPlayer from "./VideoPlayer";
import { getModelInputProperties, getVideoInputHandles } from "./connectionState";

const inputHandles = [
  "videoInput",   // prompt
  "videoInput2",  // start image / image_url
  "videoInput3",  // end image / last_image
  "videoInput4",  // video_url
  "videoInput5",  // audio_url
  "videoInput6",  // references / images_list
  "videoInput7",  // videos_list, video_files
  "videoInput8",  // audios_list, audio_files
];

const outputHandles = [
  "videoStartImageOutput",
  "videoEndImageOutput",
  "videoOutput",
  "videoAudioOutput",
];

const VideoGeneration = ({ id, data, selected }) => {
  const models = useMemo(() => {
    return data.nodeSchemas?.categories?.video?.models 
      ? Object.values(data.nodeSchemas.categories.video.models) 
      : [];
  }, [data.nodeSchemas]);
  
  const [selectedModel, setSelectedModel] = useState(data.selectedModel || models[1] || models[0] || {});
  const [connectedInputs, setConnectedInputs] = useState({});
  const [connectedOutputs, setConnectedOutputs] = useState({});
  const [formValues, setFormValues] = useState(data.formValues || {});
  const [dropDown, setDropDown] = useState(0);
  const [loading, setLoading] = useState(0);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const videoRef = useRef(null);
  const outputHistory = data.outputHistory || [];
  const prevHistoryLengthRef = useRef(outputHistory.length);
  const workflowId = getWorkflowId();
  const runId = data.runId ?? getRunId();
  const nodeSchemas = data.nodeSchemas || {};
  const { setNodes, setEdges } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const edges = useStore((state) => state.edges);
  const currentModelId = selectedModel?.id || data.selectedModel?.id || "";
  const properties = getModelInputProperties(selectedModel, nodeSchemas, "video");
  const validVideoInputHandles = getVideoInputHandles(properties, currentModelId);
  const { generationCost, isRefreshingCost } = useGenerationCost(selectedModel, formValues);
  
  useEffect(() => {
    if (data.cost !== generationCost) {
      data.onDataChange(id, { cost: generationCost });
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

    // const merged = { ...defaults, ...filteredFormValues };
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
  };

  useEffect(() => {
    setLoading(1);
    if (properties) {
      addFormValuesInTaskData(properties);
    }
    setLoading(0);
  }, [selectedModel, properties]);

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
        setCurrentVideoIndex(0);
      } else if (data.outputHistory.length > prevHistoryLengthRef.current) {
        setCurrentHistoryIndex(data.outputHistory.length - 1);
        setCurrentVideoIndex(0);
      }
    }
    prevHistoryLengthRef.current = data.outputHistory ? data.outputHistory.length : 0;
  }, [data.selectedModel, data.triggerRun, data.outputHistory]);

  useEffect(() => {
    updateNodeInternals(id);
  }, [formValues, id, selectedModel]);

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
    if (data?.onDataChange && data?.selectedModel?.id !== "video-passthrough") {
      data.onDataChange(id, { selectedModel, formValues, loading });
    }
  }, [selectedModel, formValues, loading]);

  useEffect(() => {
    if (data.triggerRun) {
      handleRunSingleNode();

      data.onDataChange(id, { triggerRun: false });
    }
  }, [data.triggerRun]);
  
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
          setCurrentVideoIndex(0);
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
        toast.error(`Failed to get workflow status Video ${id.replace(/^\D+/g, "")}`);
      });
    }, 3000);
  };

  const handleRunSingleNode = async () => {
    try {
      data.onDataChange(id, { isLoading: true });
      const workflow_id = await data.handleSaveWorkFlow();

      if (!workflow_id) {
        toast.error("Failed to save workflow before running node");
        data.onDataChange(id, { isLoading: false });
        return;
      }

      const modelSchema = nodeSchemas?.categories?.video?.models[selectedModel.id]?.input_schema?.schemas?.input_data;
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
        node_id: "AI Video"
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

  const isGeneratorModel = !currentModelId.includes("passthrough");
  const hasPrompt = validVideoInputHandles.includes("videoInput");
  const hasImageUrl = validVideoInputHandles.includes("videoInput2");
  const hasLastImage = validVideoInputHandles.includes("videoInput3");
  const hasVideoUrl = validVideoInputHandles.includes("videoInput4");
  const hasAudioUrl = validVideoInputHandles.includes("videoInput5");
  const hasImagesList = validVideoInputHandles.includes("videoInput6");
  const hasVideosList = validVideoInputHandles.includes("videoInput7");
  const hasAudiosList = validVideoInputHandles.includes("videoInput8");

  useEffect(() => {
    const timeout = setTimeout(() => {
      const validHandles = [
        hasPrompt && "videoInput",
        hasImageUrl && "videoInput2",
        hasLastImage && "videoInput3",
        hasVideoUrl && "videoInput4",
        hasAudioUrl && "videoInput5",
        hasImagesList && "videoInput6",
        hasVideosList && "videoInput7",
        hasAudiosList && "videoInput8",
      ].filter(Boolean);

      setEdges((prevEdges) =>
        prevEdges.filter((edge) => {
          if (edge.target !== id) return true;
          return validHandles.includes(edge.targetHandle);
        })
      );
    }, 2000);
    return () => clearTimeout(timeout);
  }, [hasPrompt, hasImageUrl, hasLastImage, hasVideoUrl, hasAudioUrl, hasImagesList, hasVideosList, hasAudiosList, id, setEdges]);

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
      setCurrentVideoIndex(0);
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
      setCurrentVideoIndex(0);
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
    ? currentOutputList[currentVideoIndex]?.value || currentOutputList[0]?.value || data.resultUrl
    : data.resultUrl;

  const getFirstField = (...keys) => keys.find((key) => properties && key in properties);
  const aspectRatioKey = getFirstField("aspect_ratio", "ratio", "size") || "aspect_ratio";
  const durationKey = getFirstField("duration", "duration_seconds", "length", "video_length") || "duration";
  const qualityKey = getFirstField("quality", "resolution", "mode") || "quality";
  const countKey = getFirstField("num_outputs", "num_videos", "n", "batch_size") || "num_outputs";
  const soundKey = getFirstField("sound", "enable_audio", "generate_audio", "audio") || "sound";
  const cameraFixedKey = getFirstField("camera_fixed", "fixed_camera") || "camera_fixed";
  const hasCountControl = Boolean(getFirstField("num_outputs", "num_videos", "n", "batch_size"));
  const hasQualityControl = Boolean(getFirstField("quality", "resolution", "mode"));
  const hasAspectControl = Boolean(getFirstField("aspect_ratio", "ratio", "size"));
  const hasDurationControl = Boolean(getFirstField("duration", "duration_seconds", "length", "video_length"));
  const hasSoundControl = Boolean(getFirstField("sound", "enable_audio", "generate_audio", "audio"));
  const qualityOptions = properties?.[qualityKey]?.enum || ["basic", "standard", "high"];
  const aspectRatioOptions = properties?.[aspectRatioKey]?.enum || ["16:9", "9:16", "1:1", "4:3"];
  const durationOptions = properties?.[durationKey]?.enum || [5, 6, 8, 10];
  const promptValue = formValues.prompt || "";
  const aspectRatioValue = formValues[aspectRatioKey] || properties?.[aspectRatioKey]?.default || "16:9";
  const durationValue = formValues[durationKey] || properties?.[durationKey]?.default || 5;
  const qualityValue = formValues[qualityKey] || properties?.[qualityKey]?.default || "basic";
  const countValue = Number(formValues[countKey] || properties?.[countKey]?.default || 1);
  const soundValue = Boolean(formValues[soundKey]);
  const cameraFixedValue = Boolean(formValues[cameraFixedKey]);
  const setFieldValue = (key, value) => {
    if (!key) return;
    handleChange(key, value);
  };
  const stopNodeDrag = (event) => event.stopPropagation();
  const changeCount = (delta) => {
    const nextValue = Math.min(10, Math.max(1, countValue + delta));
    handleChange(countKey, nextValue);
  };
  const toggleChoiceMenu = (menuName) => {
    setDropDown((current) => current === menuName ? 0 : menuName);
  };
  const selectChoice = (key, value) => {
    setFieldValue(key, value);
    setDropDown(0);
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
  const renderChoiceMenu = (menuName, key, options, currentValue) => (
    dropDown === menuName && (
      <div
        className="nodrag nowheel absolute bottom-full left-1/2 z-40 mb-3 flex min-w-full -translate-x-1/2 flex-col gap-1 rounded-2xl border border-white/10 bg-[#111111]/95 p-1.5 shadow-2xl backdrop-blur-xl"
        onPointerDown={stopNodeDrag}
      >
        {options.map((option) => {
          const selectedOption = String(option) === String(currentValue);
          return (
            <button
              key={String(option)}
              type="button"
              onPointerDown={stopNodeDrag}
              onClick={() => selectChoice(key, option)}
              className={`h-9 rounded-xl px-4 text-left text-sm font-bold transition ${
                selectedOption
                  ? "bg-white text-zinc-950"
                  : "text-zinc-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              {String(option)}
            </button>
          );
        })}
      </div>
    )
  );

  const leftHandles = [
    { id: "videoInput", label: "Text", icon: <span className="text-lg font-black leading-none">T</span>, color: "blue", enabled: hasPrompt },
    { id: "videoInput2", label: "Start image", icon: <IoImageOutline size={18} />, color: "green", enabled: hasImageUrl },
    { id: "videoInput3", label: "End image", icon: <IoImageOutline size={18} />, color: "green", enabled: hasLastImage },
    { id: "videoInput6", label: "References", icon: <IoImagesOutline size={18} />, color: "green", enabled: hasImagesList },
    { id: "videoInput4", label: "Reference video", icon: <IoVideocamOutline size={18} />, color: "orange", enabled: hasVideoUrl },
    { id: "videoInput7", label: "Videos", icon: <IoVideocamOutline size={18} />, color: "orange", enabled: hasVideosList },
    { id: "videoInput5", label: "Audio input", icon: <IoVolumeHigh size={18} />, color: "yellow", enabled: hasAudioUrl },
    { id: "videoInput8", label: "Audios", icon: <IoVolumeHigh size={18} />, color: "yellow", enabled: hasAudiosList },
  ].filter((handle) => handle.enabled);

  const rightOutputs = [
    { id: "videoStartImageOutput", label: "Start image", icon: <IoImageOutline size={18} />, color: "green" },
    { id: "videoEndImageOutput", label: "End image", icon: <IoImageOutline size={18} />, color: "green" },
    { id: "videoOutput", label: "Generated video", icon: <IoVideocamOutline size={18} />, color: "orange" },
    { id: "videoAudioOutput", label: "Audio", icon: <IoVolumeHigh size={18} />, color: "yellow" },
  ];

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
    orange: {
      active: "!bg-orange-500 !border-orange-300 text-white shadow-[0_0_18px_rgba(249,115,22,0.75)]",
      idle: "!bg-[#252525] !border-[#252525] text-zinc-300 hover:!border-orange-400",
      label: "text-orange-400",
    },
    yellow: {
      active: "!bg-yellow-500 !border-yellow-300 text-white shadow-[0_0_18px_rgba(234,179,8,0.75)]",
      idle: "!bg-[#252525] !border-[#252525] text-zinc-300 hover:!border-yellow-400",
      label: "text-yellow-400",
    },
  };

  const renderInputHandle = (handle, index) => {
    const connected = connectedInputs[handle.id];
    const classes = colorClasses[handle.color];
    return (
      <div
        key={handle.id}
        className={`group/handle absolute -left-16 z-20 flex h-[52px] w-[52px] items-center justify-center rounded-full transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 ${
          selected || connected ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{ top: 190 + index * 70 }}
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
        <span className={`pointer-events-none absolute -left-20 hidden w-16 text-right text-[10px] font-semibold uppercase tracking-wide ${classes.label} group-hover/handle:block`}>
          {handle.label}
        </span>
      </div>
    );
  };

  const renderOutputHandle = (handle, index) => {
    const connected = connectedOutputs[handle.id];
    const classes = colorClasses[handle.color];
    return (
      <div
        key={handle.id}
        className={`group/handle absolute -right-16 z-20 flex h-[52px] w-[52px] items-center justify-center rounded-full transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 ${
          selected || connected ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{ top: 38 + index * 78 }}
      >
        <Handle
          type="source"
          position={Position.Right}
          id={handle.id}
          style={{
            right: 0,
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
        <span className={`pointer-events-none absolute left-16 hidden w-24 text-left text-[10px] font-semibold uppercase tracking-wide ${classes.label} group-hover/handle:block`}>
          {handle.label}
        </span>
      </div>
    );
  };

  return (
    <div
      style={{ '--loader-color': '#f97316' }}
      className={`
        nowheel group relative flex w-[720px] flex-col rounded-[32px] border-[3px]
        bg-[#151515]/95 text-zinc-100 shadow-2xl transition-all duration-300 ease-in-out
        ${selected
          ? "border-blue-500 shadow-[0_0_32px_rgba(59,130,246,0.24)] ring-2 ring-blue-500/25"
          : "border-[#3d3d3d] hover:border-zinc-500"}
      `}
    >
      {data.isLoading && (
        <div className="loader-border" />
      )}
      <div className="absolute -top-9 left-6 flex items-center gap-2">
        <IoVideocamOutline size={17} className="text-zinc-300" />
        <h4 className="text-base font-black tracking-tight text-zinc-100">
          Video Generator #{id.replace(/^\D+/g, "") || "1"}
        </h4>
        {generationCost !== null && !currentModelId.includes("passthrough") && (
          <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-300">
            {isRefreshingCost ? (
              <div className="h-2 w-2 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white" />
            ) : (
              <span>
                {generationCost === 0 ? 'Free' : (`$${generationCost}`)}
              </span>
            )}
          </span>
        )}
      </div>

      {leftHandles.map(renderInputHandle)}
      {rightOutputs.map(renderOutputHandle)}

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
            currentOutputIndex={currentVideoIndex}
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

      {currentModelId === "video-passthrough" ? (
        <div className="min-h-[620px] w-full flex-1 overflow-hidden rounded-[29px]">
          <UploadNode id={id} data={data} formValues={formValues} setFormValues={setFormValues} selectedModel={selectedModel} loading={loading} uploadType="upload" acceptType="video" />
        </div>
      ) : (
        <div className="relative flex min-h-[620px] w-full flex-grow items-center justify-center overflow-hidden rounded-[29px] transition-all duration-500">
          {data.isLoading ? (
            <div className="flex h-full min-h-[620px] w-full animate-pulse items-center justify-center overflow-hidden bg-white/5">
              <div className="flex flex-col items-center gap-3">
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Generating...</span>
              </div>
            </div>
          ) : data.errorMsg ? (
            <div className="mx-8 w-full rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs font-medium text-red-300">
              {data.errorMsg || "Generation failed"}
            </div>
          ) : currentOutput && !data.isLoading ? (
            <div className="relative h-full min-h-[620px] w-full">
              <VideoPlayer 
                key={currentOutput}
                src={currentOutput}
                accentColor="#f97316"
              />
              {currentOutputList.length > 1 && (
                <>
                  <button
                    type="button"
                    suppressHydrationWarning={true}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentVideoIndex((prev) => (prev > 0 ? prev - 1 : currentOutputList.length - 1));
                    }}
                    className="absolute left-4 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
                  >
                    <FaAngleLeft size={16} />
                  </button>
                  <button
                    type="button"
                    suppressHydrationWarning={true}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentVideoIndex((prev) => (prev < currentOutputList.length - 1 ? prev + 1 : 0));
                    }}
                    className="absolute right-4 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
                  >
                    <FaAngleRight size={16} />
                  </button>
                </>
              )}
              {currentOutputList.length > 1 && (
                <div className="absolute bottom-24 left-1/2 z-30 flex -translate-x-1/2 gap-1">
                  {currentOutputList.map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-1.5 w-1.5 rounded-full transition-all ${
                        idx === currentVideoIndex ? "bg-white scale-125" : "bg-white/40"
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
              <IoVideocamOutline size={72} />
            </div>
          )}

          <div className={`absolute inset-x-8 bottom-8 z-20 flex flex-col gap-5 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 ${
            selected ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
          }`}>
            {hasPrompt && (
              <textarea
                value={promptValue}
                onChange={(event) => handleChange("prompt", event.target.value)}
                onPointerDown={stopNodeDrag}
                placeholder="Describe the video you want to generate..."
                className="nodrag nowheel h-24 w-full resize-none bg-transparent text-2xl font-medium leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-500"
              />
            )}
            <div className="flex flex-wrap items-center gap-3">
              {hasCountControl && <div className="nodrag nowheel flex h-11 items-center gap-4 rounded-full bg-[#242424]/95 px-4 text-base font-black text-zinc-300">
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
              </div>}
              {hasQualityControl && <div className="relative">
                {renderChoiceMenu("quality", qualityKey, qualityOptions, qualityValue)}
                <button
                  type="button"
                  onPointerDown={stopNodeDrag}
                  onClick={() => toggleChoiceMenu("quality")}
                  className={`nodrag nowheel flex h-11 min-w-32 items-center justify-center gap-2 rounded-full px-6 text-base font-black transition ${
                    dropDown === "quality"
                      ? "bg-zinc-200 text-zinc-950"
                      : "bg-[#242424]/95 text-zinc-300 hover:bg-[#303030] hover:text-white"
                  }`}
                >
                  {String(qualityValue || "basic")}
                  <FaAngleDown size={13} className={`transition ${dropDown === "quality" ? "rotate-180" : ""}`} />
                </button>
              </div>}
              {hasAspectControl && <div className="relative">
                {renderChoiceMenu("aspect", aspectRatioKey, aspectRatioOptions, aspectRatioValue)}
                <button
                  type="button"
                  onPointerDown={stopNodeDrag}
                  onClick={() => toggleChoiceMenu("aspect")}
                  className={`nodrag nowheel flex h-11 min-w-36 items-center justify-center gap-2 rounded-full px-6 text-base font-black transition ${
                    dropDown === "aspect"
                      ? "bg-zinc-200 text-zinc-950"
                      : "bg-[#242424]/95 text-zinc-300 hover:bg-[#303030] hover:text-white"
                  }`}
                >
                  <span className={`inline-block h-3 w-5 rounded-[3px] border ${dropDown === "aspect" ? "border-zinc-800" : "border-zinc-400"}`} />
                  {String(aspectRatioValue || "16:9")}
                  <FaAngleDown size={13} className={`transition ${dropDown === "aspect" ? "rotate-180" : ""}`} />
                </button>
              </div>}
              {hasDurationControl && <div className="relative">
                {renderChoiceMenu("duration", durationKey, durationOptions, durationValue)}
                <button
                  type="button"
                  onPointerDown={stopNodeDrag}
                  onClick={() => toggleChoiceMenu("duration")}
                  className={`nodrag nowheel flex h-11 min-w-24 items-center justify-center gap-2 rounded-full px-6 text-base font-black transition ${
                    dropDown === "duration"
                      ? "bg-zinc-200 text-zinc-950"
                      : "bg-[#242424]/95 text-zinc-300 hover:bg-[#303030] hover:text-white"
                  }`}
                >
                  {String(durationValue || 5)}
                  <FaAngleDown size={13} className={`transition ${dropDown === "duration" ? "rotate-180" : ""}`} />
                </button>
              </div>}
              {hasSoundControl && <button
                type="button"
                onPointerDown={stopNodeDrag}
                onClick={() => setFieldValue(soundKey, !soundValue)}
                className={`nodrag nowheel flex h-11 items-center gap-3 rounded-full px-4 text-base font-black transition ${
                  soundValue
                    ? "bg-orange-500/20 text-orange-200 ring-1 ring-orange-400/45 hover:bg-orange-500/25"
                    : "bg-[#242424]/95 text-zinc-300 hover:bg-[#303030] hover:text-white"
                }`}
              >
                <span className={`h-6 w-11 rounded-full p-0.5 transition ${soundValue ? "bg-orange-500" : "bg-zinc-600"}`}>
                  <span className={`block h-5 w-5 rounded-full transition ${soundValue ? "translate-x-5 bg-zinc-950" : "translate-x-0 bg-white"}`} />
                </span>
                Sound
              </button>}
              <div className="relative">
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
            title="Run video node"
          >
            <IoPlay size={32} className="translate-x-0.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default VideoGeneration;
