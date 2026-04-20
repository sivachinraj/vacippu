import type { VercelRequest, VercelResponse } from "@vercel/node";

const GROQ_API_KEY = process.env.GROQ_API_KEY!;

const languageNames: Record<string, string> = {
  tamil: "Tamil", hindi: "Hindi", english: "English", telugu: "Telugu",
  kannada: "Kannada", malayalam: "Malayalam", bengali: "Bengali",
  marathi: "Marathi", gujarati: "Gujarati", punjabi: "Punjabi",
};

const lengthInstructions: Record<string, Record<string, string>> = {
  reading: {
    veryshort: "Write exactly 2 sentences. Must be complete and meaningful.",
    short: "Write exactly 4 sentences. Each sentence must connect to the next.",
    medium: "Write exactly 6 sentences forming a complete, meaningful passage.",
    long: "Write exactly 10 sentences forming a detailed, rich passage.",
  },
  moral_story: {
    veryshort: "Write exactly 3 sentences: setup, conflict, resolution with moral.",
    short: "Write exactly 5 sentences: introduce character with problem, build tension, resolve it, state moral clearly.",
    medium: "Write exactly 7 sentences: vivid introduction, clear problem, rising tension, turning point, resolution, moral revealed naturally.",
    long: "Write exactly 12 sentences: rich character introduction, detailed problem, multiple attempts, climax, warm resolution, timeless moral.",
  },
  fable: {
    veryshort: "Write exactly 3 sentences: two animal characters, conflict, moral twist.",
    short: "Write exactly 5 sentences: introduce two contrasting animal characters, conflict between them, clever resolution, moral.",
    medium: "Write exactly 7 sentences: vivid animal characters with personalities, dialogue, conflict, clever resolution, moral.",
    long: "Write exactly 12 sentences: rich animal world, distinct personalities, dialogue, escalating conflict, surprising resolution, moral.",
  },
};

const imageStyleByType: Record<string, string> = {
  reading: "colorful educational children's book illustration, bright cheerful scene",
  moral_story: "warm storybook illustration, expressive characters with emotions, soft golden lighting",
  fable: "classic fable illustration, anthropomorphic animals in lush natural setting, expressive faces",
};

async function callGroq(messages: {role: string, content: string}[], max_tokens = 4096): Promise<string> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.7,
      max_tokens,
    }),
  });
  if (!response.ok) throw new Error(`Groq error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
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

    const scriptNote = language === "tamil" ? "Tamil script (தமிழ்)"
      : language === "hindi" || language === "marathi" ? "Devanagari script"
      : language === "telugu" ? "Telugu script"
      : language === "kannada" ? "Kannada script"
      : language === "malayalam" ? "Malayalam script"
      : language === "bengali" ? "Bengali script"
      : language === "gujarati" ? "Gujarati script"
      : language === "punjabi" ? "Gurmukhi script"
      : "correct native script";

    const systemPrompt = language === "english"
      ? `You are an award-winning children's author. You write stories that are:
- COHERENT: every sentence connects logically to the next
- PURPOSEFUL: every detail serves the story
- EMOTIONALLY RESONANT: readers feel something
- COMPLETE: clear beginning, middle, end
- CREATIVE: unexpected angles, vivid details, memorable characters

You NEVER write random disconnected sentences. Every story has a clear narrative thread.`
      : `You are a master children's author who writes directly and natively in ${languageDisplay}.

Your ${languageDisplay} writing is:
- COHERENT: every sentence flows naturally from the previous one
- PURPOSEFUL: every detail serves the central story
- AUTHENTIC: sounds like it was born in ${languageDisplay}, not translated
- COMPLETE: clear beginning, middle, satisfying end
- CREATIVE: unexpected angles, vivid sensory details

You NEVER write random disconnected sentences. Every story has ONE clear narrative thread from start to finish.
You use everyday ${languageDisplay} vocabulary — simple, natural, beautiful.
You write in ${scriptNote}.`;

    const userPrompt = language === "english"
      ? `Write a ${contentTypeLabel} about "${topic}" for children aged 6-12.

NARRATIVE RULES (follow strictly):
${lengthInstruction}
- The story must have ONE clear narrative thread — every sentence must connect to the topic "${topic}"
- Give the main character a Tamil or Indian name (Meena, Arjun, Kavya, Ravi, Priya, Muthukumar, Selvi, Karthik, Anbu, Valli)
- Every sentence must logically follow from the previous one
- NO random details that don't serve the story
- NO sentence should feel out of place
${contentType === "moral_story" ? `- The moral must emerge NATURALLY from what happens in the story
- Do NOT state the moral as a separate lesson — weave it into the ending` : ""}
${contentType === "fable" ? `- Animals must have distinct, consistent personalities throughout
- Include at least one line of dialogue
- The moral must come from the story events, not be tacked on` : ""}
${contentType === "reading" ? `- Include one specific, interesting fact about "${topic}"
- Use a vivid comparison or metaphor children will love` : ""}

Return ONLY valid JSON, no markdown, no extra text:
{
  "title": "creative, specific title about ${topic}",
  "content": "the complete coherent story",
  "keywords": ["5 key words actually used in the story"],
  ${contentType !== "reading" ? '"moral": "one clear sentence that emerges from the story",' : ""}
  "image_prompt": "A ${imageStyle} showing [specific named character] [doing specific action from the story climax], [vivid setting details], no text, no words"
}`
      : `Write a ${contentTypeLabel} about "${topic}" for children aged 6-12, written entirely in ${languageDisplay}.

NARRATIVE RULES (follow strictly):
${lengthInstruction}
- The ENTIRE story must be about "${topic}" from first sentence to last
- Every sentence must logically and naturally follow from the previous one
- Give the main character a name that sounds natural in ${languageDisplay}
- Use ONLY simple everyday ${languageDisplay} words — NO English words, NO Sanskrit loanwords
- Write in ${scriptNote}
- NO random details — every sentence must serve the "${topic}" story
${contentType === "moral_story" ? `- The moral must emerge NATURALLY from the events of the story
- End with a moment that makes the moral obvious without stating it mechanically` : ""}
${contentType === "fable" ? `- Give each animal a distinct personality that stays consistent
- Include natural-sounding dialogue in ${languageDisplay}
- The moral must come organically from what happens` : ""}

Return ONLY valid JSON, no markdown, no extra text:
{
  "title": "creative title in ${languageDisplay} about ${topic}",
  "content": "the complete coherent story in ${languageDisplay}",
  "keywords": ["5 words actually used in the story in ${languageDisplay}"],
  ${contentType !== "reading" ? `"moral": "one clear sentence in ${languageDisplay} that emerges from the story",` : ""}
  "image_prompt": "A ${imageStyle} showing [specific character] [doing specific action from story], [vivid setting], no text, no words"
}`;

    const raw = await callGroq([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    let parsedContent: Record<string, unknown>;
    try {
      parsedContent = parseJSON(raw);
    } catch {
      console.error("Failed to parse response:", raw);
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
