import axios from "axios";

export const uploadFile = async (file, onUploadProgress) => {
  const response = await axios.post(
    `/api/app/upload?filename=${encodeURIComponent(file.name)}`,
    file,
    {
      headers: { "Content-Type": file.type || "application/octet-stream" },
      onUploadProgress,
    },
  );
  return response.data.url;
};
