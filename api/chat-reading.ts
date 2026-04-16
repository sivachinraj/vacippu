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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { messages } = req.body;
    const lastUserMsg = messages[messages.length - 1]?.content ?? "";

    // Detect if user wants a story/reading generated
    const isGenerationRequest = /create|generate|write|make|give me|story|fable|reading|passage|கதை|எழுது|உருவாக்கு/i.test(lastUserMsg);

    if (isGenerationRequest) {
      // Generate a full structured reading
      const storyPrompt = `You are an expert children's author. The user has requested: "${lastUserMsg}"

Analyze their request and generate a complete children's reading based on what they described.
- Detect the language from their request (Tamil, English, Hindi, etc.)
- Detect the content type (reading passage, moral story, or fable)
- Use an appropriate length (medium: 5-7 sentences)
- Write entirely in the requested language with native script
- Be creative, meaningful, and age-appropriate for children 6-12

Return ONLY valid JSON, no markdown:
{
  "title": "title in the requested language",
  "content": "full story/passage in the requested language",
  "keywords": ["word1", "word2", "word3", "word4", "word5"],
  "moral": "one sentence moral (omit if reading passage)",
  "language": "detected language code (tamil/english/hindi/telugu etc)",
  "contentType": "reading or moral_story or fable",
  "image_prompt": "A colorful children's book illustration showing the key scene, cute cartoon style, vibrant, warm, no text"
}`;

      const raw = await callGroq([{ role: "user", content: storyPrompt }], 2048);
      
      let reading: Record<string, unknown>;
      try {
        reading = parseJSON(raw);
      } catch {
        // If JSON parse fails, fall back to regular chat
        const chatText = await callGroq([
          { role: "system", content: "You are a helpful Tamil children's reading assistant. Be warm and age-appropriate for children aged 6-12." },
          ...messages,
        ]);
        return res.status(200).json({ message: chatText });
      }

      // Trigger image generation in background (fire and forget)
      if (reading.image_prompt) {
        fetch(`${req.headers.origin || "https://vacippu.vercel.app"}/api/generate-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imagePrompt: reading.image_prompt }),
        }).catch(() => {});
      }

      return res.status(200).json({
        message: `✨ I've created your reading! Check it out above 👆`,
        reading: {
          title: reading.title,
          content: reading.content,
          keywords: Array.isArray(reading.keywords) ? reading.keywords : [],
          language: reading.language || "tamil",
          contentType: reading.contentType || "reading",
          image: null,
        },
      });
    }

    // Regular chat response
    const chatText = await callGroq([
      { role: "system", content: "You are a helpful Tamil children's reading assistant for the Vacippu app. Help children understand stories and explain words. Be warm and age-appropriate for children aged 6-12." },
      ...messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
    ]);

    return res.status(200).json({ message: chatText });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}
