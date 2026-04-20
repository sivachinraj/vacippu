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

const sentenceCounts: Record<string, Record<string, number>> = {
  reading:     { veryshort: 2, short: 4, medium: 6, long: 10 },
  moral_story: { veryshort: 3, short: 5, medium: 8, long: 14 },
  fable:       { veryshort: 3, short: 5, medium: 8, long: 14 },
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
        generationConfig: { temperature: 0.9, maxOutputTokens: 2048 },
      }),
    }
  );
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GEMINI_QUOTA:${err}`);
  }
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callGroq(systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      temperature: 0.75,
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("GEMINI_QUOTA") || msg.includes("429") || msg.includes("quota")) {
      console.warn("Gemini quota — falling back to Groq");
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
    const numSentences = sentenceCounts[contentType]?.[length] ?? 6;

    const grammarRules: Record<string, string> = {
      tamil: `TAMIL GRAMMAR RULES — mandatory:
- Write entirely in Tamil script (தமிழ்). Zero English words.
- Use compound sentences joined by: ஆனால், எனினும், அதனால், எனவே, திடீரென்று, அப்போது, மகிழ்ச்சியுடன்
- Verb-subject agreement: அவன் சென்றான் / அவள் சென்றாள் / அது சென்றது
- Verbal participles for flow: சென்று பார்த்தான், ஓடி வந்தாள், மலர்ந்து சிரித்தாள்
- Include at least ONE line of natural dialogue
- Use sensory details: smell (மணம்), sound (சத்தம்), touch (தொட்டாள்)
- NEVER start two consecutive sentences with the same word
- Mix short punchy sentences with long flowing ones`,
      hindi: `HINDI RULES: Write in Devanagari. Use compound sentences with जब...तब, हालांकि, इसलिए, तभी. Include dialogue. Vary sentence length.`,
      default: `Write entirely in correct native script. Use compound sentences with natural connectors. Include dialogue. Vary sentence length.`,
    };

    const systemPrompt = `You are one of the world's finest children's authors, writing natively in ${languageDisplay} with a poet's soul.

${grammarRules[language] ?? grammarRules.default}

DEAD writing (FORBIDDEN):
"கண்ணன் மரத்தைப் பார்த்தான். இலைகள் பச்சையாக இருந்தன. பறவை பாடியது. அவன் சென்றான்."
— Camera shots. No emotion. No connection. NEVER write like this.

LIVING writing (REQUIRED):
"மரத்தின் நிழலில் நின்ற கண்ணனுக்கு, திடீரென்று ஒரு பறவையின் குரல் காதில் விழுந்தது — அது அவன் அம்மாவின் தாலாட்டைப் போல் இனிமையாக இருந்தது; அந்த நொடியில், அவன் மனதில் இருந்த கவலை மெல்ல மெல்ல கரைந்து போனது."
— One flowing thought. Emotion. Metaphor. Transformation.

EVERY STORY NEEDS:
1. A CHARACTER with a specific desire connected to the topic
2. A TURNING POINT — something changes
3. SENSORY DETAILS beyond just sight
4. EMOTIONAL ARC — character feels differently at the end
5. At least one metaphor that surprises and delights

Return ONLY valid JSON. No markdown. No preamble.`;

    const contentSpecific = contentType === "moral_story"
      ? `MORAL STORY: The moral must be LIVED, not stated. End with a moment that makes the reader FEEL the moral. NEVER write "நீதி:" separately.`
      : contentType === "fable"
      ? `FABLE: Each animal's personality drives every decision. Include natural dialogue. Moral emerges from who the animals ARE.`
      : `READING PASSAGE: Still tell a story. Include one surprising fact about "${topic}". Use a metaphor that makes it beautiful for a child.`;

    const userPrompt = `Write a children's story about: "${topic}"

${contentSpecific}

EXACTLY ${numSentences} sentences. Each flows into the next like water.

Decide silently before writing:
→ What does the character desperately want?
→ What stops or surprises them?
→ What is the most beautiful image in this story?
→ How does it end with warmth and completeness?

FAILS IF: any sentence is removable, no emotional moment, topic disappears, mechanical moral, English words used.
SUCCEEDS IF: child feels something real, every sentence pulls forward, language is naturally beautiful.

Return ONLY this JSON:
{
  "title": "poetic specific title in ${languageDisplay}",
  "content": "complete ${numSentences}-sentence story in ${languageDisplay}, flowing like prose-poetry",
  "keywords": ["word1", "word2", "word3", "word4", "word5"],
  ${contentType !== "reading" ? `"moral": "one beautiful sentence in ${languageDisplay} — natural truth discovered, not a command",` : ""}
  "image_prompt": "A ${imageStyle} capturing the most emotional moment: [character], [expression], [action], [setting with colors and light], no text, no words, no letters"
}`;

    const { text: raw, provider } = await callLLM(systemPrompt, userPrompt);
    console.log(`Provider: ${provider}`);

    let parsedContent: Record<string, unknown>;
    try {
      parsedContent = parseJSON(raw);
    } catch {
      console.error("Parse failed:", raw);
      throw new Error("Failed to parse story");
    }

    const imagePrompt = (parsedContent.image_prompt as string) ?? `A ${imageStyle} about ${topic}, vibrant colors, no text`;
    return res.status(200).json({ ...parsedContent, image_prompt: imagePrompt, _provider: provider });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}
