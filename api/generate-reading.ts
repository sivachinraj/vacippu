import type { VercelRequest, VercelResponse } from "@vercel/node";

const OLLAMA_URL = "https://asking-reproduce-peripherals-frederick.trycloudflare.com";
const COMFY_URL = "https://cycles-resist-murray-luther.trycloudflare.com";

const languageNames: Record<string, string> = {
  tamil: "Tamil", hindi: "Hindi", english: "English", telugu: "Telugu",
  kannada: "Kannada", malayalam: "Malayalam", bengali: "Bengali",
  marathi: "Marathi", gujarati: "Gujarati", punjabi: "Punjabi",
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

async function callOllama(system: string, user: string): Promise<string> {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen2.5:7b",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
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

async function generateImage(imagePrompt: string): Promise<string | null> {
  try {
    const workflow = {
      "3": { class_type: "KSampler", inputs: { cfg: 7.5, denoise: 1, latent_image: ["5", 0], model: ["4", 0], negative: ["7", 0], positive: ["6", 0], sampler_name: "dpmpp_2m", scheduler: "karras", seed: Math.floor(Math.random() * 1000000000), steps: 25 } },
      "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "dreamshaper_8.safetensors" } },
      "5": { class_type: "EmptyLatentImage", inputs: { batch_size: 1, height: 512, width: 512 } },
      "6": { class_type: "CLIPTextEncode", inputs: { clip: ["4", 1], text: `${imagePrompt}, children's book illustration, cute cartoon style, vibrant colors, soft shading, storybook art, no text, no words` } },
      "7": { class_type: "CLIPTextEncode", inputs: { clip: ["4", 1], text: "text, words, letters, watermark, nsfw, ugly, blurry, bad anatomy, realistic photo, dark, scary, violence, low quality" } },
      "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
      "9": { class_type: "SaveImage", inputs: { filename_prefix: "vacippu", images: ["8", 0] } },
    };
    const queueRes = await fetch(`${COMFY_URL}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow }) });
    if (!queueRes.ok) return null;
    const { prompt_id } = await queueRes.json();
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const historyRes = await fetch(`${COMFY_URL}/history/${prompt_id}`);
      if (!historyRes.ok) continue;
      const history = await historyRes.json();
      const job = history[prompt_id];
      if (!job) continue;
      const outputs = job.outputs?.["9"]?.images;
      if (!outputs?.length) continue;
      const imgRes = await fetch(`${COMFY_URL}/view?filename=${outputs[0].filename}&subfolder=${outputs[0].subfolder}&type=${outputs[0].type}`);
      if (!imgRes.ok) return null;
      const bytes = new Uint8Array(await imgRes.arrayBuffer());
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      return `data:image/png;base64,${btoa(binary)}`;
    }
  } catch (e) { console.error("Image error:", e); }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { topic, language = "tamil", length = "medium", contentType = "reading" } = req.body;
    const languageDisplay = languageNames[language] || language;
    const lengthInstruction = lengthInstructions[contentType]?.[length] ?? lengthInstructions.reading.medium;
    const imageStyle = imageStyleByType[contentType] ?? imageStyleByType.reading;
    const contentTypeLabel = contentType === "reading" ? "educational reading passage" : contentType === "moral_story" ? "children's moral story" : "children's fable with talking animal characters";

    const englishRaw = await callOllama(
      `You are an award-winning children's author. You write imaginative, vivid, emotionally resonant stories. Every story feels original and alive. You always give characters memorable Tamil/Indian names.`,
      `Write a creative ${contentTypeLabel} about "${topic}" for children.\n\n${lengthInstruction}\n\nRequirements:\n- Give the main character a memorable Tamil or Indian name (Meena, Arjun, Kavya, Ravi, Priya, Muthukumar, Selvi, Karthik)\n- Choose an unexpected, delightful angle\n- Include at least 2 vivid sensory details\n- Vary sentence rhythm\n- NO clichés\n${contentType === "fable" ? "- Animals must have witty dialogue and distinct personalities\n- Moral emerges naturally\n" : ""}${contentType === "moral_story" ? "- Create genuine emotional tension before resolution\n- Moral must feel discovered not lectured\n" : ""}${contentType === "reading" ? "- Include one surprising fact about the topic\n- Use vivid comparisons children will love\n" : ""}\nReturn ONLY valid JSON, no markdown:\n{\n  "title": "catchy creative title",\n  "content": "the full story",\n  "keywords": ["word1", "word2", "word3", "word4", "word5"],\n  ${contentType !== "reading" ? '"moral": "one sentence moral",' : ""}\n  "image_prompt": "A ${imageStyle} showing [specific characters by name doing specific action], [setting with vivid colour details], cute cartoon children\'s book style, vibrant, warm, no text"\n}`
    );

    let englishContent: Record<string, unknown>;
    try { englishContent = parseJSON(englishRaw); }
    catch { throw new Error("Failed to generate story"); }

    let parsedContent: Record<string, unknown>;

    if (language === "english") {
      parsedContent = englishContent;
    } else {
      const scriptNote = language === "tamil" ? "தமிழ் script" : language === "hindi" || language === "marathi" ? "Devanagari script" : language === "telugu" ? "Telugu script" : language === "kannada" ? "Kannada script" : language === "malayalam" ? "Malayalam script" : language === "bengali" ? "Bengali script" : language === "gujarati" ? "Gujarati script" : language === "punjabi" ? "Gurmukhi script" : "correct native script";

      const translatedRaw = await callOllama(
        `You are a master literary translator for children's books. You translate into ${languageDisplay} like a native author. You NEVER use English or Sanskrit loanwords. You use only pure simple ${languageDisplay} that children aged 6-12 understand.`,
        `Translate this children's story into ${languageDisplay}.\n\nCRITICAL RULES:\n1. Use ONLY pure ${languageDisplay} words — NO English, NO Sanskrit loanwords\n2. Sound like it was originally written in ${languageDisplay} by a native author\n3. Simple everyday vocabulary children understand\n4. Keep emotional warmth and creativity\n5. Use correct script: ${scriptNote}\n6. Keywords must be real words from your translation\n7. Do NOT include image_prompt\n\nStory to translate:\nTitle: ${englishContent.title}\nContent: ${englishContent.content}\nKeywords: ${JSON.stringify(englishContent.keywords)}\n${contentType !== "reading" ? `Moral: ${englishContent.moral}` : ""}\n\nReturn ONLY valid JSON, no markdown:\n{\n  "title": "...",\n  "content": "...",\n  "keywords": ["...", "...", "...", "...", "..."]${contentType !== "reading" ? ',\n  "moral": "..."' : ""}\n}`
      );

      try {
        const translatedContent = parseJSON(translatedRaw);
        parsedContent = { ...translatedContent, image_prompt: englishContent.image_prompt };
      } catch {
        parsedContent = englishContent;
      }
    }

    const imagePrompt = (englishContent.image_prompt as string) ?? `A ${imageStyle} about ${topic}, cute cartoon style, vibrant colors, no text`;
    const image = await generateImage(imagePrompt);

    return res.status(200).json({ ...parsedContent, image });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}
