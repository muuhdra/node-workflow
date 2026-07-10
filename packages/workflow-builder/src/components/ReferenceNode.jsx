import React, { useEffect, useRef, useState } from "react";
import { Handle, Position, useReactFlow, useStore } from "reactflow";
import axios from "axios";
import { toast } from "react-hot-toast";
import { IoClose, IoImagesOutline, IoTrashOutline } from "react-icons/io5";
import { FiUpload } from "react-icons/fi";
import NodeOptionsMenu from "./NodeOptionsMenu";

const MAX_REFERENCES = 10;
const acceptedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

const ReferenceNode = ({ id, data, selected }) => {
  const [formValues, setFormValues] = useState(data.formValues || { images_list: [] });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const prevFormValues = useRef(formValues);
  const { setNodes, setEdges } = useReactFlow();
  const edges = useStore((state) => state.edges);

  const images = formValues.images_list || [];
  const connectedOutputs = edges.some((edge) => edge.source === id && edge.sourceHandle === "imageOutput");

  useEffect(() => {
    const incoming = JSON.stringify(data.formValues || {});
    const current = JSON.stringify(formValues);
    if (incoming !== current && data.formValues?.images_list) {
      setFormValues(data.formValues);
    }
  }, [data.formValues]);

  useEffect(() => {
    const incoming = JSON.stringify(prevFormValues.current);
    const current = JSON.stringify(formValues);
    if (incoming === current) return;
    prevFormValues.current = formValues;

    data.onDataChange?.(id, {
      selectedModel: data.selectedModel || { id: "reference-images", name: "Reference Images" },
      formValues,
      outputs: [{ type: "image_urls", value: formValues.images_list || [] }],
      resultUrl: formValues.images_list || [],
    });
  }, [formValues, id, data]);

  const handleDeleteNode = () => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  };

  const uploadFile = async (file, index, total) => {
    const response = await axios.get("/api/app/get_file_upload_url", {
      params: { filename: file.name },
    });
    const { url, fields } = response.data;

    const formData = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      formData.append(key, value);
    });
    formData.append("file", file);

    await axios.post(url, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (progressEvent) => {
        const fileProgress = progressEvent.total
          ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
          : 0;
        setUploadProgress(Math.round(((index + fileProgress / 100) / total) * 100));
      },
    });

    return `https://cdn.muapi.ai/${fields.key}`;
  };

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((file) => acceptedTypes.includes(file.type));
    if (files.length === 0) {
      toast.error("Upload image files only");
      return;
    }

    const remainingSlots = MAX_REFERENCES - images.length;
    if (remainingSlots <= 0) {
      toast.error(`Reference node is limited to ${MAX_REFERENCES} images`);
      return;
    }

    const filesToUpload = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      toast.error(`Only ${remainingSlots} more reference image${remainingSlots > 1 ? "s" : ""} can be added`);
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const uploadedUrls = [];
      for (let index = 0; index < filesToUpload.length; index += 1) {
        uploadedUrls.push(await uploadFile(filesToUpload[index], index, filesToUpload.length));
      }

      setFormValues((prev) => ({
        ...prev,
        images_list: [...(prev.images_list || []), ...uploadedUrls].slice(0, MAX_REFERENCES),
      }));
      toast.success("Reference images added");
    } catch (error) {
      console.error("Reference upload failed", error);
      toast.error(error.response?.data?.detail || "Reference upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const removeImage = (url) => {
    setFormValues((prev) => ({
      ...prev,
      images_list: (prev.images_list || []).filter((imageUrl) => imageUrl !== url),
    }));
  };

  return (
    <div
      className={`nowheel group flex flex-col w-80 min-h-[260px] rounded-2xl border-2 relative transition-all duration-300 ease-in-out ${
        selected
          ? "border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.25)] scale-[1.02] ring-1 ring-emerald-500/20"
          : "border-zinc-800 hover:border-zinc-700 shadow-lg"
      } bg-[#0c0d0f]/95 backdrop-blur-sm`}
    >
      <h3 className="absolute -top-5 left-0 text-zinc-400 text-[10px] font-medium tracking-wider uppercase">
        Reference {id.replace(/^\D+/g, "")}
      </h3>
      <div className="flex items-center justify-between bg-gradient-to-r from-[#151618] to-[#1c1e21] rounded-t-2xl border-b border-zinc-800 py-2 px-3">
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-lg ${selected ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400"} transition-colors`}>
            <IoImagesOutline size={15} />
          </div>
          <div className="flex flex-col">
            <h3 className="text-xs font-bold text-zinc-100">Reference Images</h3>
            <span className="text-[10px] text-zinc-500">{images.length}/{MAX_REFERENCES} locked references</span>
          </div>
        </div>
        <NodeOptionsMenu nodeId={id} onDuplicate={data.duplicateNode} onDelete={handleDeleteNode} />
      </div>

      <label
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          handleFiles(event.dataTransfer.files);
        }}
        className="m-3 flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-emerald-500/30 bg-emerald-500/5 px-4 py-5 text-center transition hover:border-emerald-500/60 hover:bg-emerald-500/10"
      >
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          multiple
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = "";
          }}
          disabled={uploading || images.length >= MAX_REFERENCES}
        />
        {uploading ? (
          <div className="flex w-full flex-col gap-2">
            <span className="text-xs font-medium text-white">Uploading... {uploadProgress}%</span>
            <div className="h-1 overflow-hidden rounded bg-zinc-800">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        ) : (
          <>
            <FiUpload className="text-emerald-400" size={22} />
            <span className="text-xs font-semibold text-zinc-200">Upload style references</span>
            <span className="text-[10px] text-zinc-500">Drop images here or click to add up to 10</span>
          </>
        )}
      </label>

      <div className="grid grid-cols-5 gap-2 px-3 pb-3">
        {images.map((url) => (
          <div key={url} className="group/image relative aspect-square overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
            <img src={url} alt="Reference" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => removeImage(url)}
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition group-hover/image:opacity-100"
            >
              <IoClose size={14} />
            </button>
          </div>
        ))}
        {images.length === 0 && (
          <div className="col-span-5 flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/40 py-8 text-[10px] text-zinc-500">
            No references yet
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="imageOutput"
        style={{ top: 100, width: 12, height: 12, transition: "all 0.2s ease-in-out" }}
        className={`!right-[-8px] !rounded-full !border-[3px] transition-all ${
          connectedOutputs
            ? "!bg-emerald-600 !border-zinc-900 shadow-[0_0_15px_rgba(16,185,129,0.8)]"
            : "!bg-zinc-900 !border-emerald-600/50 hover:!border-emerald-600 shadow-sm"
        }`}
        data-type="green"
      />
      <p
        className={`absolute -right-12 top-[100px] text-xs text-emerald-500 transition-opacity duration-200 ${
          data.activeHandleColor === "green" ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        Images
      </p>
    </div>
  );
};

export default ReferenceNode;
