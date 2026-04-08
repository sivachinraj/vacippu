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
  telugu: "Telugu (తెலுగு)",
  kannada: "Kannada (ಕನ್ನಡ)",
  malayalam: "Malayalam (മலயாളം)",
  bengali: "Bengali (বাংলা)",
  marathi: "Marathi (मराठी)",
  gujarati: "Gujarati (ગુજરાતી)",
  punjabi: "Punjabi (ਪੰਜਾਬੀ)",
};

const lengthInstructions: Record<string, Record<string, string>> = {
  reading: {
    veryshort: "Write exactly 2 simple sentences (about 12-20 words total). Very brief, for beginners.",
    short: "Write 2-4 simple sentences (about 20-35 words). Quick and easy to read.",
    medium: "Write 5-7 sentences (about 60-100 words). This is for intermediate readers.",
    long: "Write 8-12 sentences (about 120-180 words). This is for advanced readers.",
  },
  moral_story: {
    veryshort: "Write a tiny story of exactly 2 sentences (about 12-20 words) with a quick moral.",
    short: "Write a very short story of 2-4 sentences (about 20-35 words) with a clear moral.",
    medium: "Write a short story of 6-8 sentences (about 80-120 words) with a clear moral at the end.",
    long: "Write a story of 10-15 sentences (about 150-220 words) with a clear moral at the end.",
  },
  fable: {
    veryshort: "Write a tiny fable of exactly 2 sentences (about 12-20 words) with animal characters and a moral.",
    short: "Write a brief fable of 2-4 sentences (about 20-35 words) with animal characters and a moral.",
    medium: "Write a fable of 6-8 sentences (about 80-120 words) with animal characters and a moral.",
    long: "Write a fable of 10-15 sentences (about 150-220 words) with animal characters and a moral.",
  },
};

const contentTypePrompts: Record<string, string> = {
  reading: "educational reading passage",
  moral_story: "short moral story with a clear lesson at the end",
  fable: "traditional fable in the style of Aesop's fables with animal characters who talk and act like humans",
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
        temperature: 0.8,
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
        cfg: 7,
        denoise: 1,
        latent_image: ["5", 0],
        model: ["4", 0],
        negative: ["7", 0],
        positive: ["6", 0],
        sampler_name: "euler",
        scheduler: "normal",
        seed: Math.floor(Math.random() * 1000000000),
        steps: 20,
      },
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "v1-5-pruned-emaonly.ckpt" },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: { batch_size: 1, height: 512, width: 512 },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["4", 1],
        text: `${imagePrompt}, cute cartoon, children's illustration, colorful, bright, no text`,
      },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["4", 1],
        text: "text, watermark, nsfw, ugly, blurry, bad anatomy, realistic photo",
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

  for (let i = 0; i < 60; i++) {
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
    const lengthInstruction =
      lengthInstructions[contentType]?.[length] ?? lengthInstructions.reading.medium;
    const contentDescription = contentTypePrompts[contentType] ?? contentTypePrompts.reading;

    const systemPrompt = `You are an educational content creator for the app வாசிபு (Vacippu), specialising in ${contentDescription}s for language learners.

Rules:
- Write the title, content, keywords${contentType !== "reading" ? ", and moral" : ""} ENTIRELY in ${languageDisplay}.
- ONLY the image_prompt field must be written in English.
- Use simple, clear vocabulary suitable for learners.
${contentType === "fable" ? "- Use animal characters who speak and act like humans.\n- Include brief dialogue." : ""}
${contentType === "moral_story" ? "- Build a simple narrative arc. End with a clear moral lesson." : ""}
- Use the correct script for the language (Tamil script for Tamil, Devanagari for Hindi, etc).
- Respond ONLY with valid JSON — no markdown, no extra text.`;

    const userPrompt = `Create a ${contentDescription} about "${topic}" in ${languageDisplay}.

Length requirement: ${lengthInstruction}

Also provide:
1. A suitable title (in ${languageDisplay})
2. 3-5 key vocabulary words from the passage (in ${languageDisplay})
3. An image_prompt in English describing a cute cartoon children's illustration scene for this ${contentType}
${contentType !== "reading" ? `4. The moral of the story in one sentence (in ${languageDisplay})` : ""}

Return ONLY this JSON (no markdown):
{
  "title": "...",
  "content": "...",
  "keywords": ["word1", "word2", "word3"]${contentType !== "reading" ? ',\n  "moral": "..."' : ""},
  "image_prompt": "..."
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
      `cute cartoon children's illustration about ${topic}`;

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