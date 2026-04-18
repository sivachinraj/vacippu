import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { imagePrompt } = req.body;
    const response = await fetch("https://api.together.xyz/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.TOGETHER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "black-forest-labs/FLUX.1-schnell-Free",
        prompt: imagePrompt + ", children's book illustration, vibrant colors, cute cartoon style, no text",
        width: 512,
        height: 512,
        steps: 4,
        n: 1,
      }),
    });

    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    const imageUrl = data.data?.[0]?.url;
    if (!imageUrl) throw new Error("No image returned");
    return res.status(200).json({ image: imageUrl });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}
