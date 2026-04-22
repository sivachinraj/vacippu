import type { VercelRequest, VercelResponse } from "@vercel/node";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GROQ_API_KEY = process.env.GROQ_API_KEY!;

function parseJSON(raw: string): Record<string, unknown> {
  const clean = raw.replace(/```json\n?|\n?```/g, "").trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found");
  return JSON.parse(match[0]);
}

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 2048 },
      }),
    }
  );
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GEMINI_ERROR:${err}`);
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("GEMINI_ERROR:empty response");
  return text;
}

async function callGroq(systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.9,
      max_tokens: 2048,
    }),
  });
  if (!response.ok) throw new Error(`Groq error: ${await response.text()}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callLLM(sys: string, usr: string): Promise<{ text: string; provider: string }> {
  try {
    const text = await callGemini(sys, usr);
    return { text, provider: "gemini" };
  } catch (geminiError: any) {
    console.warn("Gemini failed, falling back to Groq:", geminiError.message?.substring(0, 150));
    try {
      const text = await callGroq(sys, usr);
      return { text, provider: "groq" };
    } catch (groqError: any) {
      console.error("Both providers failed. Groq:", groqError.message?.substring(0, 100));
      throw new Error("All AI providers failed: " + groqError.message);
    }
  }
}

const languageNames: Record<string, string> = {
  tamil: "Tamil", hindi: "Hindi", english: "English", telugu: "Telugu",
  kannada: "Kannada", malayalam: "Malayalam", bengali: "Bengali",
  marathi: "Marathi", gujarati: "Gujarati", punjabi: "Punjabi",
};

const scriptNote: Record<string, string> = {
  tamil: "Tamil script (தமிழ்)", hindi: "Devanagari script", marathi: "Devanagari script",
  telugu: "Telugu script", kannada: "Kannada script", malayalam: "Malayalam script",
  bengali: "Bengali script", gujarati: "Gujarati script", punjabi: "Gurmukhi script",
};

const imageStyleByType: Record<string, string> = {
  reading: "colorful educational children's book illustration, bright cheerful scene",
  moral_story: "warm storybook illustration, expressive characters, soft golden lighting",
  fable: "classic fable illustration, anthropomorphic animals in natural setting, expressive faces",
};

// EXACT sentence counts per length per content type
const sentenceCounts: Record<string, Record<string, number>> = {
  reading:     { veryshort: 2, short: 4, medium: 6, long: 10 },
  moral_story: { veryshort: 3, short: 5, medium: 8, long: 13 },
  fable:       { veryshort: 3, short: 5, medium: 8, long: 13 },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { topic, language = "tamil", length = "medium", contentType = "reading" } = req.body;
    const languageDisplay = languageNames[language] ?? language;
    const script = scriptNote[language] ?? "native script";
    const imageStyle = imageStyleByType[contentType] ?? imageStyleByType.reading;
    const n = sentenceCounts[contentType]?.[length] ?? 6;

    const contentTypeLabel = contentType === "reading" ? "reading passage"
      : contentType === "moral_story" ? "moral story"
      : "fable with talking animals";

    const contentRule = contentType === "moral_story"
      ? `This is a MORAL STORY. The moral must emerge naturally from events. Never write "Moral:" separately — weave it into the ending.`
      : contentType === "fable"
      ? `This is a FABLE with talking animals. Each animal has a distinct personality. Include at least one line of dialogue. The moral comes from who the animals are.`
      : `This is a READING PASSAGE told as a story. Include one surprising fact about "${topic}". Use a vivid metaphor a child will love.`;

    const systemPrompt = language === "english"
      ? `You are an award-winning children's author. Write stories with emotional depth, vivid sensory details, and a clear narrative arc. Return ONLY valid JSON. No markdown.`
      : language === "tamil"
      ? `நீங்கள் ஒரு சிறந்த தமிழ் குழந்தை இலக்கிய எழுத்தாளர். இயல்பான, அழகான தமிழில் எழுதுங்கள். ஆங்கில சொற்கள் வேண்டாம். Valid JSON மட்டும். Markdown வேண்டாம்.`
      : `You are an expert children's author writing natively in ${languageDisplay}. Use only simple, everyday ${languageDisplay} words. No English words. Return ONLY valid JSON. No markdown.`;

    const userPrompt = language === "english"
      ? `Write a children's ${contentTypeLabel} about "${topic}" for children aged 6-12.

${contentRule}

CRITICAL: Write EXACTLY ${n} sentences. Count them. ${n} sentences exactly.

Requirements:
- Give the main character a Tamil or Indian name
- Every sentence connects to "${topic}"
- Include sensory details (smell, sound, touch)
- Emotional arc: character feels differently at the end

Return ONLY this JSON:
{
  "title": "specific creative title about ${topic}",
  "content": "exactly ${n} sentences",
  "keywords": ["word1", "word2", "word3", "word4", "word5"],
  ${contentType !== "reading" ? '"moral": "one sentence moral that emerges from the story",' : ""}
  "image_prompt": "A ${imageStyle} showing [specific character] [doing specific action], [vivid setting with colors], NO TEXT, NO LETTERS, NO WORDS anywhere in image"
}`
      : language === "tamil"
      ? `"${topic}" பற்றி குழந்தைகளுக்கான ${contentType === "moral_story" ? "நீதிக் கதை" : contentType === "fable" ? "விலங்குக் கதை" : "வாசிப்பு பகுதி"} எழுது.

${contentRule === "This is a MORAL STORY. The moral must emerge naturally from events. Never write "Moral:" separately — weave it into the ending." ? "நீதி கதையில் இருந்து இயல்பாக வர வேண்டும். "நீதி:" என்று தனியாக எழுதாதே." : contentRule === "This is a FABLE with talking animals. Each animal has a distinct personality. Include at least one line of dialogue. The moral comes from who the animals are." ? "விலங்குகள் பேசும் கதை. ஒவ்வொரு விலங்கும் தனித்துவமான குணம் கொண்டது. இயல்பான உரையாடல் சேர்." : `"${topic}" பற்றி கதையாக சொல். ஒரு ஆச்சரியமான உண்மை சேர்.`}

⚠️ மிக முக்கியம்: சரியாக ${n} வாக்கியங்கள் மட்டும். ${n}-ஐ விட அதிகமாகவோ குறைவாகவோ எழுதாதே.

JSON மட்டும்:
{
  "title": "தமிழில் தலைப்பு",
  "content": "சரியாக ${n} வாக்கியங்கள் மட்டும்",
  "keywords": ["சொல்1", "சொல்2", "சொல்3", "சொல்4", "சொல்5"],
  ${contentType !== "reading" ? '"moral": "தமிழில் ஒரு வாக்கியம்",' : ""}
  "image_prompt": "A ${imageStyle} showing [specific character] [doing specific action], [vivid setting], NO TEXT, NO LETTERS anywhere"
}`
      : `Write a children's ${contentTypeLabel} about "${topic}" in ${languageDisplay} using ${script}.

${contentRule}

CRITICAL: Write EXACTLY ${n} sentences. No English words. Only ${languageDisplay}.

Return ONLY this JSON:
{
  "title": "title in ${languageDisplay}",
  "content": "exactly ${n} sentences in ${languageDisplay}",
  "keywords": ["word1", "word2", "word3", "word4", "word5"],
  ${contentType !== "reading" ? `"moral": "one sentence moral in ${languageDisplay}",` : ""}
  "image_prompt": "A ${imageStyle} showing [specific character] [doing specific action], [vivid setting with colors], NO TEXT, NO LETTERS, NO WORDS anywhere in image"
}`;

    const { text: raw, provider } = await callLLM(systemPrompt, userPrompt);
    console.log(`Provider: ${provider} | lang: ${language} | length: ${length} (${n} sentences) | type: ${contentType}`);

    let parsedContent: Record<string, unknown>;
    try {
      parsedContent = parseJSON(raw);
    } catch {
      console.error("Parse failed. Raw:", raw.substring(0, 300));
      throw new Error("Failed to parse story response");
    }

    const imagePrompt = (parsedContent.image_prompt as string)
      ?? `A ${imageStyle} about ${topic}, vibrant colors, no text`;

    return res.status(200).json({
      ...parsedContent,
      image_prompt: imagePrompt,
      _provider: provider,
    });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}
