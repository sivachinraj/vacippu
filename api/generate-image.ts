import type { VercelRequest, VercelResponse } from "@vercel/node";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchFromPollinations(imagePrompt: string): Promise<string | null> {
  const suffix = ", children's book illustration, vibrant colors, cute cartoon style, no text";
  const encoded = encodeURIComponent(imagePrompt + suffix);
  const seed = Math.floor(Math.random() * 9999999);

  // Try multiple Pollinations models/endpoints in rotation
  const urls = [
    `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&nologo=true&seed=${seed}&model=flux`,
    `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&nologo=true&seed=${seed}&model=flux-realism`,
    `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&nologo=true&seed=${seed}&model=flux-anime`,
    `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&nologo=true&seed=${seed}&model=turbo`,
  ];

  for (let i = 0; i < urls.length; i++) {
    try {
      if (i > 0) await sleep(800);
      const res = await fetch(urls[i], { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        return `data:image/jpeg;base64,${Buffer.from(buffer).toString("base64")}`;
      }
    } catch { continue; }
  }
  return null;
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
    if (!image) return res.status(500).json({ error: "Image generation failed" });
    return res.status(200).json({ image });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}
