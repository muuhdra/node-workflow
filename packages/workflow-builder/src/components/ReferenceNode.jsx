import React, { useEffect, useRef, useState } from "react";
import { Handle, Position, useReactFlow, useStore } from "reactflow";
import { uploadFile as uploadLocalFile } from "./uploadFile";
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
    try {
      return await uploadLocalFile(file, (progressEvent) => {
        const fileProgress = progressEvent.total
          ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
          : 0;
        setUploadProgress(Math.round(((index + fileProgress / 100) / total) * 100));
      });
    } catch (error) {
      console.error("Reference upload failed", {
        status: error?.response?.status,
        detail: error?.response?.data?.detail || error?.response?.data || error?.message,
      });
      throw error;
    }
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

  const removeImage = (indexToRemove) => {
    setFormValues((prev) => ({
      ...prev,
      images_list: (prev.images_list || []).filter((_, index) => index !== indexToRemove),
    }));
  };

  const clearImages = () => {
    setFormValues((prev) => ({
      ...prev,
      images_list: [],
    }));
  };

  const controlsVisibility = selected
    ? "pointer-events-auto opacity-100"
    : "pointer-events-none opacity-0";

  return (
    <div
      className={`nowheel group relative flex w-[720px] min-h-[620px] flex-col rounded-[32px] border-[3px] bg-[#101112]/95 text-zinc-100 shadow-2xl transition-all duration-300 ease-in-out ${
        selected
          ? "border-emerald-500 shadow-[0_0_32px_rgba(16,185,129,0.24)] ring-2 ring-emerald-500/25"
          : "border-[#3d3d3d] hover:border-zinc-500"
      }`}
    >
      <div className="absolute -top-9 left-1 flex items-center gap-2">
        <IoImagesOutline size={18} className="text-zinc-300" />
        <h4 className="text-base font-black tracking-tight text-zinc-100">
          Reference #{id.replace(/^\D+/g, "") || "1"}
        </h4>
      </div>

      <div className="flex min-h-[104px] items-center justify-between rounded-t-[29px] border-b border-white/10 px-7 py-5">
        <div className="flex items-center gap-4">
          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-colors ${selected ? "bg-emerald-600 text-white" : "bg-emerald-950 text-emerald-400"}`}>
            <IoImagesOutline size={28} />
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-2xl font-black tracking-tight text-zinc-100">Reference Images</h3>
            <span className="text-sm font-medium text-zinc-500">
              {images.length}/{MAX_REFERENCES} locked references
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {images.length > 0 && (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                clearImages();
              }}
              className="nodrag flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 transition hover:bg-red-500/15 hover:text-red-400"
              title="Remove all references"
            >
              <IoTrashOutline size={20} />
            </button>
          )}
          <div className={`transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 ${controlsVisibility}`}>
            <NodeOptionsMenu nodeId={id} onDuplicate={data.duplicateNode} onDelete={handleDeleteNode} />
          </div>
        </div>
      </div>

      <label
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          handleFiles(event.dataTransfer.files);
        }}
        className={`nodrag mx-7 mt-7 flex min-h-[228px] flex-col items-center justify-center gap-4 rounded-[24px] border-2 border-dashed px-6 text-center transition ${
          uploading || images.length >= MAX_REFERENCES
            ? "cursor-not-allowed border-emerald-900/50 bg-emerald-950/10"
            : "cursor-pointer border-emerald-700/70 bg-emerald-950/20 hover:border-emerald-500 hover:bg-emerald-950/35"
        }`}
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
          <div className="flex w-full max-w-sm flex-col gap-3">
            <span className="text-sm font-bold text-white">Uploading references... {uploadProgress}%</span>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        ) : (
          <>
            <FiUpload className="text-emerald-500" size={40} />
            <span className="text-xl font-bold text-zinc-300">
              {images.length >= MAX_REFERENCES ? "Reference limit reached" : "Upload style references"}
            </span>
            <span className="text-sm font-medium text-zinc-600">
              {images.length >= MAX_REFERENCES
                ? "Remove an image before adding another reference"
                : `Drop images here or click to add up to ${MAX_REFERENCES}`}
            </span>
          </>
        )}
      </label>

      <div className="mx-7 mb-7 mt-6 grid min-h-[190px] grid-cols-5 content-start gap-3 rounded-[20px] border border-white/10 bg-black/15 p-4">
        {images.map((url, index) => (
          <div key={`${url}-${index}`} className="group/image relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-zinc-900">
            <img src={url} alt={`Reference ${index + 1}`} className="h-full w-full object-cover" />
            <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white/80">
              {index + 1}
            </span>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                removeImage(index);
              }}
              className="nodrag absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/80 text-white opacity-80 transition hover:border-red-400 hover:bg-red-500 hover:opacity-100"
              title="Remove reference"
            >
              <IoClose size={16} />
            </button>
          </div>
        ))}
        {images.length === 0 && (
          <div className="col-span-5 flex min-h-[156px] items-center justify-center text-sm font-medium text-zinc-700">
            No references yet
          </div>
        )}
      </div>

      <div
        className={`group/handle absolute -right-16 top-[270px] z-20 flex h-[52px] w-[52px] items-center justify-center rounded-full transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 ${
          selected || connectedOutputs ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <Handle
          type="source"
          position={Position.Right}
          id="imageOutput"
          style={{ right: 0, top: 26, width: 52, height: 52, opacity: 1, pointerEvents: "auto" }}
          className={`!rounded-full !border-[3px] transition-all ${
            connectedOutputs
              ? "!border-emerald-300 !bg-emerald-500 text-white shadow-[0_0_18px_rgba(16,185,129,0.75)]"
              : "!border-[#252525] !bg-[#252525] text-zinc-300 hover:!border-emerald-400"
          }`}
          data-type="green"
        />
        <IoImagesOutline className="pointer-events-none relative z-10 text-zinc-200" size={24} />
        <span className="pointer-events-none absolute left-16 hidden w-24 text-left text-[10px] font-semibold uppercase tracking-wide text-emerald-400 group-hover/handle:block">
          Images
        </span>
      </div>
    </div>
  );
};

export default ReferenceNode;
