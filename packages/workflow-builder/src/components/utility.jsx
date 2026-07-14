import { toast } from "react-hot-toast";

export const imageModels = [
  {
    id: "image-passthrough",
    name: "Input Image",
    input_params: {
      properties: {
        "image_url": {
          "examples": [],
          "description": "URL of the input image.",
          "field": "image",
          "type": "string",
          "title": "Image URL",
          "name": "image_url"
        },
      },
      required: ["prompt"],
    }
  },
  {
    id: "gpt-image-1.5",
    name: "GPT Image 1.5",
    input_params: {}
  },
  {
    id: "nano-banana",
    name: "Nano Banana",
    input_params: {}
  },
  {
    id: "nano-banana-edit",
    name: "Nano Banana Edit",
    input_params: {}
  },
  {
    id: "nano-banana-pro",
    name: "Nano Banana Pro",
    input_params: {}
  },
  {
    id: "nano-banana-pro-edit",
    name: "Nano Banana Pro Edit",
    input_params: {}
  },
  {
    id: "flux-schnell",
    name: "Flux Schnell",
    input_params: {}
  },
  {
    id: "flux-2-dev",
    name: "Flux 2 Dev",
    input_params: {}
  },
  {
    id: "flux-2-dev-edit",
    name: "Flux 2 Dev Edit",
    input_params: {}
  },
  {
    id: "flux-2-flex",
    name: "Flux 2 Flex",
    input_params: {}
  },
  {
    id: "flux-2-flex-edit",
    name: "Flux 2 Flex Edit",
    input_params: {}
  },
  {
    id: "flux-2-pro",
    name: "Flux 2 Pro",
    input_params: {}
  },
  {
    id: "flux-2-pro-edit",
    name: "Flux 2 Pro Edit",
    input_params: {}
  },
  {
    id: "bytedance-seedream-v4",
    name: "Bytedance Seedream v4",
    input_params: {}
  },
  {
    id: "bytedance-seedream-edit-v4",
    name: "Bytedance Seedream Edit v4",
    input_params: {}
  },
  {
    id: "bytedance-seedream-v4.5",
    name: "Seedream v4.5",
    input_params: {}
  },
  {
    id: "bytedance-seedream-v4.5-edit",
    name: "Seedream v4.5 Edit",
    input_params: {}
  },
  {
    id: "wan2.5-text-to-image",
    name: "Wan 2.5 Text to Image",
    input_params: {}
  },
  {
    id: "wan2.5-image-edit",
    name: "Wan 2.5 Image Edit",
    input_params: {}
  },
  {
    id: "wan2.6-text-to-image",
    name: "Wan 2.6 Text to Image",
    input_params: {}
  },
  {
    id: "wan2.6-image-edit",
    name: "Wan 2.6 Image Edit",
    input_params: {}
  },
  {
    id: "qwen-image",
    name: "Qwen Image",
    input_params: {}
  },
  {
    id: "qwen-image-edit-2511",
    name: "Qwen Image Edit 2511",
    input_params: {}
  },
  {
    id: "qwen-image-edit",
    name: "Qwen Image Edit",
    input_params: {}
  },
  {
    id: "qwen-image-edit-plus",
    name: "Qwen Image Edit Plus",
    input_params: {}
  },
  {
    id: "qwen-image-edit-plus-lora",
    name: "Qwen Image Edit Plus (LoRA)",
    input_params: {}
  },
  {
    id: "z-image-turbo",
    name: "Z Image Turbo",
    input_params: {}
  },
  {
    id: "chroma-image",
    name: "Chroma Image",
    input_params: {}
  },
  {
    id: "kling-o1-text-to-image",
    name: "Kling O1 Text to Image",
    input_params: {}
  },
  {
    id: "kling-o1-edit-image",
    name: "Kling O1 Image Edit",
    input_params: {}
  },
  {
    id: "grok-imagine-text-to-image",
    name: "Grok Imagine",
    input_params: {}
  },
  {
    id: "hunyuan-image-2.1",
    name: "Hunyuan Image 2.1",
    input_params: {}
  },
  {
    id: "hunyuan-image-3.0",
    name: "Hunyuan Image 3.0",
    input_params: {}
  },
  {
    id: "google-imagen4",
    name: "Google Imagen 4",
    input_params: {}
  },
  {
    id: "google-imagen4-fast",
    name: "Google Imagen 4 Fast",
    input_params: {}
  },
  {
    id: "google-imagen4-ultra",
    name: "Google Imagen 4 Ultra",
    input_params: {}
  },
  {
    id: "midjourney-v7-text-to-image",
    name: "Midjourney v7 Text to Image",
    input_params: {}
  },
  {
    id: "midjourney-v7-image-to-image",
    name: "Midjourney v7 Image to Image",
    input_params: {}
  },
  {
    id: "midjourney-v7-omni-reference",
    name: "Midjourney v7 Omni Reference",
    input_params: {}
  },
  {
    id: "midjourney-v7-style-reference",
    name: "Midjourney v7 Style Reference",
    input_params: {}
  },
  {
    id: "vidu-q2-text-to-image",
    name: "Vidu Q2 Text to Image",
    input_params: {}
  },
  {
    id: "vidu-q2-reference-to-image",
    name: "Vidu Q2 Reference Image",
    input_params: {}
  }
];

export const videoModels = [
  {
    id: "video-passthrough",
    name: "Input Video",
    input_params: {
      properties: {
        "video_url": {
          "examples": [],
          "description": "URL of the input video.",
          "field": "video",
          "type": "string",
          "title": "Video URL",
          "name": "video_url"
        },
      },
      required: ["prompt"],
    }
  },
  {
    id: "seedance-lite-i2v",
    name: "Seedance Lite I2V",
    input_params: {}
  },
  {
    id: "seedance-lite-t2v",
    name: "Seedance Lite T2V",
    input_params: {}
  },
  {
    id: "seedance-pro-t2v",
    name: "Seedance Pro T2V",
    input_params: {}
  },
  {
    id: "seedance-pro-i2v",
    name: "Seedance Pro I2V",
    input_params: {}
  },
  {
    id: "seedance-pro-t2v-fast",
    name: "Seedance Pro T2V Fast",
    input_params: {}
  },
  {
    id: "seedance-pro-i2v-fast",
    name: "Seedance Pro I2V Fast",
    input_params: {}
  },

  {
    id: "seedance-v1.5-pro-i2v",
    name: "Seedance v1.5 Pro I2V",
    input_params: {}
  },
  {
    id: "seedance-v1.5-pro-t2v",
    name: "Seedance v1.5 Pro T2V",
    input_params: {}
  },
  {
    id: "seedance-v1.5-pro-i2v-fast",
    name: "Seedance v1.5 Pro I2V Fast",
    input_params: {}
  },
  {
    id: "seedance-v1.5-pro-t2v-fast",
    name: "Seedance v1.5 Pro T2V Fast",
    input_params: {}
  },
  {
    id: "seedance-v1.5-pro-video-extend",
    name: "Seedance v1.5 Pro Video Extend",
    input_params: {}
  },
  {
    id: "seedance-v1.5-pro-video-extend-fast",
    name: "Seedance v1.5 Pro Video Extend Fast",
    input_params: {}
  },

  {
    id: "veo3.1-image-to-video",
    name: "Veo3.1 I2V",
    input_params: {}
  },
  {
    id: "veo3.1-text-to-video",
    name: "Veo3.1 T2V",
    input_params: {}
  },
  {
    id: "veo3.1-fast-image-to-video",
    name: "Veo3.1 Fast I2V",
    input_params: {}
  },
  {
    id: "veo3.1-fast-text-to-video",
    name: "Veo3.1 Fast T2V",
    input_params: {}
  },
  {
    id: "wan2.2-text-to-video",
    name: "Wan 2.2 T2V",
    input_params: {}
  },
  {
    id: "wan2.2-image-to-video",
    name: "Wan 2.2 I2V",
    input_params: {}
  },
  {
    id: "wan2.2-5b-fast-t2v",
    name: "Wan 2.2 5B Fast T2V",
    input_params: {}
  },
  {
    id: "wan2.2-animate",
    name: "Wan 2.2 Animate",
    input_params: {}
  },
  {
    id: "wan2.2-edit-video",
    name: "Wan 2.2 Video Edit",
    input_params: {}
  },
  {
    id: "wan2.2-spicy-image-to-video",
    name: "Wan 2.2 Spicy I2V",
    input_params: {}
  },
  {
    id: "wan2.2-spicy-video-extend",
    name: "Wan 2.2 Spicy Extend",
    input_params: {}
  },
  {
    id: "wan2.5-text-to-video",
    name: "Wan 2.5 T2V",
    input_params: {}
  },
  {
    id: "wan2.5-image-to-video",
    name: "Wan 2.5 I2V",
    input_params: {}
  },
  {
    id: "wan2.5-text-to-video-fast",
    name: "Wan 2.5 Fast T2V",
    input_params: {}
  },
  {
    id: "wan2.5-image-to-video-fast",
    name: "Wan 2.5 Fast I2V",
    input_params: {}
  },
  {
    id: "wan2.6-text-to-video",
    name: "Wan 2.6 T2V",
    input_params: {}
  },
  {
    id: "wan2.6-image-to-video",
    name: "Wan 2.6 I2V",
    input_params: {}
  },
  {
    id: "openai-sora",
    name: "OpenAI Sora",
    input_params: {}
  },
  {
    id: "openai-sora-2-text-to-video",
    name: "Sora 2 T2V",
    input_params: {}
  },
  {
    id: "openai-sora-2-image-to-video",
    name: "Sora 2 I2V",
    input_params: {}
  },
  {
    id: "openai-sora-2-pro-text-to-video",
    name: "Sora 2 Pro T2V",
    input_params: {}
  },
  {
    id: "openai-sora-2-pro-image-to-video",
    name: "Sora 2 Pro I2V",
    input_params: {}
  },
  {
    id: "kling-v2.5-turbo-pro-t2v",
    name: "Kling v2.5 Turbo Pro T2V",
    input_params: {}
  },
  {
    id: "kling-v2.5-turbo-pro-i2v",
    name: "Kling v2.5 Turbo Pro I2V",
    input_params: {}
  },
  {
    id: "kling-v2.5-turbo-std-i2v",
    name: "Kling v2.5 Turbo Std I2V",
    input_params: {}
  },
  {
    id: "kling-v2.6-pro-t2v",
    name: "Kling v2.6 Pro T2V",
    input_params: {}
  },
  {
    id: "kling-v2.6-pro-i2v",
    name: "Kling v2.6 Pro I2V",
    input_params: {}
  },
  {
    id: "kling-v2.6-pro-motion-control",
    name: "Kling v2.6 Pro Motion Control",
    input_params: {}
  },
  {
    id: "kling-o1-text-to-video",
    name: "Kling O1 T2V",
    input_params: {}
  },
  {
    id: "kling-o1-image-to-video",
    name: "Kling O1 I2V",
    input_params: {}
  },
  {
    id: "kling-o1-video-edit",
    name: "Kling O1 Video Edit",
    input_params: {}
  },
  {
    id: "kling-o1-video-edit-fast",
    name: "Kling O1 Video Edit Fast",
    input_params: {}
  },
  {
    id: "kling-o1-reference-to-video",
    name: "Kling O1 Reference",
    input_params: {}
  },
  {
    id: "kling-o1-standard-image-to-video",
    name: "Kling O1 Standard I2V",
    input_params: {}
  },
  {
    id: "kling-o1-standard-reference-to-video",
    name: "Kling O1 Standard Reference",
    input_params: {}
  },
  {
    id: "kling-o1-standard-video-edit",
    name: "Kling O1 Standard Video Edit",
    input_params: {}
  },
  {
    id: "grok-imagine-text-to-video",
    name: "Grok Imagine T2V",
    input_params: {}
  },
  {
    id: "grok-imagine-image-to-video",
    name: "Grok Imagine I2V",
    input_params: {}
  },
  {
    id: "hunyuan-text-to-video",
    name: "Hunyuan T2V",
    input_params: {}
  },
  {
    id: "hunyuan-fast-text-to-video",
    name: "Hunyuan Fast T2V",
    input_params: {}
  },
  {
    id: "hunyuan-image-to-video",
    name: "Hunyuan I2V",
    input_params: {}
  },
  {
    id: "midjourney-v7-image-to-video",
    name: "Midjourney v7 I2V",
    input_params: {}
  },
  {
    id: "vidu-q2-turbo-start-end-video",
    name: "Vidu Q2 Turbo Start/End",
    input_params: {}
  },
  {
    id: "vidu-q2-pro-start-end-video",
    name: "Vidu Q2 Pro Start/End",
    input_params: {}
  },
  {
    id: "vidu-q2-reference",
    name: "Vidu Q2 Reference",
    input_params: {}
  },
  {
    id: "luma-modify-video",
    name: "Luma Modify Video",
    input_params: {}
  },
  {
    id: "luma-flash-reframe",
    name: "Luma Flash Reframe",
    input_params: {}
  },
  {
    id: "video-combiner",
    name: "Video Combiner",
    input_params: {}
  }
];

export const textModels = [
  {
    id: "text-passthrough",
    name: "Input Text",
    input_params: {
      properties: {
        "prompt": {
          "examples": [
            ""
          ],
          "description": "Text prompt describing the image.",
          "type": "string",
          "title": "Prompt",
          "name": "prompt"
        }
      },
      required: ["prompt"],
    }
  },
  {
    id: "any-llm",
    name: "Any Llm",
    input_params: {}
  },
  {
    id: "openrouter-vision",
    name: "Openrouter Vision",
    input_params: {}
  },
  {
    id: "gpt-5-nano",
    name: "GPT5 Nano",
    input_params: {}
  },
  {
    id: "gpt-5-mini",
    name: "GPT5 Mini",
    input_params: {}
  }
];

export const audioModels = [
  {
    id: "audio-passthrough",
    name: "Input Audio",
    input_params: {
      properties: {
        "audio_url": {
          "examples": [],
          "description": "URL of the input audio.",
          "field": "audio",
          "type": "string",
          "title": "Audio URL",
          "name": "audio_url"
        },
      },
      required: ["audio_url"],
    }
  },
  {
    id: "suno-create-music",
    name: "Suno Create Music",
    input_params: {}
  },
  {
    id: "suno-extend-music",
    name: "Suno Extend Music",
    input_params: {}
  },
  {
    id: "suno-remix-music",
    name: "Suno Remix Music",
    input_params: {}
  },
  {
    id: "minimax-voice-clone",
    name: "Minimax Voice Clone",
    input_params: {}
  },
  {
    id: "minimax-speech-2.6-hd",
    name: "Minimax Speech 2.6 HD",
    input_params: {}
  },
  {
    id: "minimax-speech-2.6-turbo",
    name: "Minimax Speech 2.6 Turbo",
    input_params: {}
  }
];

export const concatModels = [
  {
    id: "prompt-concatenator",
    name: "Prompt Concatenator",
    input_params: {
      properties: {
        "prompt": {
          "examples": [
            ""
          ],
          "description": "Text prompt describing the image.",
          "type": "string",
          "title": "Prompt",
          "name": "prompt"
        }
      },
      required: ["prompt"],
    }
  }
];

export const videoCombinerModels = [
  {
    id: "video-combiner",
    name: "Video Combiner",
    input_params: {
      properties: {
        "videos_list": {
          "examples": [
            "https://d3adwkbyhxyrtq.cloudfront.net/webassets/videomodels/seedance-v2.0-i2v.mp4"
          ],
          "description": "Upload the video clips you want to combine, in order. Each clip can be 5–60 seconds.",
          "field": "videos_list",
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Video Clips",
          "name": "videos_list",
          "maxItems": 20
        },
        "aspect_ratio": {
          "enum": [
            "auto",
            "16:9",
            "9:16",
            "1:1",
            "4:3",
            "3:4",
            "21:9",
            "9:21"
          ],
          "title": "Aspect Ratio",
          "name": "aspect_ratio",
          "type": "string",
          "default": "auto",
          "description": "Output aspect ratio. 'auto' uses the aspect ratio of the first uploaded clip."
        }
      },
      required: ["videos_list"],
    }
  }
];

export const referenceModels = [
  {
    id: "reference-images",
    name: "Reference Images",
    input_params: {
      properties: {
        "images_list": {
          "examples": [],
          "description": "Locked visual references used to keep style, mood, colors, and composition coherent across generations.",
          "field": "images_list",
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Reference Images",
          "name": "images_list",
          "maxItems": 10
        }
      },
      required: ["images_list"],
    }
  }
];

export const apiNodeModels = [
  {
    id: "wavespeed",
    name: "Wavespeed API",
    input_params: {
      properties: {
        "model_url": {
          "default": "",
          "description": "https://wavespeed.ai/models/wavespeed-ai/flux-schnell",
          "type": "string",
          "format": "text",
          "required": true
        },
        "api_key": {
          "examples": "",
          "description": "API Key of the wavespeed ai.",
          "type": "string",
          "format": "text",
          "required": true
        },
      },
      required: ["model_url", "api_key"],
    }
  },
  {
    id: "straico",
    name: "Straico API",
    input_params: {
      properties: {
        "model_name": {
          "enum": [],
          "description": "Name of the model (e.g. sd-xl)",
          "type": "string",
          "default": "",
          "required": true
        },
        "model_type": {
          "enum": ["chat", "image", "video", "audio"],
          "default": "chat",
          "description": "Type of the model (e.g. chat, image, video, audio)",
          "type": "string",
          "required": true
        },
        "api_key": {
          "examples": "",
          "description": "API Key for Straico.",
          "type": "string",
          "format": "text",
          "required": true
        },
      },
      required: ["model_name", "model_type", "api_key"],
    }
  },
  {
    id: "runware",
    name: "Runware API",
    input_params: {
      properties: {
        "api_key": {
          "description": "Runware API Key",
          "type": "string",
          "format": "text",
          "required": true
        },
        "task_type": {
          "enum": ["imageInference", "textToVideo", "imageToVideo", "upscale", "removeBackground"],
          "description": "Task type (e.g. imageInference, textToVideo, imageToVideo, upscale)",
          "type": "string",
          "default": "imageInference",
          "required": true
        },
        "model_name": {
          "enum": [],
          "description": "AIR identifier of the model",
          "type": "string",
          "default": "",
          "required": false
        }
      },
      required: ["task_type", "api_key"]
    }
  },
  {
    id: "genvr",
    name: "GenVR API",
    input_params: {
      properties: {
        "uid": {
          "description": "Your GenVR User ID",
          "type": "string",
          "format": "text",
          "required": true
        },
        "api_key": {
          "description": "GenVR API Key",
          "type": "string",
          "format": "text",
          "required": true
        },
        "category": {
          "description": "Model category (e.g. imagegen)",
          "type": "string",
          "format": "text",
          "required": true
        },
        "subcategory": {
          "description": "Model identifier (e.g. flux_dev)",
          "type": "string",
          "format": "text",
          "required": true
        }
      },
      required: ["uid", "api_key", "category", "subcategory"]
    }
  }
];

export const downloadFile = async (file_url, filename = "download") => {
  if (!file_url) {
    toast.error("File URL not found");
    return;
  }

  try {
    const response = await fetch(file_url, { mode: "cors" });
    if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Download failed:", err);
    toast.error("Download failed");
  }
};

export const presets = [
  {
    id: "empty-workflow",
    title: "Empty Workflow",
    description: "",
    icon: "plus",
    image: "",
    nodes: [],
    edges: []
  }
];
