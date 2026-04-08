import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GenerateReadingRequest {
  topic: string;
  language: string;
  length: "veryshort" | "short" | "medium" | "long";
  contentType?: "reading" | "moral_story" | "fable";
}

const languageNames: Record<string, string> = {
  tamil: "Tamil (தமிழ்)",
  hindi: "Hindi (हिंदी)",
  english: "English",
  telugu: "Telugu (తెలుగు)",
  kannada: "Kannada (ಕನ್ನಡ)",
  malayalam: "Malayalam (മലயாളം)",
  bengali: "Bengali (বাংলা)",
  marathi: "Marathi (मराठी)",
  gujarati: "Gujarati (ગુજરાતી)",
  punjabi: "Punjabi (ਪੰਜਾਬੀ)",
};

const lengthInstructions: Record<string, Record<string, string>> = {
  reading: {
    veryshort: "Write exactly 1-2 vivid sentences (12-20 words). Punchy and memorable for beginners.",
    short: "Write 3-4 descriptive sentences (25-40 words). Each sentence should paint a clear picture.",
    medium: "Write 5-7 rich sentences (70-110 words). Include sensory details and interesting facts.",
    long: "Write 9-12 detailed sentences (130-190 words). Build depth with examples, descriptions and engaging details.",
  },
  moral_story: {
    veryshort: "Write a tiny 2-sentence story (15-20 words) with a surprising twist and a quick moral.",
    short: "Write a 4-5 sentence story (35-50 words). Give the main character a name, a problem, and a solution that reveals the moral.",
    medium: "Write a 7-9 sentence story (90-130 words). Include a named character, a challenge, an unexpected moment, and a heartfelt moral.",
    long: "Write a 12-15 sentence story (160-230 words). Build a full arc: introduce characters with personality, create tension, surprise the reader, resolve it warmly, and state the moral naturally.",
  },
  fable: {
    veryshort: "Write a 2-sentence fable (15-20 words) with two animal characters and an ironic moral.",
    short: "Write a 4-5 sentence fable (35-50 words). Two named animal characters, one clever and one foolish, with a clear moral.",
    medium: "Write a 7-9 sentence fable (90-130 words). Named animal characters with distinct personalities, brief dialogue, a conflict, and a moral that feels earned.",
    long: "Write a 12-15 sentence fable (160-230 words). Rich animal characters with dialogue, a multi-step conflict, clever resolution, and a timeless moral.",
  },
};

const contentTypePrompts: Record<string, string> = {
  reading: "educational reading passage",
  moral_story: "short moral story with a clear lesson at the end",
  fable: "traditional fable with talking animal characters and a moral",
};

const imageStyleByType: Record<string, string> = {
  reading: "colorful educational children's book illustration, bright cheerful scene",
  moral_story: "warm storybook illustration, expressive characters with emotions, soft lighting",
  fable: "classic fable illustration, anthropomorphic animals in a lush natural setting, expressive faces",
};

async function generateTextWithOllama(
  systemPrompt: string,
  userPrompt: string,
  ollamaUrl: string
): Promise<string> {
  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen2.5:7b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: false,
      options: {
        temperature: 0.9,
        top_p: 0.95,
        num_predict: 2048,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ollama error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.message?.content ?? "";
}

async function generateImageWithComfyUI(
  imagePrompt: string,
  comfyUrl: string
): Promise<string | null> {
  const workflow = {
    "3": {
      class_type: "KSampler",
      inputs: {
        cfg: 7.5,
        denoise: 1,
        latent_image: ["5", 0],
        model: ["4", 0],
        negative: ["7", 0],
        positive: ["6", 0],
        sampler_name: "dpmpp_2m",
        scheduler: "karras",
        seed: Math.floor(Math.random() * 1000000000),
        steps: 25,
      },
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "dreamshaper_8.safetensors" },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: { batch_size: 1, height: 512, width: 512 },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["4", 1],
        text: `${imagePrompt}, children's book illustration, cute cartoon style, vibrant colors, DreamShaper, highly detailed, soft shading, storybook art, no text, no words, no letters`,
      },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["4", 1],
        text: "text, words, letters, watermark, nsfw, ugly, blurry, bad anatomy, realistic photo, dark, scary, violence, low quality, deformed",
      },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: { samples: ["3", 0], vae: ["4", 2] },
    },
    "9": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "vacippu", images: ["8", 0] },
    },
  };

  const queueRes = await fetch(`${comfyUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });

  if (!queueRes.ok) {
    console.error("ComfyUI queue error:", await queueRes.text());
    return null;
  }

  const { prompt_id } = await queueRes.json();

  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const historyRes = await fetch(`${comfyUrl}/history/${prompt_id}`);
    if (!historyRes.ok) continue;

    const history = await historyRes.json();
    const job = history[prompt_id];
    if (!job) continue;

    const outputs = job.outputs?.["9"]?.images;
    if (!outputs || outputs.length === 0) continue;

    const imgRes = await fetch(
      `${comfyUrl}/view?filename=${outputs[0].filename}&subfolder=${outputs[0].subfolder}&type=${outputs[0].type}`
    );
    if (!imgRes.ok) return null;

    const arrayBuffer = await imgRes.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return `data:image/png;base64,${btoa(binary)}`;
  }

  console.error("ComfyUI timed out");
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      topic,
      language,
      length = "medium",
      contentType = "reading",
    }: GenerateReadingRequest = await req.json();

    const OLLAMA_URL = Deno.env.get("OLLAMA_URL") ?? "https://asking-reproduce-peripherals-frederick.trycloudflare.com";
    const COMFY_URL = Deno.env.get("COMFY_URL") ?? "https://cycles-resist-murray-luther.trycloudflare.com";

    const languageDisplay = languageNames[language] || language;
    const lengthInstruction = lengthInstructions[contentType]?.[length] ?? lengthInstructions.reading.medium;
    const contentDescription = contentTypePrompts[contentType] ?? contentTypePrompts.reading;
    const imageStyle = imageStyleByType[contentType] ?? imageStyleByType.reading;

    const systemPrompt = `You are a gifted, imaginative children's author writing for the language learning app வாசிபு (Vacippu). You create stories and passages that feel alive — with vivid imagery, memorable characters, unexpected moments, and emotional warmth. Your writing never feels generic or formulaic.

Core rules:
- Write the title, content, keywords${contentType !== "reading" ? ", and moral" : ""} ENTIRELY in ${languageDisplay} using the correct script
- Write ONLY the image_prompt field in English
- Use rich, age-appropriate vocabulary that stretches young readers without losing them
- Give characters unique names and distinct personalities
- Include sensory details: colours, sounds, smells, textures, feelings
- Use varied sentence rhythm — mix short punchy sentences with longer flowing ones
- Avoid clichés and predictable plot lines
${contentType === "fable" ? "- Animals must have clever, witty dialogue that reveals their character\n- The moral should feel like a natural discovery, not a lecture" : ""}
${contentType === "moral_story" ? "- The moral must emerge organically from events, never feel preachy\n- Create a moment of genuine surprise or emotion before the resolution" : ""}
${contentType === "reading" ? "- Weave in surprising or little-known facts to spark curiosity\n- Use metaphors and comparisons appropriate for children" : ""}
- Respond ONLY with valid JSON — no markdown fences, no extra text`;

    const userPrompt = `Write an original, imaginative ${contentDescription} about "${topic}" in ${languageDisplay}.

Length requirement: ${lengthInstruction}

Creative direction:
- Choose an unexpected angle or setting for "${topic}" that children will find delightful
- Give any characters vivid names and clear personalities
- Include at least one surprising detail, clever twist, or emotional moment
- Make the language feel natural and flowing in ${languageDisplay}, not like a translation
- The image_prompt must describe the most visually exciting scene from the content in English, specific enough to generate a beautiful illustration

Return ONLY this JSON with no markdown:
{
  "title": "Creative title in ${languageDisplay}",
  "content": "The full ${contentType === "reading" ? "passage" : "story"} in ${languageDisplay}",
  "keywords": ["5 to 7 key vocabulary words from the content in ${languageDisplay}"]${contentType !== "reading" ? `,
  "moral": "One sentence moral in ${languageDisplay}"` : ""},
  "image_prompt": "A ${imageStyle} showing [specific character names and actions from the story], [describe setting with colours and mood], [key visual elements], cute cartoon style, children's book art, vibrant, no text"
}`;

    const rawText = await generateTextWithOllama(systemPrompt, userPrompt, OLLAMA_URL);

    let parsedContent: Record<string, unknown>;
    try {
      const clean = rawText.replace(/```json\n?|\n?```/g, "").trim();
      parsedContent = JSON.parse(clean);
    } catch {
      console.error("Failed to parse Ollama response:", rawText);
      throw new Error("Failed to parse AI response as JSON");
    }

    const imagePrompt =
      (parsedContent.image_prompt as string) ??
      `A ${imageStyle} about ${topic}, cute cartoon style, children's book art, vibrant colors, no text`;

    const imageBase64 = await generateImageWithComfyUI(imagePrompt, COMFY_URL);

    return new Response(
      JSON.stringify({ ...parsedContent, image: imageBase64 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-reading function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
