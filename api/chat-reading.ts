import type { VercelRequest, VercelResponse } from "@vercel/node";

const GROQ_API_KEY = process.env.GROQ_API_KEY!;

function parseJSON(raw: string): Record<string, unknown> {
  const clean = raw.replace(/```json\n?|\n?```/g, "").trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found");
  return JSON.parse(match[0]);
}

async function callGroq(messages: {role: string, content: string}[], max_tokens = 1024): Promise<string> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages, temperature: 0.9, max_tokens }),
  });
  if (!response.ok) throw new Error(`Groq error: ${await response.text()}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function fetchImage(imagePrompt: string): Promise<string | null> {
  try {
    const encoded = encodeURIComponent(imagePrompt + ", children's book illustration, vibrant colors, cute cartoon style, no text");
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&nologo=true&seed=${Math.floor(Math.random() * 999999)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    return `data:image/jpeg;base64,${Buffer.from(buffer).toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { messages } = req.body;
    const lastUserMsg = messages[messages.length - 1]?.content ?? "";
    const isGenerationRequest = /create|generate|write|make|give me|story|fable|reading|passage|கதை|எழுது|உருவாக்கு/i.test(lastUserMsg);

    if (isGenerationRequest) {
      const storyPrompt = `You are an expert children's author. The user has requested: "${lastUserMsg}"

Generate a complete children's reading based on what they described.
- Detect the language from their request (Tamil, English, Hindi, etc.)
- Detect the content type (reading passage, moral story, or fable)
- Write 5-7 sentences, entirely in the requested language with native script
- Use standard everyday language, NOT literary/archaic words
- Be creative, meaningful, and age-appropriate for children 6-12
- For image_prompt: describe EXACTLY the specific characters from THIS story doing their specific action — never use generic animals

Return ONLY valid JSON, no markdown:
{
  "title": "title in the requested language",
  "content": "full story in the requested language",
  "keywords": ["word1", "word2", "word3", "word4", "word5"],
  "moral": "one sentence moral (omit if reading passage)",
  "language": "tamil/english/hindi/telugu etc",
  "contentType": "reading or moral_story or fable",
  "image_prompt": "cartoon children's book illustration of [exact characters from story] doing [exact action from story], colorful, vibrant, no text"
}`;

      // Run story generation first, then image in parallel
      const raw = await callGroq([{ role: "user", content: storyPrompt }], 4096);

      let reading: Record<string, unknown>;
      try {
        reading = parseJSON(raw);
      } catch {
        const chatText = await callGroq([
          { role: "system", content: "You are a helpful Tamil children's reading assistant. Be warm and age-appropriate for children aged 6-12." },
          ...messages,
        ]);
        return res.status(200).json({ message: chatText });
      }

      // Fetch image in parallel now that we have the prompt
      const image = reading.image_prompt
        ? await fetchImage(reading.image_prompt as string)
        : null;

      return res.status(200).json({
        message: `✨ I've created your reading! Check it out above 👆`,
        reading: {
          title: reading.title,
          content: reading.content,
          keywords: Array.isArray(reading.keywords) ? reading.keywords : [],
          language: reading.language || "tamil",
          contentType: reading.contentType || "reading",
          image,
        },
      });
    }

    // Regular chat
    const chatText = await callGroq([
      { role: "system", content: "You are a helpful Tamil children's reading assistant for the Vacippu app. Help children understand stories and explain words. Be warm and age-appropriate for children aged 6-12." },
      ...messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
    ]);
    return res.status(200).json({ message: chatText });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}
