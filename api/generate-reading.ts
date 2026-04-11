import type { VercelRequest, VercelResponse } from "@vercel/node";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
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

async function callGemini(prompt: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 2048 },
      }),
    }
  );
  if (!response.ok) throw new Error(`Gemini error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

function parseJSON(raw: string): Record<string, unknown> {
  const clean = raw.replace(/```json\n?|\n?```/g, "").trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found");
  return JSON.parse(match[0]);
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
    const contentTypeLabel = contentType === "reading" ? "educational reading passage"
      : contentType === "moral_story" ? "children's moral story"
      : "children's fable with talking animal characters";

    const scriptNote = language === "tamil" ? "தமிழ் script"
      : language === "hindi" || language === "marathi" ? "Devanagari script"
      : language === "telugu" ? "Telugu script"
      : language === "kannada" ? "Kannada script"
      : language === "malayalam" ? "Malayalam script"
      : language === "bengali" ? "Bengali script"
      : language === "gujarati" ? "Gujarati script"
      : language === "punjabi" ? "Gurmukhi script"
      : "correct native script";

    const prompt = language === "english"
      ? `You are an award-winning children's author. Write a creative ${contentTypeLabel} about "${topic}" for children.

${lengthInstruction}

Requirements:
- Give the main character a memorable Tamil or Indian name (Meena, Arjun, Kavya, Ravi, Priya, Muthukumar, Selvi, Karthik)
- Choose an unexpected, delightful angle
- Include at least 2 vivid sensory details
- NO clichés
${contentType === "fable" ? "- Animals must have witty dialogue and distinct personalities\n- Moral emerges naturally" : ""}
${contentType === "moral_story" ? "- Create genuine emotional tension\n- Moral must feel discovered not lectured" : ""}
${contentType === "reading" ? "- Include one surprising fact\n- Use vivid comparisons children will love" : ""}

Return ONLY valid JSON, no markdown:
{
  "title": "catchy title",
  "content": "the full ${contentType === "reading" ? "passage" : "story"}",
  "keywords": ["word1", "word2", "word3", "word4", "word5"],
  ${contentType !== "reading" ? '"moral": "one sentence moral",' : ""}
  "image_prompt": "A ${imageStyle} showing [specific characters by name doing specific action], [setting with vivid colour details], cute cartoon children's book style, vibrant, warm, no text"
}`
      : `You are an award-winning children's author and expert translator. Write a creative ${contentTypeLabel} about "${topic}" directly in ${languageDisplay}.

${lengthInstruction}

Requirements:
- Write ENTIRELY in ${languageDisplay} using ${scriptNote}
- Give the main character a memorable name that sounds natural in ${languageDisplay}
- Use ONLY pure ${languageDisplay} words — NO English, NO Sanskrit loanwords
- Write as if originally composed in ${languageDisplay} by a native author
- Simple everyday vocabulary children aged 6-12 understand
- Choose an unexpected, delightful angle
- Include at least 2 vivid sensory details
- NO clichés
${contentType === "fable" ? "- Animals must have witty dialogue\n- Moral emerges naturally" : ""}
${contentType === "moral_story" ? "- Create genuine emotional tension\n- Moral must feel discovered not lectured" : ""}

Also write:
- image_prompt in ENGLISH describing the key scene

Return ONLY valid JSON, no markdown:
{
  "title": "title in ${languageDisplay}",
  "content": "story in ${languageDisplay}",
  "keywords": ["word1 in ${languageDisplay}", "word2", "word3", "word4", "word5"],
  ${contentType !== "reading" ? '"moral": "moral in ' + languageDisplay + '",' : ""}
  "image_prompt": "A ${imageStyle} showing [specific characters doing specific action], [setting with vivid colour details], cute cartoon children's book style, vibrant, warm, no text"
}`;

    const raw = await callGemini(prompt);

    let parsedContent: Record<string, unknown>;
    try {
      parsedContent = parseJSON(raw);
    } catch {
      console.error("Failed to parse Gemini response:", raw);
      throw new Error("Failed to generate story");
    }

    const imagePrompt = (parsedContent.image_prompt as string)
      ?? `A ${imageStyle} about ${topic}, cute cartoon style, vibrant colors, no text`;

    return res.status(200).json({ ...parsedContent, image_prompt: imagePrompt });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}
