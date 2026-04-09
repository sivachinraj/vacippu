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
  tamil: "Tamil",
  hindi: "Hindi",
  english: "English",
  telugu: "Telugu",
  kannada: "Kannada",
  malayalam: "Malayalam",
  bengali: "Bengali",
  marathi: "Marathi",
  gujarati: "Gujarati",
  punjabi: "Punjabi",
};

const lengthInstructions: Record<string, Record<string, string>> = {
  reading: {
    veryshort: "Write exactly 2 vivid sentences (15-20 words total).",
    short: "Write 3-4 descriptive sentences (30-45 words).",
    medium: "Write 5-7 rich sentences (70-110 words).",
    long: "Write 9-12 detailed sentences (130-190 words).",
  },
  moral_story: {
    veryshort: "Write a 2-sentence story (15-20 words) with a surprising twist and a quick moral.",
    short: "Write a 4-5 sentence story (40-55 words). Named character, problem, solution, moral.",
    medium: "Write a 7-9 sentence story (90-130 words). Named character, challenge, unexpected moment, heartfelt moral.",
    long: "Write a 12-15 sentence story (160-230 words). Full arc: vivid characters, tension, surprise, warm resolution, natural moral.",
  },
  fable: {
    veryshort: "Write a 2-sentence fable (15-20 words) with two animal characters and an ironic moral.",
    short: "Write a 4-5 sentence fable (40-55 words). Two named animals, one clever one foolish, clear moral.",
    medium: "Write a 7-9 sentence fable (90-130 words). Named animals with personality, brief dialogue, conflict, earned moral.",
    long: "Write a 12-15 sentence fable (160-230 words). Rich animal characters, dialogue, multi-step conflict, clever resolution, timeless moral.",
  },
};

const imageStyleByType: Record<string, string> = {
  reading: "colorful educational children's book illustration, bright cheerful scene",
  moral_story: "warm storybook illustration, expressive characters with emotions, soft golden lighting",
  fable: "classic fable illustration, anthropomorphic animals in lush natural setting, expressive faces",
};

async function callOllama(system: string, user: string, ollamaUrl: string): Promise<string> {
  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen2.5:7b",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      stream: false,
      options: { temperature: 0.85, top_p: 0.95, num_predict: 2048 },
    }),
  });
  if (!response.ok) throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.message?.content ?? "";
}

function parseJSON(raw: string): Record<string, unknown> {
  const clean = raw.replace(/```json\n?|\n?```/g, "").trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found");
  return JSON.parse(match[0]);
}

async function generateImageWithComfyUI(imagePrompt: string, comfyUrl: string): Promise<string | null> {
  const workflow = {
    "3": {
      class_type: "KSampler",
      inputs: {
        cfg: 7.5, denoise: 1,
        latent_image: ["5", 0], model: ["4", 0],
        negative: ["7", 0], positive: ["6", 0],
        sampler_name: "dpmpp_2m", scheduler: "karras",
        seed: Math.floor(Math.random() * 1000000000), steps: 25,
      },
    },
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "dreamshaper_8.safetensors" } },
    "5": { class_type: "EmptyLatentImage", inputs: { batch_size: 1, height: 512, width: 512 } },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["4", 1], text: `${imagePrompt}, children's book illustration, cute cartoon style, vibrant colors, soft shading, storybook art, no text, no words` },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["4", 1], text: "text, words, letters, watermark, nsfw, ugly, blurry, bad anatomy, realistic photo, dark, scary, violence, low quality" },
    },
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
    "9": { class_type: "SaveImage", inputs: { filename_prefix: "vacippu", images: ["8", 0] } },
  };

  const queueRes = await fetch(`${comfyUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!queueRes.ok) { console.error("ComfyUI queue error:", await queueRes.text()); return null; }

  const { prompt_id } = await queueRes.json();

  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const historyRes = await fetch(`${comfyUrl}/history/${prompt_id}`);
    if (!historyRes.ok) continue;
    const history = await historyRes.json();
    const job = history[prompt_id];
    if (!job) continue;
    const outputs = job.outputs?.["9"]?.images;
    if (!outputs?.length) continue;
    const imgRes = await fetch(`${comfyUrl}/view?filename=${outputs[0].filename}&subfolder=${outputs[0].subfolder}&type=${outputs[0].type}`);
    if (!imgRes.ok) return null;
    const bytes = new Uint8Array(await imgRes.arrayBuffer());
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return `data:image/png;base64,${btoa(binary)}`;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { topic, language, length = "medium", contentType = "reading" }: GenerateReadingRequest = await req.json();

    const OLLAMA_URL = "https://asking-reproduce-peripherals-frederick.trycloudflare.com";
    const COMFY_URL = "https://cycles-resist-murray-luther.trycloudflare.com";

    const languageDisplay = languageNames[language] || language;
    const lengthInstruction = lengthInstructions[contentType]?.[length] ?? lengthInstructions.reading.medium;
    const imageStyle = imageStyleByType[contentType] ?? imageStyleByType.reading;

    // ── STEP 1: Generate a beautiful creative English story ─────────────────
    const contentTypeLabel = contentType === "reading" ? "educational reading passage"
      : contentType === "moral_story" ? "children's moral story"
      : "children's fable with talking animal characters";

    const englishStory = await callOllama(
      `You are an award-winning children's author. You write imaginative, vivid, emotionally resonant stories. Every story you write feels original and alive. You never use clichés. You always give characters memorable Tamil/Indian names.`,
      `Write a creative ${contentTypeLabel} about "${topic}" for children.

${lengthInstruction}

Requirements:
- Give the main character a memorable Tamil or Indian name (e.g. Meena, Arjun, Kavya, Ravi, Priya, Muthukumar)
- Choose an unexpected, delightful angle — surprise the reader
- Include at least 2 vivid sensory details (sounds, smells, textures, colours)
- Vary sentence rhythm: mix short punchy sentences with longer flowing ones
- NO clichés, NO generic plot lines
${contentType === "fable" ? "- Animals must have witty dialogue and distinct personalities\n- Moral emerges naturally from the story" : ""}
${contentType === "moral_story" ? "- Create genuine emotional tension before resolution\n- Moral must feel discovered, not lectured" : ""}
${contentType === "reading" ? "- Include one surprising or little-known fact about the topic\n- Use vivid comparisons children will understand" : ""}

Also write:
- A catchy, creative title
- 5-7 key vocabulary words from the story
- An image_prompt: describe the most visually exciting scene in specific detail
${contentType !== "reading" ? "- A one-sentence moral" : ""}

Return ONLY valid JSON, no markdown:
{
  "title": "...",
  "content": "...",
  "keywords": ["word1", "word2", "word3", "word4", "word5"],
  ${contentType !== "reading" ? '"moral": "...",' : ""}
  "image_prompt": "A ${imageStyle} showing [specific characters by name doing specific action], [describe setting with 2-3 vivid colour/mood details], cute cartoon children's book style, vibrant, warm, no text"
}`
    );

    let englishContent: Record<string, unknown>;
    try {
      englishContent = parseJSON(englishStory);
    } catch {
      console.error("Failed to parse English story:", englishStory);
      throw new Error("Failed to generate story");
    }

    // ── STEP 2: Translate to target language ────────────────────────────────
    let parsedContent: Record<string, unknown>;

    if (language === "english") {
      parsedContent = englishContent;
    } else {
      const fieldsToTranslate: Record<string, unknown> = {
        title: englishContent.title,
        content: englishContent.content,
        keywords: englishContent.keywords,
      };
      if (contentType !== "reading") fieldsToTranslate.moral = englishContent.moral;

      const translated = await callOllama(
        `You are a master literary translator specialising in children's literature. You translate into ${languageDisplay} with the skill of a native author — natural, flowing, beautiful. You NEVER use English or Sanskrit loanwords when a native ${languageDisplay} word exists. You use only pure, simple ${languageDisplay} vocabulary that children aged 6-12 would understand.`,
        `Translate this children's story into ${languageDisplay}.

CRITICAL RULES:
1. Use ONLY pure ${languageDisplay} words — NO English words, NO Sanskrit words
2. Write as if the story was originally written in ${languageDisplay} by a native author
3. Use simple, everyday ${languageDisplay} vocabulary that children understand
4. Keep the same emotional warmth and creativity of the original
5. Use the correct script (${language === "tamil" ? "தமிழ் script" : language === "hindi" ? "Devanagari script" : language === "telugu" ? "Telugu script" : language === "kannada" ? "Kannada script" : language === "malayalam" ? "Malayalam script" : language === "bengali" ? "Bengali script" : "correct native script"})
6. keywords must be actual words from your translated content
7. Do NOT translate the image_prompt — leave it out entirely

English story to translate:
Title: ${englishContent.title}
Content: ${englishContent.content}
Keywords: ${JSON.stringify(englishContent.keywords)}
${contentType !== "reading" ? `Moral: ${englishContent.moral}` : ""}

Return ONLY valid JSON, no markdown:
{
  "title": "translated title in ${languageDisplay} script",
  "content": "translated story in ${languageDisplay} script",
  "keywords": ["word1 in ${languageDisplay}", "word2", "word3", "word4", "word5"]${contentType !== "reading" ? `,\n  "moral": "translated moral in ${languageDisplay} script"` : ""}
}`
      );

      try {
        const translatedContent = parseJSON(translated);
        parsedContent = {
          ...translatedContent,
          image_prompt: englishContent.image_prompt,
        };
      } catch {
        console.error("Translation failed, falling back to English:", translated);
        parsedContent = englishContent;
      }
    }

    // ── STEP 3: Generate image ───────────────────────────────────────────────
    const imagePrompt = (englishContent.image_prompt as string) ??
      `A ${imageStyle} about ${topic}, cute cartoon style, children's book art, vibrant colors, no text`;

    const imageBase64 = await generateImageWithComfyUI(imagePrompt, COMFY_URL);

    return new Response(
      JSON.stringify({ ...parsedContent, image: imageBase64 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
