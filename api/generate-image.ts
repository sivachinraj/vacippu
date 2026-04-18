import type { VercelRequest, VercelResponse } from "@vercel/node";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchFromPollinations(imagePrompt: string, attempt = 0): Promise<string | null> {
  const encoded = encodeURIComponent(imagePrompt + ", children's book illustration, vibrant colors, cute cartoon style, no text");
  const seed = Math.floor(Math.random() * 999999);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&nologo=true&seed=${seed}`;

  const res = await fetch(url);
  if (!res.ok) {
    if (attempt < 2) {
      await sleep(1500 * (attempt + 1)); // 1.5s, then 3s
      return fetchFromPollinations(imagePrompt, attempt + 1);
    }
    return null;
  }
  const buffer = await res.arrayBuffer();
  return `data:image/jpeg;base64,${Buffer.from(buffer).toString("base64")}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { imagePrompt } = req.body;
    const image = await fetchFromPollinations(imagePrompt);
    if (!image) return res.status(500).json({ error: "Image generation failed after retries" });
    return res.status(200).json({ image });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}
