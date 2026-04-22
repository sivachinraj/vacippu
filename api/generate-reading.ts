import type { VercelRequest, VercelResponse } from "@vercel/node";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GROQ_API_KEY = process.env.GROQ_API_KEY!;

const languageNames: Record<string, string> = {
  tamil: "Tamil", hindi: "Hindi", english: "English", telugu: "Telugu",
  kannada: "Kannada", malayalam: "Malayalam", bengali: "Bengali",
  marathi: "Marathi", gujarati: "Gujarati", punjabi: "Punjabi",
};

const imageStyleByType: Record<string, string> = {
  reading: "colorful educational children's book illustration, bright cheerful scene",
  moral_story: "warm storybook illustration, expressive characters with emotions, soft golden lighting",
  fable: "classic fable illustration, anthropomorphic animals in lush natural setting, expressive faces",
};

// STRICT sentence counts - these are enforced in the prompt
const sentenceCounts: Record<string, Record<string, number>> = {
  reading:     { veryshort: 2, short: 3, medium: 5, long: 8 },
  moral_story: { veryshort: 2, short: 4, medium: 6, long: 10 },
  fable:       { veryshort: 2, short: 4, medium: 6, long: 10 },
};

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
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 1024 },
      }),
    }
  );
  if (!response.ok) {
    const err = await response.text();
    console.error("Gemini error:", err);
    throw new Error(`GEMINI_QUOTA:${err}`);
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) {
    console.error("Gemini returned empty:", JSON.stringify(data));
    throw new Error("GEMINI_QUOTA:empty response");
  }
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
      temperature: 0.75,
      max_tokens: 1024,
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("GEMINI_QUOTA") || msg.includes("429") || msg.includes("quota")) {
      console.warn("Gemini quota/empty — falling back to Groq");
      const text = await callGroq(sys, usr);
      return { text, provider: "groq" };
    }
    throw err;
  }
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
    const imageStyle = imageStyleByType[contentType] ?? imageStyleByType.reading;
    const n = sentenceCounts[contentType]?.[length] ?? 5;

    // Length label shown to user in UI
    const lengthLabel: Record<string, string> = {
      veryshort: "Very Short",
      short: "Short",
      medium: "Medium",
      long: "Long",
    };

    const systemPrompt = language === "tamil"
      ? `நீ குழந்தைகள் எழுத்தாளர். தமிழில் மட்டும் எழுது. உரைநடை விதிகள்:
- ஆனால், எனினும், அதனால், திடீரென்று, அப்போது என்ற இணைப்பு சொற்களை பயன்படுத்து
- வினையெச்சங்கள்: சென்று பார்த்தான், ஓடி வந்தாள்
- அவன் சென்றான் / அவள் சென்றாள் என்று சரியாக எழுது
- ஆங்கில சொற்கள் வேண்டாம்
- Valid JSON மட்டும். Markdown வேண்டாம்.`
      : `You are a children's author. Write naturally in ${languageDisplay}. Valid JSON only. No markdown.`;

    const contentRule = contentType === "moral_story"
      ? (language === "tamil" ? `நீதிக் கதை: நீதி கதையில் இருந்து இயல்பாக வர வேண்டும். "நீதி:" என்று தனியாக எழுதாதே.`
        : `Moral story: moral must emerge naturally from events. Never state it separately.`)
      : contentType === "fable"
      ? (language === "tamil" ? `நீதிக்கதை: விலங்குகள் பேசும் கதை. இயல்பான உரையாடல் சேர்.`
        : `Fable with talking animals. Include natural dialogue.`)
      : (language === "tamil" ? `வாசிப்பு பகுதி: கதையாக சொல். ஒரு ஆச்சரியமான உண்மை சேர்.`
        : `Reading passage: tell as a story. Include one surprising fact.`);

    const userPrompt = language === "tamil"
      ? `"${topic}" பற்றி குழந்தைகளுக்கான ${contentType === "moral_story" ? "நீதிக் கதை" : contentType === "fable" ? "நீதிக்கதை" : "வாசிப்பு பகுதி"} எழுது.

${contentRule}

⚠️ மிக முக்கியம்: சரியாக ${n} வாக்கியங்கள் மட்டும். ${n}-ஐ விட அதிகமாகவோ குறைவாகவோ எழுதாதே.

JSON மட்டும்:
{
  "title": "தமிழில் தலைப்பு",
  "content": "சரியாக ${n} வாக்கியங்கள் மட்டும் கொண்ட கதை",
  "keywords": ["சொல்1", "சொல்2", "சொல்3", "சொல்4", "சொல்5"],
  ${contentType !== "reading" ? '"moral": "தமிழில் ஒரு வாக்கியம்",' : ""}
  "image_prompt": "A ${imageStyle} of [character] doing [action] in [setting], no text, no words"
}`
      : `Write a ${contentType === "reading" ? "reading passage" : contentType === "moral_story" ? "moral story" : "fable"} about "${topic}" for children aged 6-12.

${contentRule}

⚠️ CRITICAL LENGTH RULE: Write EXACTLY ${n} sentences. Not ${n+1}. Not ${n-1}. Exactly ${n}.
Count every sentence before submitting. If you have more than ${n}, delete sentences until you have exactly ${n}.

Return ONLY this JSON:
{
  "title": "specific title about ${topic}",
  "content": "exactly ${n} sentences — count them",
  "keywords": ["word1", "word2", "word3", "word4", "word5"],
  ${contentType !== "reading" ? `"moral": "one sentence that emerges from the story",` : ""}
  "image_prompt": "A ${imageStyle} of [specific character] doing [specific action from story] in [setting], no text, no words, no letters"
}`;

    const { text: raw, provider } = await callLLM(systemPrompt, userPrompt);
    console.log(`Provider: ${provider}, length: ${length} (${n} sentences), lang: ${language}`);

    let parsedContent: Record<string, unknown>;
    try {
      parsedContent = parseJSON(raw);
    } catch {
      console.error("Parse failed. Raw:", raw.substring(0, 500));
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
