import type { VercelRequest, VercelResponse } from "@vercel/node";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { messages } = req.body;
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://vacippu.vercel.app",
        "X-Title": "Vacippu",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct:free",
        messages: [
          { role: "system", content: "You are a helpful Tamil children's reading assistant for the Vacippu app. Help children understand stories and explain words in simple Tamil. Be warm and age-appropriate for children aged 6-12." },
          ...messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) throw new Error(`OpenRouter error: ${await response.text()}`);
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    return res.status(200).json({ message: text });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}
